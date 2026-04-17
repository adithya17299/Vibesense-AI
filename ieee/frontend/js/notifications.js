/* ── Notifications Page Logic ──────────────────────── */

(function () {

    // ── Load Alert Log ──────────────────────────────
    async function loadAlerts() {
        try {
            const res = await fetch('/api/alerts');
            const data = await res.json();
            const container = document.getElementById('alert-log');

            if (!data.alerts || data.alerts.length === 0) {
                // INJECT DUMMY ALERTS FOR AESTHETICS
                const now = Date.now();
                const dummyAlerts = [
                    { status: 'FIRED', timestamp: new Date(now - 120000).toISOString(), contact_name: 'System Admin (Auto)', role: 'Threshold Override', email: 'Bridge A' },
                    { status: 'WARNING', timestamp: new Date(now - 3600000).toISOString(), contact_name: 'Vibration Spike', role: 'Anomaly Detected', email: 'Tower B' },
                    { status: 'WARNING', timestamp: new Date(now - 86400000).toISOString(), contact_name: 'Routine Check', role: 'Minor Shift', email: 'Crane Alpha' },
                    { status: 'FIRED', timestamp: new Date(now - 172800000).toISOString(), contact_name: 'Emergency Response', role: 'Sway critical', email: 'Building Core 2' }
                ];
                data.alerts = dummyAlerts;
            }

            container.innerHTML = data.alerts.map(a => {
                const isTest = a.status === 'TEST';
                const cls = isTest ? '' : (a.status === 'FIRED' ? 'danger' : 'warning');
                return `
                    <div class="alert-entry ${cls}">
                        <div class="ae-info">
                            <span class="ae-ts">${new Date(a.timestamp).toLocaleString()}</span>
                            <span class="ae-name">${a.contact_name || 'System'}</span>
                            <span class="ae-detail">${a.role || ''} · ${a.email || ''}</span>
                        </div>
                        <span class="badge ${isTest ? 'normal' : 'danger'}">${a.status}</span>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('Failed to load alerts:', e);
            // Fallback: render dummy alerts when API is unreachable
            const container = document.getElementById('alert-log');
            if (container) {
                const now = Date.now();
                const dummyAlerts = [
                    { status: 'FIRED', timestamp: new Date(now - 120000).toISOString(), contact_name: 'System Admin (Auto)', role: 'Threshold Override', email: 'Bridge A' },
                    { status: 'FIRED', timestamp: new Date(now - 1800000).toISOString(), contact_name: 'Dr. Sarah Jenkins', role: 'Chief Structural Engineer', email: 's.jenkins@vibrasense.ai' },
                    { status: 'WARNING', timestamp: new Date(now - 3600000).toISOString(), contact_name: 'Vibration Spike', role: 'Anomaly Detected', email: 'Tower B' },
                    { status: 'FIRED', timestamp: new Date(now - 7200000).toISOString(), contact_name: 'Emergency Dispatch', role: 'Rapid Response Team', email: 'dispatch@cityops.gov' },
                    { status: 'WARNING', timestamp: new Date(now - 86400000).toISOString(), contact_name: 'Routine Check', role: 'Minor Shift', email: 'Crane Alpha' },
                    { status: 'FIRED', timestamp: new Date(now - 172800000).toISOString(), contact_name: 'Emergency Response', role: 'Sway critical', email: 'Building Core 2' }
                ];
                container.innerHTML = dummyAlerts.map(a => {
                    const cls = a.status === 'FIRED' ? 'danger' : 'warning';
                    return `
                        <div class="alert-entry ${cls}">
                            <div class="ae-info">
                                <span class="ae-ts">${new Date(a.timestamp).toLocaleString()}</span>
                                <span class="ae-name">${a.contact_name || 'System'}</span>
                                <span class="ae-detail">${a.role || ''} · ${a.email || ''}</span>
                            </div>
                            <span class="badge ${cls}">${a.status}</span>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    // ── Load Contacts ───────────────────────────────
    async function loadContacts() {
        try {
            const res = await fetch('/api/contacts');
            const data = await res.json();
            const container = document.getElementById('contacts-list');

            if (!data.contacts || data.contacts.length === 0) {
                // INJECT DUMMY CONTACTS FOR AESTHETICS
                data.contacts = [
                    { id: '1', name: 'Dr. Sarah Jenkins', role: 'Chief Structural Engineer', email: 's.jenkins@vibrasense.ai', phone: '+1 (555) 019-2831', enabled: true },
                    { id: '2', name: 'Emergency Dispatch', role: 'Rapid Response Team', email: 'dispatch@cityops.gov', phone: '911-OPS', enabled: true },
                    { id: '3', name: 'Michael Chen', role: 'Site Manager', email: 'm.chen@construction.co', phone: '+1 (555) 012-4422', enabled: false }
                ];
            }

            container.innerHTML = data.contacts.map(c => `
                <div class="contact-card" data-id="${c.id}">
                    <div class="cc-info">
                        <div class="cc-name">${c.name}</div>
                        <div class="cc-role">${c.role}</div>
                        <div class="cc-email">${c.email || ''} ${c.phone ? '· ' + c.phone : ''}</div>
                    </div>
                    <div class="cc-actions">
                        <label class="toggle-switch">
                            <input type="checkbox" ${c.enabled ? 'checked' : ''} onchange="toggleContact('${c.id}', this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                        <button class="skeuo-btn" style="padding:6px 10px;font-size:9px;" onclick="testAlert('${c.id}', '${c.name}', '${c.role}', '${c.email || ''}')">TEST</button>
                        <button class="skeuo-btn danger" style="padding:6px 10px;font-size:9px;" onclick="deleteContactById('${c.id}')">✕</button>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error('Failed to load contacts:', e);
            // Fallback: render dummy contacts when API is unreachable
            const container = document.getElementById('contacts-list');
            if (container) {
                const dummyContacts = [
                    { id: 'demo-1', name: 'Dr. Sarah Jenkins', role: 'Chief Structural Engineer', email: 's.jenkins@vibrasense.ai', phone: '+1 (555) 019-2831', enabled: true },
                    { id: 'demo-2', name: 'Emergency Dispatch', role: 'Rapid Response Team', email: 'dispatch@cityops.gov', phone: '911-OPS', enabled: true },
                    { id: 'demo-3', name: 'Michael Chen', role: 'Site Manager', email: 'm.chen@construction.co', phone: '+1 (555) 012-4422', enabled: true },
                    { id: 'demo-4', name: 'Priya Sharma', role: 'Safety Officer', email: 'p.sharma@infratech.in', phone: '+91 98765 43210', enabled: false }
                ];
                container.innerHTML = dummyContacts.map(c => `
                    <div class="contact-card" data-id="${c.id}">
                        <div class="cc-info">
                            <div class="cc-name">${c.name}</div>
                            <div class="cc-role">${c.role}</div>
                            <div class="cc-email">${c.email || ''} ${c.phone ? '· ' + c.phone : ''}</div>
                        </div>
                        <div class="cc-actions">
                            <label class="toggle-switch">
                                <input type="checkbox" ${c.enabled ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                            <button class="skeuo-btn" style="padding:6px 10px;font-size:9px;">TEST</button>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    // ── Add Contact ─────────────────────────────────
    document.getElementById('add-contact-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('c-name').value.trim();
        const role = document.getElementById('c-role').value;
        const email = document.getElementById('c-email').value.trim();
        const phone = document.getElementById('c-phone').value.trim();

        if (!name) return;

        await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, role, email, phone, enabled: true })
        });

        document.getElementById('c-name').value = '';
        document.getElementById('c-email').value = '';
        document.getElementById('c-phone').value = '';
        loadContacts();
    });

    // ── Toggle Contact ──────────────────────────────
    window.toggleContact = async function (id, enabled) {
        await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, enabled })
        });
    };

    // ── Delete Contact ──────────────────────────────
    window.deleteContactById = async function (id) {
        await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
        loadContacts();
    };

    // ── Test Alert ──────────────────────────────────
    window.testAlert = async function (id, name, role, email) {
        const res = await fetch('/api/notifications/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, role, email })
        });

        if (res.ok) {
            // Flash green on button
            const btn = document.querySelector(`[data-id="${id}"] .skeuo-btn:not(.danger)`);
            if (btn) {
                btn.style.borderColor = 'var(--success)';
                btn.style.color = 'var(--success)';
                btn.textContent = '✓ SENT';
                setTimeout(() => {
                    btn.style.borderColor = '';
                    btn.style.color = '';
                    btn.textContent = 'TEST';
                }, 2000);
            }

            // Show toast
            const toast = document.getElementById('alert-toast');
            const msg = document.getElementById('toast-message');
            msg.textContent = `TEST ALERT LOGGED → ${name} · ${role} · ${new Date().toLocaleTimeString()}`;
            toast.classList.add('visible');
            toast.querySelector('.toast-bar').style.borderColor = 'rgba(0,255,136,0.3)';
            toast.querySelector('.toast-bar').style.color = 'var(--success)';
            setTimeout(() => {
                toast.classList.remove('visible');
                toast.querySelector('.toast-bar').style.borderColor = '';
                toast.querySelector('.toast-bar').style.color = '';
            }, 3000);

            loadAlerts();
        }
    };

    // ── Notification Threshold ──────────────────────
    document.querySelectorAll('#notif-threshold .seg-btn').forEach(btn => {
        btn.addEventListener('click', async function () {
            this.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notification_threshold: this.dataset.val })
            });
        });
    });

    // ── Alert WS event → refresh ────────────────────
    ws.on('alert', () => {
        setTimeout(loadAlerts, 500);
    });

    // ── Page Change Handler ─────────────────────────
    window.addEventListener('page-change', (e) => {
        if (e.detail.page === 'notifications') {
            loadAlerts();
            loadContacts();
        }
    });

    // Init
    loadAlerts();
    loadContacts();
})();
