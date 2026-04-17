/* ── Gauge Renderers ──────────────────────────────── */

class HealthGauge {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.value = 85;
        this.targetValue = 85;
        this.animating = false;
    }

    draw(value) {
        this.targetValue = value;
        if (!this.animating) this._animate();
    }

    _animate() {
        this.animating = true;
        const step = () => {
            this.value += (this.targetValue - this.value) * 0.1;
            if (Math.abs(this.targetValue - this.value) < 0.5) {
                this.value = this.targetValue;
            }
            this._render();
            if (this.value !== this.targetValue) {
                requestAnimationFrame(step);
            } else {
                this.animating = false;
            }
        };
        step();
    }

    _render() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) / 2 - 12;

        ctx.clearRect(0, 0, w, h);

        // Background arc
        const startAngle = 0.75 * Math.PI;
        const endAngle = 2.25 * Math.PI;

        // Track
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Colored arc
        const pct = this.value / 100;
        const valueAngle = startAngle + pct * (endAngle - startAngle);

        let color;
        if (this.value >= 70) color = '#00ff88';
        else if (this.value >= 40) color = '#ffaa00';
        else color = '#ff3333';

        // Gradient arc
        const grad = ctx.createLinearGradient(0, h, w, 0);
        grad.addColorStop(0, '#ff3333');
        grad.addColorStop(0.4, '#ffaa00');
        grad.addColorStop(0.7, '#00ff88');

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, valueAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Glow
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, valueAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = 12;
        ctx.globalAlpha = 0.15;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Tick marks
        for (let i = 0; i <= 10; i++) {
            const angle = startAngle + (i / 10) * (endAngle - startAngle);
            const inner = radius - 14;
            const outer = radius - 8;
            ctx.beginPath();
            ctx.moveTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle));
            ctx.lineTo(cx + outer * Math.cos(angle), cy + outer * Math.sin(angle));
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Needle dot at value position
        const dotX = cx + (radius - 4) * Math.cos(valueAngle);
        const dotY = cy + (radius - 4) * Math.sin(valueAngle);
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Update number display
        const valEl = document.getElementById('health-value');
        if (valEl) {
            valEl.textContent = Math.round(this.value);
            valEl.style.color = color;
        }
    }
}

// ── VU Meter ────────────────────────────────────────
function updateVUMeter(amplitude, maxAmp = 2.0) {
    const segments = document.querySelectorAll('#vu-meter .vu-seg');
    const pct = Math.min(amplitude / maxAmp, 1.0);
    const litCount = Math.round(pct * segments.length);

    segments.forEach((seg, i) => {
        if (i < litCount) {
            seg.classList.add('lit');
        } else {
            seg.classList.remove('lit');
        }
    });
}

// ── Threat Meter ────────────────────────────────────
function updateThreatMeter(level) {
    const normal = document.querySelector('#tm-normal .led');
    const warning = document.querySelector('#tm-warning .led');
    const danger = document.querySelector('#tm-danger .led');

    if (!normal) return;

    // Reset all
    [normal, warning, danger].forEach(l => {
        l.className = 'led';
        l.classList.add('dim');
    });

    switch (level) {
        case 'NORMAL':
            normal.className = 'led green pulse';
            break;
        case 'WARNING':
            normal.className = 'led green pulse';
            warning.className = 'led amber pulse';
            break;
        case 'DANGER':
            normal.className = 'led green pulse';
            warning.className = 'led amber pulse';
            danger.className = 'led red pulse';
            break;
    }
}

// Global gauge instance
const healthGauge = new HealthGauge('health-gauge');
healthGauge.draw(85);
