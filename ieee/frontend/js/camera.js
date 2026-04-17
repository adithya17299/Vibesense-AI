/* ── Camera Feed + AI Overlay Renderer ────────────── */
/* MJPEG stream via <img> + transparent canvas overlay for AI annotations */

class CameraRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    }

    /**
     * Render AI overlay from WebSocket data onto the transparent canvas.
     * The MJPEG <img> stream handles video display separately.
     */
    renderFrame(data) {
        if (!this.ctx) return;

        // Match canvas resolution to the stream frame dimensions
        const fw = data.frame_width || 640;
        const fh = data.frame_height || 480;
        if (this.canvas.width !== fw || this.canvas.height !== fh) {
            this.canvas.width = fw;
            this.canvas.height = fh;
        }

        // Clear previous overlay
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw AI overlay if structure detected
        if (data.detected && data.bbox) {
            this.drawOverlay(data);
        }
    }

    drawOverlay(data) {
        const ctx = this.ctx;
        const bbox = data.bbox;
        const threat = data.threat_level || 'NORMAL';

        // Colors by threat
        const colors = {
            NORMAL: '#00ffc8',
            WARNING: '#ffaa00',
            DANGER: '#ff3333'
        };
        const color = colors[threat] || colors.NORMAL;

        const x1 = bbox.x1, y1 = bbox.y1, x2 = bbox.x2, y2 = bbox.y2;
        const bw = x2 - x1, bh = y2 - y1;
        const bracketLen = Math.min(bw, bh) * 0.15;

        ctx.lineWidth = 2;
        ctx.strokeStyle = color;

        // Corner brackets
        // Top-left
        ctx.beginPath();
        ctx.moveTo(x1 + bracketLen, y1);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1, y1 + bracketLen);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(x2 - bracketLen, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y1 + bracketLen);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(x1 + bracketLen, y2);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x1, y2 - bracketLen);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(x2 - bracketLen, y2);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2, y2 - bracketLen);
        ctx.stroke();

        // Detection label
        if (data.class_name) {
            const label = `AUTO-DETECTED: ${data.class_name.toUpperCase()} · CONF: ${(data.confidence * 100).toFixed(1)}%`;
            ctx.font = '11px JetBrains Mono, monospace';
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            const tw = ctx.measureText(label).width;
            ctx.fillRect(x1, y1 - 22, tw + 12, 18);
            ctx.fillStyle = color;
            ctx.fillText(label, x1 + 6, y1 - 8);
        }

        // Status label
        const statusLabel = `STATUS: ${threat}`;
        ctx.font = '11px JetBrains Mono, monospace';
        const stw = ctx.measureText(statusLabel).width;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x2 - stw - 12, y1 - 22, stw + 12, 18);
        ctx.fillStyle = color;
        ctx.fillText(statusLabel, x2 - stw - 6, y1 - 8);

        // Joint dots
        const joints = data.joints || [];
        const maxTension = data.max_tension || {};
        const mtIdx = maxTension.index || 0;

        joints.forEach((j, i) => {
            const isMax = i === mtIdx && joints.length > 0;

            if (isMax) {
                // Max tension — larger red halo
                ctx.beginPath();
                ctx.arc(j.x, j.y, 10, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255,51,51,0.5)';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(j.x, j.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#ff3333';
                ctx.fill();

                // Max tension label
                const mtLabel = `MAX_TENSION · ${maxTension.label || 'Joint-00'}`;
                ctx.font = '9px JetBrains Mono, monospace';
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                const mtw = ctx.measureText(mtLabel).width;
                ctx.fillRect(j.x + 14, j.y - 10, mtw + 8, 14);
                ctx.fillStyle = '#ff3333';
                ctx.fillText(mtLabel, j.x + 18, j.y + 1);

                // Leader line
                ctx.beginPath();
                ctx.moveTo(j.x + 10, j.y);
                ctx.lineTo(j.x + 14, j.y - 3);
                ctx.strokeStyle = '#ff3333';
                ctx.lineWidth = 1;
                ctx.stroke();
            } else {
                // Normal joint — concentric circles
                ctx.beginPath();
                ctx.arc(j.x, j.y, 6, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(0,255,200,0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(j.x, j.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#00ffc8';
                ctx.fill();
            }
        });

        // Optical flow arrows
        const flowVectors = data.flow_vectors || [];
        ctx.strokeStyle = 'rgba(200,200,200,0.6)';
        ctx.lineWidth = 1;
        flowVectors.forEach(fv => {
            if (fv.magnitude > 0.5) {
                const scale = 3;
                const fromX = fv.x - fv.dx * scale;
                const fromY = fv.y - fv.dy * scale;
                const toX = fv.x;
                const toY = fv.y;

                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(toX, toY);
                ctx.stroke();

                // Arrowhead
                const angle = Math.atan2(fv.dy, fv.dx);
                const headLen = 4;
                ctx.beginPath();
                ctx.moveTo(toX, toY);
                ctx.lineTo(toX - headLen * Math.cos(angle - 0.5), toY - headLen * Math.sin(angle - 0.5));
                ctx.moveTo(toX, toY);
                ctx.lineTo(toX - headLen * Math.cos(angle + 0.5), toY - headLen * Math.sin(angle + 0.5));
                ctx.stroke();
            }
        });
    }
}

// Global camera instances
const mainCamera = new CameraRenderer('camera-canvas');
const lfCamera = new CameraRenderer('lf-canvas');
