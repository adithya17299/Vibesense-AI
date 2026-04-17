/* ── Dashboard SPA Router ─────────────────────────── */

(function () {
    const navBtns = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page-section');

    function navigateTo(pageId) {
        // Update nav buttons
        navBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === pageId);
        });

        // Show/hide pages
        pages.forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageId}`);
        });

        // Trigger page-specific init
        window.dispatchEvent(new CustomEvent('page-change', { detail: { page: pageId } }));
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });

    // ── Alert Toast Handler ──────────────────────────
    ws.on('alert', (data) => {
        const toast = document.getElementById('alert-toast');
        const msg = document.getElementById('toast-message');
        const report = data.report || {};
        msg.textContent = `■ ALERT DISPATCHED → ${report.structure_id || 'Unknown'} · ${report.threat_level || 'DANGER'} · ${new Date().toLocaleTimeString()}`;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 6000);
    });

    // ── Connection status → heartbeat ────────────────
    ws.on('connection', (data) => {
        const dot = document.getElementById('heartbeat-dot');
        if (dot) {
            dot.style.background = data.connected ? 'var(--success)' : 'var(--danger)';
        }
    });

})();
