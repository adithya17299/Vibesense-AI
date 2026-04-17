/* ── Live Feed Page Logic ─────────────────────────── */

(function () {
    const sessionStart = Date.now();
    const confidenceHistory = [];
    const MAX_SPARK = 60;
    let sparkCtx = null;

    // ── Source Toggle (Live Feed page) ──────────────
    document.querySelectorAll('#page-livefeed .source-toggle .seg-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            this.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const source = this.dataset.source;
            const ipcamBar = document.getElementById('lf-ipcam-input-bar');

            if (source === 'ipcam') {
                ipcamBar.style.display = 'flex';
            } else {
                ipcamBar.style.display = 'none';
                fetch('/api/source', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: source })
                });
            }
        });
    });

    // IP Camera connect handler (Live Feed)
    const lfIpcamBtn = document.getElementById('lf-ipcam-connect-btn');
    if (lfIpcamBtn) {
        lfIpcamBtn.addEventListener('click', async () => {
            const urlInput = document.getElementById('lf-ipcam-url-input');
            const status = document.getElementById('lf-ipcam-status');
            const url = urlInput.value.trim();
            if (!url) {
                status.textContent = '⚠ PLEASE ENTER A VALID URL';
                status.style.color = 'var(--amber)';
                return;
            }
            status.textContent = 'CONNECTING...';
            status.style.color = 'var(--amber)';
            try {
                const res = await fetch('/api/source', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'ipcam', url })
                });
                const data = await res.json();
                if (data.status === 'ok') {
                    status.textContent = '● CONNECTED';
                    status.style.color = 'var(--success)';
                } else {
                    status.textContent = '✕ ' + (data.message || 'CONNECTION FAILED');
                    status.style.color = 'var(--danger)';
                }
            } catch (err) {
                status.textContent = '✕ NETWORK ERROR';
                status.style.color = 'var(--danger)';
            }
        });
    }

    // ── Sparkline ───────────────────────────────────
    function initSparkline() {
        const canvas = document.getElementById('lf-sparkline');
        if (canvas) sparkCtx = canvas.getContext('2d');
    }

    function drawSparkline() {
        if (!sparkCtx) return;
        const c = sparkCtx;
        const w = 140, h = 40;
        c.clearRect(0, 0, w, h);

        if (confidenceHistory.length < 2) return;

        // Ensure max is never 0 to avoid division by zero, and provide a small minimum scale
        const max = Math.max(...confidenceHistory, 0.01);
        c.beginPath();
        c.strokeStyle = '#00ffc8';
        c.lineWidth = 1.5;

        confidenceHistory.forEach((val, i) => {
            const x = (i / (MAX_SPARK - 1)) * w;
            const y = h - (val / max) * (h - 4) - 2;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
        });
        c.stroke();

        // Fill
        c.lineTo((confidenceHistory.length - 1) / (MAX_SPARK - 1) * w, h);
        c.lineTo(0, h);
        c.closePath();
        c.fillStyle = 'rgba(0,255,200,0.05)';
        c.fill();
    }

    // ── WebSocket Data Handler (Live Feed) ──────────
    ws.on('frame', (data) => {
        // Render camera on live feed page canvas
        lfCamera.renderFrame(data);

        // Update data strip
        const el = (id) => document.getElementById(id);
        el('lf-freq').textContent = (data.frequency || 0).toFixed(2);
        el('lf-amp').textContent = (data.amplitude || 0).toFixed(2);
        el('lf-joints').textContent = data.joint_count || 0;
        el('lf-health').textContent = Math.round(data.health_score || 0);

        const threatEl = el('lf-threat');
        if (threatEl) {
            threatEl.textContent = data.threat_level || 'NORMAL';
            threatEl.className = {
                'NORMAL': 'text-accent',
                'WARNING': 'text-amber',
                'DANGER': 'text-danger'
            }[data.threat_level] || 'text-accent';
        }

        // Clock
        const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
        const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        el('lf-clock').textContent = `${hrs}:${mins}:${secs}`;

        // Frames odometer
        el('lf-frames').textContent = String(data.total_frames || 0).padStart(6, '0');

        // Sparkline
        confidenceHistory.push(data.confidence || 0);
        if (confidenceHistory.length > MAX_SPARK) confidenceHistory.shift();
        drawSparkline();
    });

    initSparkline();
})();
