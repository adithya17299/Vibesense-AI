/* ── Overview Page Logic ──────────────────────────── */

(function () {
    let resonanceChart = null;
    let fftChart = null;
    const sessionStart = Date.now();
    const resonanceData = [];
    const MAX_POINTS = 120;

    // ── Source Toggle ────────────────────────────────
    document.querySelectorAll('#page-overview .source-toggle .seg-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            this.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const source = this.dataset.source;
            const videoBar = document.getElementById('video-input-bar');
            const ipcamBar = document.getElementById('ipcam-input-bar');

            videoBar.style.display = 'none';
            ipcamBar.style.display = 'none';

            if (source === 'video') {
                videoBar.style.display = 'flex';
            } else if (source === 'ipcam') {
                ipcamBar.style.display = 'flex';
            } else {
                fetch('/api/source', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'webcam' })
                });
            }
        });
    });

    // Video file input handler
    const videoInput = document.getElementById('video-file-input');
    if (videoInput) {
        videoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async () => {
                await fetch('/api/source', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'video',
                        video_data: reader.result
                    })
                });
            };
            reader.readAsDataURL(file);
        });
    }

    // IP Camera connect handler (Overview)
    const ipcamConnectBtn = document.getElementById('ipcam-connect-btn');
    if (ipcamConnectBtn) {
        ipcamConnectBtn.addEventListener('click', async () => {
            const urlInput = document.getElementById('ipcam-url-input');
            const status = document.getElementById('ipcam-status');
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

    // ── Init Charts ─────────────────────────────────
    function initCharts() {
        const resCtx = document.getElementById('resonance-chart');
        const fftCtx = document.getElementById('fft-chart');

        if (!resCtx || !fftCtx) return;

        Chart.defaults.color = '#555568';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.04)';
        Chart.defaults.font.family = "'JetBrains Mono', monospace";
        Chart.defaults.font.size = 10;

        resonanceChart = new Chart(resCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Global Resonance',
                    data: [],
                    borderColor: '#00ffc8',
                    backgroundColor: 'rgba(0,255,200,0.05)',
                    borderWidth: 1.5,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: true, grid: { display: false }, ticks: { maxTicksLimit: 6 } },
                    y: {
                        display: true,
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        suggestedMin: 0,
                        suggestedMax: 0.1
                    }
                }
            }
        });

        fftChart = new Chart(fftCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Magnitude',
                    data: [],
                    backgroundColor: 'rgba(0,212,255,0.4)',
                    borderColor: '#00d4ff',
                    borderWidth: 1,
                    borderRadius: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: true, grid: { display: false }, title: { display: true, text: 'Hz', color: '#555568' } },
                    y: {
                        display: true,
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        suggestedMin: 0,
                        suggestedMax: 0.5
                    }
                }
            }
        });
    }

    // ── WebSocket Data Handler ───────────────────────
    ws.on('frame', (data) => {
        // Render camera feed with overlay
        mainCamera.renderFrame(data);

        // Update gauges
        healthGauge.draw(data.health_score || 0);
        updateThreatMeter(data.threat_level || 'NORMAL');
        updateVUMeter(data.amplitude || 0);

        // Update stat tiles
        document.getElementById('stat-freq').innerHTML = `${(data.frequency || 0).toFixed(2)}<span class="text-dim text-sm">Hz</span>`;
        document.getElementById('stat-amp').innerHTML = `${(data.amplitude || 0).toFixed(4)}<span class="text-dim text-sm">mm</span>`;
        document.getElementById('stat-joints').textContent = data.joint_count || 0;

        // Uptime
        const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
        const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        document.getElementById('stat-uptime').textContent = `${hrs}:${mins}:${secs}`;

        // System status updates
        if (data.detected) {
            document.getElementById('ss-target').textContent = (data.class_name || 'STRUCTURE').toUpperCase();
            document.getElementById('ss-target').closest('.status-line').querySelector('.led').className = 'led green pulse';
        } else {
            document.getElementById('ss-target').textContent = 'SCANNING...';
            document.getElementById('ss-target').closest('.status-line').querySelector('.led').className = 'led amber pulse';
        }

        // --- Bridge Condition Update ---
        const bridgeDisplay = document.getElementById('bridge-condition-display');
        const bridgeLed = document.getElementById('bridge-condition-led');
        const threat = data.threat_level || 'NORMAL';

        if (threat === 'DANGER') {
            bridgeDisplay.style.background = 'rgba(230, 57, 70, 0.1)';
            bridgeDisplay.style.borderColor = 'rgba(230, 57, 70, 0.3)';
            bridgeDisplay.style.color = 'var(--danger)';
            bridgeDisplay.innerHTML = '<span class="led red pulse" id="bridge-condition-led"></span> BRIDGE: DANGER (CRITICAL)';
        } else if (threat === 'WARNING') {
            bridgeDisplay.style.background = 'rgba(230, 149, 0, 0.1)';
            bridgeDisplay.style.borderColor = 'rgba(230, 149, 0, 0.3)';
            bridgeDisplay.style.color = 'var(--amber)';
            bridgeDisplay.innerHTML = '<span class="led amber pulse" id="bridge-condition-led"></span> BRIDGE: WARNING (ELEVATED)';
        } else {
            bridgeDisplay.style.background = 'rgba(5, 150, 105, 0.1)';
            bridgeDisplay.style.borderColor = 'rgba(5, 150, 105, 0.3)';
            bridgeDisplay.style.color = 'var(--success)';
            bridgeDisplay.innerHTML = '<span class="led green" id="bridge-condition-led"></span> BRIDGE: SAFE (NOMINAL)';
        }

        // Update resonance chart
        if (resonanceChart) {
            const now = new Date().toLocaleTimeString();
            resonanceChart.data.labels.push(now);
            resonanceChart.data.datasets[0].data.push(data.amplitude || 0);

            if (resonanceChart.data.labels.length > MAX_POINTS) {
                resonanceChart.data.labels.shift();
                resonanceChart.data.datasets[0].data.shift();
            }
            resonanceChart.update('none');
        }

        // Update FFT chart
        if (fftChart && data.fft_spectrum && data.fft_spectrum.length > 0) {
            fftChart.data.labels = data.fft_spectrum.map(d => d.frequency.toFixed(1));
            fftChart.data.datasets[0].data = data.fft_spectrum.map(d => d.magnitude);

            // Highlight peak
            const maxIdx = data.fft_spectrum.reduce((mi, d, i, arr) => d.magnitude > arr[mi].magnitude ? i : mi, 0);
            fftChart.data.datasets[0].backgroundColor = data.fft_spectrum.map((_, i) =>
                i === maxIdx ? 'rgba(0,255,200,0.7)' : 'rgba(0,212,255,0.3)'
            );
            fftChart.update('none');
        }

        // --- Latency Profile Update ---
        if (data.perf) {
            const p = data.perf;
            const capEl = document.getElementById('perf-cap');
            const infEl = document.getElementById('perf-inf');
            const encEl = document.getElementById('perf-enc');
            const totalEl = document.getElementById('perf-total');
            const fpsEl = document.getElementById('perf-fps');
            
            if (capEl) capEl.textContent = `${p.capture_ms.toFixed(1)}ms`;
            if (infEl) infEl.textContent = `${(p.inference_ms + (p.stabilize_ms || 0)).toFixed(1)}ms`;
            if (encEl) encEl.textContent = `${p.encode_ms.toFixed(1)}ms`;
            
            const total = p.capture_ms + p.inference_ms + (p.stabilize_ms || 0) + p.encode_ms;
            if (totalEl) {
                totalEl.textContent = `${total.toFixed(1)}ms`;
                totalEl.style.color = total < 200 ? 'var(--success)' : 'var(--amber)';
            }
            if (fpsEl) fpsEl.textContent = p.fps ? p.fps.toFixed(1) : '0.0';
            
            // Sync with sidebar/footer if they exist
            const siFrames = document.getElementById('si-frames');
            if (siFrames) siFrames.textContent = String(data.total_frames || 0).padStart(6, '0');
        }
    });

    // ── Load Incident Reports ───────────────────────
    async function loadIncidents() {
        try {
            const res = await fetch('/api/reports?limit=10');
            const data = await res.json();
            const list = document.getElementById('incident-list');

            if (!data.reports || data.reports.length === 0) {
                // Clear list if no data from backend
                list.innerHTML = `<div class="text-dim text-xs mono" style="text-align:center;padding:20px;">NO INCIDENTS</div>`;
                return;
            }

            list.innerHTML = data.reports.map(r => {
                const threatClass = (r.threat_level || 'UNKNOWN').toLowerCase();
                return `
                <div class="incident-card" style="display:flex; flex-direction:column; gap:8px;">
                    <div style="font-family:var(--mono); color:var(--text-dim); font-size:10px;">
                        ${new Date(r.timestamp).toLocaleString()}
                    </div>
                    <div style="font-family:var(--mono); color:var(--text); font-size:12px; font-weight:600;">
                        ${r.structure_id || 'Unknown'}
                    </div>
                    <div style="font-family:var(--mono); color:var(--text-secondary); font-size:10px;">
                        Peak: ${r.amplitude?.toFixed(4) || '0'}mm
                    </div>
                    <div class="incident-status ${threatClass}" style="width:100%; justify-content:flex-start;">
                        ${r.threat_level || 'UNKNOWN'}
                    </div>
                </div>
            `}).join('');
        } catch (e) {
            console.error('Failed to load incidents:', e);
        }
    }

    // ── Alert Event → Refresh Incidents ─────────────
    ws.on('alert', () => {
        setTimeout(loadIncidents, 1000);
    });

    // Initialize
    initCharts();
    loadIncidents();
    setInterval(loadIncidents, 30000);
})();
