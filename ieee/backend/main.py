import os
import io
import csv
import json
import time
import asyncio
import base64
import logging
import threading
import platform
from datetime import datetime, timezone
from pathlib import Path
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse

from vision import VisionPipeline
from supabase_client import (
    get_reports, insert_report, get_alerts, insert_alert,
    get_contacts, upsert_contact, delete_contact,
    get_settings, save_setting, upload_snapshot,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vibrasense")


def _sanitize(obj):
    """Recursively convert numpy types to native Python types for JSON."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj

# ── Globals ──────────────────────────────────────────
pipeline: VisionPipeline = None
source_type = "webcam"  # "webcam", "video", or "ipcam"
video_path = None
ipcam_url = None
cap: cv2.VideoCapture = None
server_start_time = time.time()
total_frames_processed = 0
danger_start_time = None
DANGER_DURATION_THRESHOLD = 3  # seconds

# ── Shared frame state for MJPEG streaming ───────────
_latest_jpeg = None
_latest_jpeg_lock = threading.Lock()

# ── Performance timing ───────────────────────────────
_perf_capture_ms = 0.0
_perf_stabilize_ms = 0.0
_perf_inference_ms = 0.0
_perf_encode_ms = 0.0
_perf_fps = 0.0


# ── Threaded Frame Grabber ───────────────────────────
class FrameGrabber:
    """Background thread that continuously grabs the latest frame
    from a video source, eliminating buffer lag. Works for webcam,
    IP camera, and video file sources."""

    def __init__(self, source, is_video=False):
        self.source = source
        self.is_video = is_video
        self.latest_frame = None
        self.running = False
        self.lock = threading.Lock()
        self.thread = None
        self.cap = None

    def start(self):
        # Open capture with optimized settings
        if isinstance(self.source, int):
            # Webcam — use DirectShow on Windows for lower latency
            if platform.system() == "Windows":
                self.cap = cv2.VideoCapture(self.source, cv2.CAP_DSHOW)
            else:
                self.cap = cv2.VideoCapture(self.source)
        else:
            self.cap = cv2.VideoCapture(self.source)

        if not self.cap.isOpened():
            return False

        # Minimize internal buffer to get the freshest frame
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        # Request MJPEG codec for hardware-decoded frames (avoids YUV→BGR in software)
        if isinstance(self.source, int):
            self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            self.cap.set(cv2.CAP_PROP_FPS, 30)
        # Set reasonable resolution for speed
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        self.running = True
        self.thread = threading.Thread(target=self._reader_loop, daemon=True)
        self.thread.start()
        return True

    def _reader_loop(self):
        while self.running:
            try:
                if self.is_video:
                    ret, frame = self.cap.read()
                    if not ret:
                        # Loop video
                        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret, frame = self.cap.read()
                        if not ret:
                            time.sleep(0.01)
                            continue
                else:
                    # grab() + retrieve() skips stale buffered frames
                    grabbed = self.cap.grab()
                    if grabbed:
                        ret, frame = self.cap.retrieve()
                        if not ret or frame is None:
                            time.sleep(0.005)
                            continue
                    else:
                        # Stream lost — try to reconnect for IP cameras
                        if isinstance(self.source, str):
                            self.cap.release()
                            time.sleep(2)
                            self.cap = cv2.VideoCapture(self.source)
                            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        else:
                            time.sleep(0.005)
                        continue

                # Resize to standard width for consistent processing
                if frame is not None:
                    h, w = frame.shape[:2]
                    if w > 640:
                        new_w = 640
                        new_h = int(h * (new_w / w))
                        frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
                    with self.lock:
                        self.latest_frame = frame

                # Small sleep to prevent CPU spinning on video files
                if self.is_video:
                    time.sleep(0.025)  # ~40fps cap for video files

            except Exception:
                time.sleep(0.01)
                continue

    def read(self):
        with self.lock:
            # Return frame directly — grabber thread overwrites its own reference,
            # so the returned numpy array is safe to use until next read()
            return self.latest_frame if self.latest_frame is not None else None

    def stop(self):
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)
        if self.cap:
            self.cap.release()
        self.latest_frame = None


# Active frame grabber instance
frame_grabber: FrameGrabber = None

# Legacy IPCamReader kept as alias for backward compat
IPCamReader = FrameGrabber
ipcam_reader: FrameGrabber = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline, frame_grabber
    logger.info("Starting VibraSense AI backend...")

    import torch
    if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"

    pipeline = VisionPipeline(device=device)
    # Load settings from Supabase
    try:
        settings = get_settings()
        pipeline.warning_threshold = float(settings.get("warning_threshold", 0.3))
        pipeline.danger_threshold = float(settings.get("danger_threshold", 0.7))
        pipeline.stabilization_enabled = settings.get("stabilization_enabled", "true") == "true"
    except Exception as e:
        logger.warning(f"Could not load settings: {e}")

    # Start default webcam grabber
    frame_grabber = FrameGrabber(0)
    if frame_grabber.start():
        logger.info("Webcam frame grabber started (threaded)")
    else:
        logger.warning("Could not open webcam — will use black frame fallback")
        frame_grabber = None

    logger.info("VibraSense AI backend ready")
    yield
    logger.info("Shutting down VibraSense AI backend")
    if frame_grabber:
        frame_grabber.stop()


app = FastAPI(title="VibraSense AI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


# ── Page Routes ──────────────────────────────────────
@app.get("/")
async def serve_landing():
    return FileResponse(FRONTEND_DIR / "index.html")

@app.get("/favicon.ico", include_in_schema=False)
async def serve_favicon():
    return FileResponse(FRONTEND_DIR / "assets" / "favicon.ico")

@app.get("/dashboard")
async def serve_dashboard():
    return FileResponse(FRONTEND_DIR / "dashboard.html")


# ── Dashboard Stats ──────────────────────────────────
@app.get("/api/dashboard")
async def get_dashboard():
    return {
        "status": "online",
        "source": source_type,
        "uptime": round(time.time() - server_start_time, 1),
        "total_frames": total_frames_processed,
        "fastapi_connected": True,
        "supabase_connected": True,
        "device": pipeline.device if pipeline else "unknown",
        "model": "yolov8n",
    }


# ── Source Switching ─────────────────────────────────
@app.post("/api/source")
async def switch_source(body: dict):
    global source_type, video_path, cap, ipcam_url, ipcam_reader, frame_grabber
    src = body.get("type", "webcam")
    source_type = src

    # Stop current frame grabber
    if frame_grabber is not None:
        frame_grabber.stop()
        frame_grabber = None

    if src == "video":
        video_data = body.get("video_data")
        if video_data:
            # Base64 video data — save to temp
            raw = base64.b64decode(video_data.split(",")[-1] if "," in video_data else video_data)
            tmp_path = "/tmp/vibrasense_video.mp4"
            with open(tmp_path, "wb") as f:
                f.write(raw)
            video_path = tmp_path
        elif body.get("path"):
            video_path = body["path"]

        if cap is not None:
            cap.release()
        cap = None  # Not used anymore — frame_grabber handles it

        frame_grabber = FrameGrabber(video_path, is_video=True)
        if not frame_grabber.start():
            frame_grabber = None
            return {"status": "error", "message": "Could not open video file"}
        pipeline.reset()

    elif src == "ipcam":
        url = body.get("url", "")
        if not url:
            return {"status": "error", "message": "No URL provided"}
        ipcam_url = url
        # Stop any existing ip cam reader
        if ipcam_reader is not None:
            ipcam_reader.stop()
        if cap is not None:
            cap.release()
            cap = None

        frame_grabber = FrameGrabber(ipcam_url)
        ipcam_reader = frame_grabber  # backward compat
        if not frame_grabber.start():
            logger.warning(f"Could not open IP cam stream: {ipcam_url}")
            frame_grabber = None
            ipcam_reader = None
            return {"status": "error", "message": "Could not connect to IP camera stream"}
        pipeline.reset()
        logger.info(f"IP camera connected (threaded grabber): {ipcam_url}")

    else:
        source_type = "webcam"
        video_path = None
        ipcam_url = None
        if ipcam_reader is not None:
            ipcam_reader.stop()
            ipcam_reader = None
        if cap is not None:
            cap.release()
            cap = None

        frame_grabber = FrameGrabber(0)
        if not frame_grabber.start():
            frame_grabber = None
        pipeline.reset()

    return {"status": "ok", "source": source_type}


# ── Reports ──────────────────────────────────────────
@app.get("/api/reports")
async def api_reports(
    limit: int = Query(50),
    offset: int = Query(0),
    structure_type: str = Query(None),
    threat_level: str = Query(None),
):
    data = get_reports(limit, offset, structure_type, threat_level)
    return {"reports": data}


# ── Alerts ───────────────────────────────────────────
@app.get("/api/alerts")
async def api_alerts():
    return {"alerts": get_alerts()}


# ── Contacts ─────────────────────────────────────────
@app.get("/api/contacts")
async def api_contacts():
    return {"contacts": get_contacts()}


@app.post("/api/contacts")
async def api_upsert_contact(body: dict):
    result = upsert_contact(body)
    return {"contact": result}


@app.delete("/api/contacts/{contact_id}")
async def api_delete_contact(contact_id: str):
    delete_contact(contact_id)
    return {"status": "deleted"}


# ── Notifications ────────────────────────────────────
@app.post("/api/notifications/test")
async def test_notification(body: dict):
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "contact_name": body.get("name", "Test"),
        "role": body.get("role", "Site Engineer"),
        "email": body.get("email", ""),
        "status": "TEST",
    }
    insert_alert(record)
    return {"status": "ok", "alert": record}


# ── Settings ─────────────────────────────────────────
@app.get("/api/settings")
async def api_get_settings():
    return {"settings": get_settings()}


@app.post("/api/settings")
async def api_save_settings(body: dict):
    for key, value in body.items():
        save_setting(key, str(value))

    # Apply to pipeline in real time
    if pipeline:
        pipeline.warning_threshold = float(body.get("warning_threshold", pipeline.warning_threshold))
        pipeline.danger_threshold = float(body.get("danger_threshold", pipeline.danger_threshold))
        pipeline.stabilization_enabled = str(body.get("stabilization_enabled", pipeline.stabilization_enabled)).lower() == "true"

    return {"status": "ok"}


# ── Export ───────────────────────────────────────────
@app.get("/api/export")
async def export_csv():
    data = get_reports(limit=10000)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "id", "timestamp", "structure_id", "frequency", "amplitude",
        "health_score", "threat_level", "confidence", "snapshot_url"
    ])
    writer.writeheader()
    for row in data:
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=vibrasense_export.csv"}
    )


# ── MJPEG Streaming Endpoint ────────────────────────
def _generate_mjpeg():
    """Generator that yields MJPEG frames from the latest processed frame."""
    prev_jpeg = None
    while True:
        with _latest_jpeg_lock:
            jpeg_bytes = _latest_jpeg
        # Only yield when we have a new frame (avoid sending duplicates)
        if jpeg_bytes is not None and jpeg_bytes is not prev_jpeg:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" +
                jpeg_bytes +
                b"\r\n"
            )
            prev_jpeg = jpeg_bytes
        time.sleep(0.005)  # 5ms poll — minimal latency


@app.get("/api/stream")
async def mjpeg_stream():
    """Continuous MJPEG video stream — use as <img src="/api/stream">."""
    return StreamingResponse(
        _generate_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# ── Performance Stats Endpoint ───────────────────────
@app.get("/api/perf")
async def perf_stats():
    total = _perf_capture_ms + _perf_stabilize_ms + _perf_inference_ms + _perf_encode_ms
    return {
        "capture_ms": round(_perf_capture_ms, 1),
        "stabilize_ms": round(_perf_stabilize_ms, 1),
        "inference_ms": round(_perf_inference_ms, 1),
        "encode_ms": round(_perf_encode_ms, 1),
        "total_ms": round(total, 1),
        "fps": round(_perf_fps, 1),
    }


# ── WebSocket Stream ─────────────────────────────────
@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket):
    global total_frames_processed, danger_start_time, _latest_jpeg
    global _perf_capture_ms, _perf_stabilize_ms, _perf_inference_ms, _perf_encode_ms, _perf_fps

    await websocket.accept()
    logger.info("WebSocket client connected")

    _last_fps_time = time.perf_counter()
    _fps_frame_count = 0

    try:
        while True:
            try:
                frame_start = time.perf_counter()

                # ── Capture: read from threaded grabber (non-blocking) ──
                t0 = time.perf_counter()
                frame = None

                if frame_grabber is not None:
                    frame = frame_grabber.read()

                if frame is None:
                    # Fallback black frame
                    frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    if source_type == "webcam":
                        cv2.putText(frame, "WEBCAM UNAVAILABLE - SIMULATION ACTIVE", (60, 240),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 160), 2)
                    elif source_type == "ipcam":
                        cv2.putText(frame, "PHONE CAM CONNECTING...", (120, 240),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 180, 255), 2)

                _perf_capture_ms = (time.perf_counter() - t0) * 1000

                # ── Inference: process through vision pipeline ──
                t1 = time.perf_counter()
                data = pipeline.process_frame(frame)
                total_frames_processed += 1
                _perf_inference_ms = (time.perf_counter() - t1) * 1000

                # ── Encode: render overlay and encode JPEG for MJPEG stream ──
                t2 = time.perf_counter()
                overlay_frame = pipeline.render_overlay(frame, data)
                _, buf = cv2.imencode(".jpg", overlay_frame, [cv2.IMWRITE_JPEG_QUALITY, 40])
                jpeg_bytes = buf.tobytes()
                with _latest_jpeg_lock:
                    _latest_jpeg = jpeg_bytes
                _perf_encode_ms = (time.perf_counter() - t2) * 1000

                # ── FPS calculation ──
                _fps_frame_count += 1
                fps_elapsed = time.perf_counter() - _last_fps_time
                if fps_elapsed >= 1.0:
                    _perf_fps = _fps_frame_count / fps_elapsed
                    _fps_frame_count = 0
                    _last_fps_time = time.perf_counter()

                # Log performance periodically
                if total_frames_processed % 30 == 0:
                    total_ms = _perf_capture_ms + _perf_stabilize_ms + _perf_inference_ms + _perf_encode_ms
                    logger.info(
                        f"[PERF] capture={_perf_capture_ms:.1f}ms "
                        f"stabilize={_perf_stabilize_ms:.1f}ms "
                        f"inference={_perf_inference_ms:.1f}ms "
                        f"encode={_perf_encode_ms:.1f}ms "
                        f"total={total_ms:.1f}ms "
                        f"fps={_perf_fps:.1f}"
                    )

                # Check danger persistence
                if data["threat_level"] == "DANGER":
                    if danger_start_time is None:
                        danger_start_time = time.time()
                    elif time.time() - danger_start_time >= DANGER_DURATION_THRESHOLD:
                        # Fire danger event!
                        await _handle_danger_event(frame, data, websocket)
                        danger_start_time = None
                else:
                    danger_start_time = None

                # ── Send data-only payload (NO base64 frame) ──
                payload = _sanitize({
                    "type": "frame",
                    **data,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "uptime": round(time.time() - server_start_time, 1),
                    "total_frames": total_frames_processed,
                    "perf": {
                        "capture_ms": round(_perf_capture_ms, 1),
                        "stabilize_ms": round(_perf_stabilize_ms, 1),
                        "inference_ms": round(_perf_inference_ms, 1),
                        "encode_ms": round(_perf_encode_ms, 1),
                        "fps": round(_perf_fps, 1),
                    },
                })
                await websocket.send_json(payload)

                # ── Adaptive timing: skip sleep if we're already behind ──
                elapsed = time.perf_counter() - frame_start
                target_interval = 0.033  # ~30fps
                if elapsed < target_interval:
                    await asyncio.sleep(target_interval - elapsed)
                else:
                    # Processing took too long — yield to event loop but don't sleep
                    await asyncio.sleep(0)

            except WebSocketDisconnect:
                raise  # Re-raise to outer handler
            except Exception as frame_err:
                logger.warning(f"Frame processing error (continuing): {frame_err}")
                await asyncio.sleep(0.1)  # Brief pause before retry

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


async def _handle_danger_event(frame, data, websocket):
    """Handle sustained danger: save snapshot, create report & alert."""
    logger.warning("DANGER threshold sustained — firing event!")

    # Render overlay on frame
    overlay_frame = pipeline.render_overlay(frame, data)
    _, buf = cv2.imencode(".jpg", overlay_frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    snapshot_bytes = buf.tobytes()

    ts = datetime.now(timezone.utc).isoformat()
    filename = f"danger_{ts.replace(':', '-')}.jpg"

    # Upload snapshot
    snapshot_url = upload_snapshot(filename, snapshot_bytes)

    # Insert report
    report = {
        "timestamp": ts,
        "structure_id": data.get("class_name", "Unknown"),
        "frequency": data["frequency"],
        "amplitude": data["amplitude"],
        "health_score": data["health_score"],
        "threat_level": "DANGER",
        "confidence": data["confidence"],
        "snapshot_url": snapshot_url or "",
    }
    insert_report(report)

    # Alert all enabled contacts
    try:
        contacts = get_contacts()
        for c in contacts:
            if c.get("enabled"):
                alert_rec = {
                    "timestamp": ts,
                    "contact_name": c["name"],
                    "role": c.get("role", ""),
                    "email": c.get("email", ""),
                    "status": "FIRED",
                }
                insert_alert(alert_rec)
    except Exception as e:
        logger.error(f"Failed to create alerts: {e}")

    # Send alert event to frontend
    snapshot_b64 = base64.b64encode(snapshot_bytes).decode("utf-8")
    await websocket.send_json({
        "type": "ALERT",
        "report": report,
        "snapshot": snapshot_b64,
        "timestamp": ts,
    })


# ── Main ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
