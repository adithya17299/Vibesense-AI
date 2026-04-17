/* ── Settings Page Logic ──────────────────────────── */

(function () {

    // ── Load Settings ───────────────────────────────
    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            const s = data.settings || {};

            // Apply to UI
            const perframe = document.getElementById('set-perframe');
            if (perframe) perframe.checked = s.per_frame_inference !== 'false';

            const threshold = document.getElementById('set-threshold');
            if (threshold) {
                threshold.value = s.danger_threshold || '0.7';
                document.getElementById('set-threshold-val').textContent = parseFloat(s.danger_threshold || 0.7).toFixed(2) + 'mm';
            }

            const duration = document.getElementById('set-duration');
            if (duration) duration.textContent = s.min_danger_duration || '3';

            const stab = document.getElementById('set-stabilization');
            if (stab) stab.checked = s.stabilization_enabled !== 'false';

            const mute = document.getElementById('set-mute');
            if (mute) {
                mute.checked = s.notifications_muted === 'true';
                document.getElementById('mute-banner').style.display = mute.checked ? 'block' : 'none';
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    // ── Auto-save on change ─────────────────────────
    async function saveSettings(overrides = {}) {
        const settings = {
            per_frame_inference: document.getElementById('set-perframe')?.checked ? 'true' : 'false',
            danger_threshold: document.getElementById('set-threshold')?.value || '0.7',
            min_danger_duration: document.getElementById('set-duration')?.textContent || '3',
            stabilization_enabled: document.getElementById('set-stabilization')?.checked ? 'true' : 'false',
            notifications_muted: document.getElementById('set-mute')?.checked ? 'true' : 'false',
            ...overrides,
        };

        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
    }

    // ── Threshold slider ────────────────────────────
    document.getElementById('set-threshold')?.addEventListener('input', function () {
        document.getElementById('set-threshold-val').textContent = parseFloat(this.value).toFixed(2) + 'mm';
    });
    document.getElementById('set-threshold')?.addEventListener('change', () => saveSettings());

    // ── Toggles ─────────────────────────────────────
    document.getElementById('set-perframe')?.addEventListener('change', () => saveSettings());
    document.getElementById('set-stabilization')?.addEventListener('change', () => saveSettings());
    document.getElementById('set-mute')?.addEventListener('change', function () {
        document.getElementById('mute-banner').style.display = this.checked ? 'block' : 'none';
        saveSettings();
    });

    // ── Duration stepper ────────────────────────────
    document.getElementById('dur-minus')?.addEventListener('click', () => {
        const el = document.getElementById('set-duration');
        const v = Math.max(1, parseInt(el.textContent) - 1);
        el.textContent = v;
        saveSettings();
    });
    document.getElementById('dur-plus')?.addEventListener('click', () => {
        const el = document.getElementById('set-duration');
        const v = Math.min(30, parseInt(el.textContent) + 1);
        el.textContent = v;
        saveSettings();
    });

    // ── Max Records stepper ─────────────────────────
    document.getElementById('rec-minus')?.addEventListener('click', () => {
        const el = document.getElementById('set-max-records');
        const v = Math.max(100, parseInt(el.textContent) - 100);
        el.textContent = v;
    });
    document.getElementById('rec-plus')?.addEventListener('click', () => {
        const el = document.getElementById('set-max-records');
        const v = Math.min(10000, parseInt(el.textContent) + 100);
        el.textContent = v;
    });

    // ── Export CSV ───────────────────────────────────
    document.getElementById('btn-export')?.addEventListener('click', () => {
        window.location.href = '/api/export';
    });

    // ── Clear All Data ──────────────────────────────
    document.getElementById('btn-clear-data')?.addEventListener('click', () => {
        if (confirm('⚠ Are you sure you want to clear ALL historical data? This action cannot be undone.')) {
            // This would need a dedicated API endpoint — for now alert
            alert('Data clear functionality requires admin access.');
        }
    });

    // ── System Info — live updates ──────────────────
    ws.on('frame', (data) => {
        const el = (id) => document.getElementById(id);

        // Uptime
        if (data.uptime) {
            const secs = Math.floor(data.uptime);
            const hrs = String(Math.floor(secs / 3600)).padStart(2, '0');
            const mins = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
            const s = String(secs % 60).padStart(2, '0');
            el('si-uptime').textContent = `${hrs}:${mins}:${s}`;
        }

        // Frames
        if (data.total_frames) {
            el('si-frames').textContent = String(data.total_frames).padStart(6, '0');
        }
    });

    // ── Settings Preview ──────────────────────────
    // (Uses the main WebSocket frame data to show a small preview)
    ws.on('frame', (data) => {
        if (!data.frame) return;
        const canvas = document.getElementById('settings-preview');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = 'data:image/jpeg;base64,' + data.frame;
    });

    // ── Page Change Handler ─────────────────────────
    window.addEventListener('page-change', (e) => {
        if (e.detail.page === 'settings') loadSettings();
    });

    // Init
    loadSettings();
})();
