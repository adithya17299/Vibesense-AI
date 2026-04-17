import cv2
import math
import numpy as np
import torch
from collections import deque
from functools import partial
from ultralytics import YOLO
from stabilizer import FrameStabilizer
from health import HealthScorer

# Fix for PyTorch 2.6+ weights_only default change
_original_load = torch.load
torch.load = partial(_original_load, weights_only=False)


class VisionPipeline:
    """
    Full CV pipeline: stabilize → YOLOv8 detect → GFTT joints →
    optical flow → RMS/FFT → health score → threat level.
    Optimized for low-latency inference.
    """

    # COCO classes that could represent structures in demos
    STRUCTURAL_CLASSES = None  # Accept any class, select largest bbox

    def __init__(self, device="mps"):
        try:
            self.model = YOLO("yolov8n.pt")
            self.model.to(device)
            self.device = device
        except Exception:
            self.model = YOLO("yolov8n.pt")
            self.device = "cpu"

        # Fuse Conv+BN layers for faster inference (~10-15% speedup)
        try:
            self.model.fuse()
        except Exception:
            pass

        # Suppress per-frame verbose output
        self.model.overrides['verbose'] = False

        # Enable FP16 half precision on CUDA for faster inference
        self.use_half = (self.device == "cuda")
        if self.use_half:
            try:
                self.model.half()
            except Exception:
                self.use_half = False

        self.stabilizer = FrameStabilizer()
        self.scorer = HealthScorer(window=10)

        # Optical flow state
        self.prev_gray = None
        self.prev_points = None
        self.joint_history = deque(maxlen=64)  # for FFT

        # Pixel intensity history for FFT (within bbox)
        self.intensity_history = deque(maxlen=128)

        # Settings
        self.stabilization_enabled = True
        self.warning_threshold = 0.3
        self.danger_threshold = 0.7

        # Tracking state
        self.fps = 30
        self.frame_count = 0

        # Inference resolution (width) — lower = faster
        self.inference_size = 320

    def process_frame(self, frame: np.ndarray) -> dict:
        """Process single frame through full pipeline. Returns analysis dict."""
        self.frame_count += 1
        h, w = frame.shape[:2]

        # 1. Stabilize
        if self.stabilization_enabled:
            frame = self.stabilizer.stabilize(frame)

        # 2. YOLOv8 detection — use reduced inference size for speed
        results = self.model(frame, verbose=False, conf=0.25, imgsz=self.inference_size,
                             half=self.use_half, agnostic_nms=True)
        bbox = self._select_largest_bbox(results)

        if bbox is None:
            # Fallback: Just track the whole frame center instead of faking data
            margin_x, margin_y = int(w * 0.1), int(h * 0.1)
            x1, y1 = margin_x, margin_y
            x2, y2 = w - margin_x, h - margin_y
            conf = 0.0
            cls_name = "UNCLASSIFIED_AREA"
        else:
            x1, y1, x2, y2, conf, cls_id, cls_name = bbox

        x1, y1, x2, y2, conf, cls_id, cls_name = bbox

        # 3. GFTT joint detection within bbox
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        roi_gray = gray[y1:y2, x1:x2]
        joints = self._detect_joints(roi_gray, x1, y1)

        # 4. Optical flow
        displacements = []
        flow_vectors = []
        if self.prev_gray is not None and self.prev_points is not None and len(joints) > 0:
            curr_pts = np.array(joints, dtype=np.float32).reshape(-1, 1, 2)
            if len(self.prev_points) > 0:
                next_pts, status, _ = cv2.calcOpticalFlowPyrLK(
                    self.prev_gray, gray, self.prev_points, curr_pts
                )
                if next_pts is not None:
                    for i, (st, prev, nxt) in enumerate(
                        zip(status.flatten(), self.prev_points.reshape(-1, 2),
                            next_pts.reshape(-1, 2))
                    ):
                        if st:
                            dx = nxt[0] - prev[0]
                            dy = nxt[1] - prev[1]
                            disp = np.sqrt(dx**2 + dy**2)
                            displacements.append(disp)
                            flow_vectors.append({
                                "x": float(nxt[0]), "y": float(nxt[1]),
                                "dx": float(dx), "dy": float(dy),
                                "magnitude": float(disp)
                            })

        self.prev_gray = gray
        self.prev_points = (np.array(joints, dtype=np.float32).reshape(-1, 1, 2)
                           if len(joints) > 0 else None)

        # 5. RMS displacement
        rms = float(np.sqrt(np.mean(np.array(displacements)**2))) if displacements else 0.0
        # Scale RMS to mm-equivalent (amplified for visibility)
        rms_mm = rms * 0.8  # increased scaling factor so tiny shakes register

        # 6. Max tension joint
        max_tension_idx = 0
        max_tension_val = 0.0
        if displacements:
            max_tension_idx = int(np.argmax(displacements))
            max_tension_val = float(displacements[max_tension_idx])

        # 7. FFT on bbox pixel intensity
        mean_intensity = float(np.mean(roi_gray))
        self.intensity_history.append(mean_intensity)
        fft_data = self._compute_fft()

        # 8. Threat level
        threat_level = "NORMAL"
        if rms_mm >= self.danger_threshold:
            threat_level = "DANGER"
        elif rms_mm >= self.warning_threshold:
            threat_level = "WARNING"

        # 9. Health score
        health_score = self.scorer.compute(rms_mm, threat_level)

        # 10. Dominant frequency
        dominant_freq = 0.0
        if fft_data and len(fft_data) > 0:
            peak_idx = max(range(len(fft_data)), key=lambda i: fft_data[i]["magnitude"])
            dominant_freq = fft_data[peak_idx]["frequency"]

        return {
            "detected": True,
            "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            "confidence": float(conf),
            "class_name": cls_name,
            "joints": [{"x": j[0], "y": j[1]} for j in joints],
            "flow_vectors": flow_vectors,
            "max_tension": {
                "index": max_tension_idx,
                "joint": joints[max_tension_idx] if joints and max_tension_idx < len(joints) else None,
                "value": float(max_tension_val * 0.8),
                "label": f"Joint-{max_tension_idx:02d}"
            },
            "frequency": round(dominant_freq, 2),
            "amplitude": round(rms_mm, 4),
            "health_score": health_score,
            "threat_level": threat_level,
            "fft_spectrum": fft_data[:32] if fft_data else [],
            "frame_width": w,
            "frame_height": h,
            "joint_count": len(joints),
        }

    def _select_largest_bbox(self, results):
        """Select the single largest detection by area."""
        best = None
        best_area = 0

        for r in results:
            boxes = r.boxes
            if boxes is None or len(boxes) == 0:
                continue
            for i in range(len(boxes)):
                x1, y1, x2, y2 = boxes.xyxy[i].cpu().numpy().astype(int)
                area = (x2 - x1) * (y2 - y1)
                conf = float(boxes.conf[i].cpu().numpy())
                cls_id = int(boxes.cls[i].cpu().numpy())
                cls_name = self.model.names.get(cls_id, "structure")
                if area > best_area:
                    best_area = area
                    best = (x1, y1, x2, y2, conf, cls_id, cls_name)

        return best

    def _detect_joints(self, roi_gray, offset_x, offset_y, max_corners=10, min_corners=6):
        """GFTT corner detection within ROI."""
        if roi_gray.size == 0:
            return []

        corners = cv2.goodFeaturesToTrack(
            roi_gray, maxCorners=max_corners, qualityLevel=0.01,
            minDistance=max(roi_gray.shape[0] // 8, 10)
        )

        if corners is None:
            return []

        joints = []
        for c in corners:
            x, y = c.ravel()
            joints.append((int(x + offset_x), int(y + offset_y)))

        return joints

    def _compute_fft(self):
        """FFT on intensity time series within bounding box."""
        if len(self.intensity_history) < 16:
            return []

        signal = np.array(self.intensity_history)
        signal = signal - np.mean(signal)  # Remove DC

        fft_vals = np.fft.fft(signal)
        fft_mag = np.abs(fft_vals[:len(signal)//2])
        freqs = np.fft.fftfreq(len(signal), d=1.0/self.fps)[:len(signal)//2]

        # Normalize
        if np.max(fft_mag) > 0:
            fft_mag = fft_mag / np.max(fft_mag)

        result = []
        for f, m in zip(freqs, fft_mag):
            if f > 0:  # Skip DC component
                result.append({"frequency": round(float(f), 2), "magnitude": round(float(m), 4)})

        return result

    def _no_detection_result(self, frame, h, w):
        """Generate realistic simulated data when no structure detected.
        This keeps the dashboard alive with dynamic graphs and demo visuals."""
        t = self.frame_count / self.fps  # time in seconds

        # ── Simulated vibration parameters ──
        # Base frequency oscillates slowly: 1.5–4.5 Hz
        base_freq = 2.8 + 1.5 * math.sin(t * 0.15)
        # Amplitude modulated by multiple harmonics for realism
        amp_raw = (
            0.12 * math.sin(t * 0.3) +
            0.08 * math.sin(t * 0.7 + 0.5) +
            0.05 * math.sin(t * 1.3 + 1.2) +
            0.03 * math.sin(t * 2.1 + 0.8) +
            0.02 * np.random.randn()  # noise
        )
        amplitude = max(0.02, abs(amp_raw))

        # Occasionally spike toward danger for drama
        if math.sin(t * 0.08) > 0.85:
            amplitude += 0.4 * abs(math.sin(t * 1.5))

        # ── Threat level ──
        threat_level = "NORMAL"
        if amplitude >= self.danger_threshold:
            threat_level = "DANGER"
        elif amplitude >= self.warning_threshold:
            threat_level = "WARNING"

        # ── Health score ──
        health_score = self.scorer.compute(amplitude, threat_level)

        # ── Simulated bbox (centered region) ──
        margin_x, margin_y = int(w * 0.15), int(h * 0.15)
        bx1, by1 = margin_x, margin_y
        bx2, by2 = w - margin_x, h - margin_y

        # ── Simulated joints ──
        num_joints = 12
        joints = []
        for i in range(num_joints):
            jx = bx1 + int((bx2 - bx1) * (i / (num_joints - 1)))
            jy = int((by1 + by2) / 2 + 30 * math.sin(t * 2 + i * 0.4) + 15 * math.sin(t * 3.7 + i * 0.8))
            joints.append({"x": jx, "y": jy})

        # ── Simulated flow vectors ──
        flow_vectors = []
        for j in joints:
            dx = amplitude * 8 * math.sin(t * base_freq + j["x"] * 0.01)
            dy = amplitude * 5 * math.cos(t * base_freq * 0.7 + j["y"] * 0.01)
            flow_vectors.append({
                "x": j["x"], "y": j["y"],
                "dx": float(dx), "dy": float(dy),
                "magnitude": float(math.sqrt(dx**2 + dy**2))
            })

        # ── Max tension ──
        if flow_vectors:
            mt_idx = max(range(len(flow_vectors)), key=lambda i: flow_vectors[i]["magnitude"])
        else:
            mt_idx = 0

        # ── Simulated FFT spectrum ──
        fft_spectrum = []
        for fi in range(1, 25):
            freq = fi * 0.5
            # Peak around base_freq
            mag = math.exp(-((freq - base_freq) ** 2) / 1.5) * 0.9
            # Add harmonics
            mag += 0.3 * math.exp(-((freq - base_freq * 2) ** 2) / 1.0)
            mag += 0.15 * math.exp(-((freq - base_freq * 0.5) ** 2) / 0.8)
            mag += 0.02 * np.random.rand()  # noise floor
            fft_spectrum.append({
                "frequency": round(freq, 2),
                "magnitude": round(min(float(mag), 1.0), 4)
            })

        # ── Render simulation overlay on frame ──
        self._render_simulation_overlay(frame, bx1, by1, bx2, by2, joints, flow_vectors, mt_idx, threat_level, amplitude, base_freq, health_score)

        # Also push to intensity history so FFT stays alive
        self.intensity_history.append(128 + 40 * math.sin(t * base_freq))

        return {
            "detected": True,
            "bbox": {"x1": bx1, "y1": by1, "x2": bx2, "y2": by2},
            "confidence": 0.0,
            "class_name": "SIMULATION",
            "joints": joints,
            "flow_vectors": flow_vectors,
            "max_tension": {
                "index": mt_idx,
                "joint": joints[mt_idx] if joints else None,
                "value": float(amplitude),
                "label": f"Joint-{mt_idx:02d}"
            },
            "frequency": round(float(base_freq), 2),
            "amplitude": round(float(amplitude), 4),
            "health_score": health_score,
            "threat_level": threat_level,
            "fft_spectrum": fft_spectrum,
            "frame_width": w,
            "frame_height": h,
            "joint_count": len(joints),
        }

    def _render_simulation_overlay(self, frame, x1, y1, x2, y2, joints, flow_vectors, mt_idx, threat, amplitude, freq, health):
        """Draw simulation overlay directly on the frame so the camera looks active."""
        color_map = {"NORMAL": (200, 255, 0), "WARNING": (0, 180, 255), "DANGER": (0, 70, 255)}
        color = color_map.get(threat, (200, 255, 0))

        # Corner brackets
        bl = min(x2 - x1, y2 - y1) // 6
        for (cx, cy, dx, dy) in [
            (x1, y1, 1, 1), (x2, y1, -1, 1),
            (x1, y2, 1, -1), (x2, y2, -1, -1)
        ]:
            cv2.line(frame, (cx, cy), (cx + bl * dx, cy), color, 2)
            cv2.line(frame, (cx, cy), (cx, cy + bl * dy), color, 2)

        # Label
        label = f"SIMULATION MODE · {freq:.2f} Hz · {amplitude:.4f} mm"
        cv2.putText(frame, label, (x1 + 5, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

        # Status
        status = f"STATUS: {threat} | HEALTH: {health:.0f}"
        cv2.putText(frame, status, (x2 - 320, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

        # Joint dots
        for i, j in enumerate(joints):
            if i == mt_idx:
                cv2.circle(frame, (j["x"], j["y"]), 8, (0, 0, 255), 2)
                cv2.circle(frame, (j["x"], j["y"]), 4, (0, 0, 255), -1)
                cv2.putText(frame, f"MAX_TENSION · Joint-{i:02d}", (j["x"] + 10, j["y"] - 5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 255), 1)
            else:
                cv2.circle(frame, (j["x"], j["y"]), 4, (0, 255, 200), -1)
                cv2.circle(frame, (j["x"], j["y"]), 6, (0, 255, 200), 1)

        # Flow arrows
        for fv in flow_vectors:
            pt1 = (int(fv["x"] - fv["dx"] * 3), int(fv["y"] - fv["dy"] * 3))
            pt2 = (int(fv["x"]), int(fv["y"]))
            cv2.arrowedLine(frame, pt1, pt2, (180, 220, 200), 1, tipLength=0.3)

        # Grid lines inside bbox for engineering feel
        step_x = (x2 - x1) // 8
        step_y = (y2 - y1) // 6
        for gx in range(x1, x2, step_x):
            cv2.line(frame, (gx, y1), (gx, y2), (30, 45, 40), 1)
        for gy in range(y1, y2, step_y):
            cv2.line(frame, (x1, gy), (x2, gy), (30, 45, 40), 1)

    def render_overlay(self, frame: np.ndarray, data: dict) -> np.ndarray:
        """Render bounding box, joints, arrows, labels onto frame using OpenCV."""
        overlay = frame.copy()

        if not data.get("detected"):
            return overlay

        bbox = data["bbox"]
        threat = data["threat_level"]
        color_map = {"NORMAL": (255, 200, 0), "WARNING": (0, 180, 255), "DANGER": (0, 0, 255)}
        color = color_map.get(threat, (255, 200, 0))  # BGR

        x1, y1, x2, y2 = bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]
        bracket_len = min(x2 - x1, y2 - y1) // 5

        # Corner brackets
        for (cx, cy, dx, dy) in [
            (x1, y1, 1, 1), (x2, y1, -1, 1),
            (x1, y2, 1, -1), (x2, y2, -1, -1)
        ]:
            cv2.line(overlay, (cx, cy), (cx + bracket_len * dx, cy), color, 2)
            cv2.line(overlay, (cx, cy), (cx, cy + bracket_len * dy), color, 2)

        # Class label
        label = f"AUTO-DETECTED: {data['class_name'].upper()} · CONF: {data['confidence']*100:.1f}%"
        cv2.putText(overlay, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

        # Joint dots
        joints = data.get("joints", [])
        mt = data.get("max_tension", {})
        mt_idx = mt.get("index", -1)

        for i, j in enumerate(joints):
            if i == mt_idx:
                cv2.circle(overlay, (j["x"], j["y"]), 8, (0, 0, 255), 2)
                cv2.circle(overlay, (j["x"], j["y"]), 4, (0, 0, 255), -1)
                cv2.putText(overlay, f"MAX_TENSION · {mt.get('label', '')}", 
                           (j["x"] + 10, j["y"] - 5),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 255), 1)
            else:
                cv2.circle(overlay, (j["x"], j["y"]), 4, (0, 255, 200), -1)
                cv2.circle(overlay, (j["x"], j["y"]), 6, (0, 255, 200), 1)

        # Flow arrows
        for fv in data.get("flow_vectors", []):
            pt1 = (int(fv["x"] - fv["dx"]), int(fv["y"] - fv["dy"]))
            pt2 = (int(fv["x"]), int(fv["y"]))
            cv2.arrowedLine(overlay, pt1, pt2, (200, 200, 200), 1, tipLength=0.3)

        # Status text
        status_text = f"STATUS: {threat}"
        cv2.putText(overlay, status_text, (x2 - 180, y1 - 10),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

        return overlay

    def reset(self):
        self.stabilizer.reset()
        self.scorer.reset()
        self.prev_gray = None
        self.prev_points = None
        self.joint_history.clear()
        self.intensity_history.clear()
        self.frame_count = 0
