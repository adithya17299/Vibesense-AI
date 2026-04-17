/* ── Historical Data Page Logic ────────────────────── */

(function () {
    let timelineChart = null;
    let currentPage = 0;
    const PAGE_SIZE = 20;
    let allReports = [];

    // ── Filter Bar ──────────────────────────────────
    document.querySelectorAll('#page-historical .segmented-control .seg-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            this.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    document.getElementById('hist-filter-btn')?.addEventListener('click', loadData);
    document.getElementById('hist-prev')?.addEventListener('click', () => {
        if (currentPage > 0) { currentPage--; renderTable(); }
    });
    document.getElementById('hist-next')?.addEventListener('click', () => {
        if ((currentPage + 1) * PAGE_SIZE < allReports.length) { currentPage++; renderTable(); }
    });

    // ── Generate Fake Demo Data ──────────────────────
    function generateFakeData() {
        const structures = [
            'Bridge-A7', 'Bridge-B3', 'Crane-C1', 'Crane-C4',
            'Building-D2', 'Building-D5', 'Tower-E1', 'Bridge-F9'
        ];
        const now = Date.now();
        const DAY = 86400000;
        const records = [];

        for (let i = 0; i < 60; i++) {
            // Spread across the last 7 days with some clustering
            const daysAgo = Math.random() * 7;
            const hourOffset = Math.random() * 24;
            const ts = new Date(now - daysAgo * DAY + hourOffset * 3600000);

            const structureId = structures[Math.floor(Math.random() * structures.length)];

            // Create realistic amplitude patterns with occasional spikes
            const baseAmp = 0.05 + Math.random() * 0.25;
            const spike = Math.random() > 0.82 ? (0.4 + Math.random() * 0.6) : 0;
            const amplitude = parseFloat((baseAmp + spike).toFixed(4));

            // Frequency correlated loosely with structure type
            const baseFreq = structureId.startsWith('Bridge') ? 2.5 :
                             structureId.startsWith('Crane') ? 4.2 :
                             structureId.startsWith('Tower') ? 1.8 : 3.0;
            const frequency = parseFloat((baseFreq + (Math.random() - 0.5) * 2.0).toFixed(2));

            // Threat level based on amplitude
            let threat_level = 'NORMAL';
            if (amplitude >= 0.7) threat_level = 'DANGER';
            else if (amplitude >= 0.3) threat_level = 'WARNING';

            // Health score inversely correlated with amplitude
            const healthBase = threat_level === 'DANGER' ? 25 :
                               threat_level === 'WARNING' ? 55 : 85;
            const health_score = Math.min(100, Math.max(0,
                healthBase + (Math.random() - 0.5) * 20
            ));

            // Confidence varies by detection quality
            const confidence = parseFloat((0.55 + Math.random() * 0.44).toFixed(3));

            records.push({
                id: `demo-${i + 1}`,
                timestamp: ts.toISOString(),
                structure_id: structureId,
                frequency,
                amplitude,
                health_score,
                threat_level,
                confidence,
                snapshot_url: ''
            });
        }

        // Sort newest first
        records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return records;
    }

    // ── Load Data ───────────────────────────────────
    async function loadData() {
        try {
            const structureType = document.querySelector('#page-historical .segmented-control .seg-btn.active')?.dataset.type;
            const params = new URLSearchParams({ limit: 500 });
            if (structureType && structureType !== 'All') params.append('structure_type', structureType);

            const res = await fetch(`/api/reports?${params}`);
            const data = await res.json();

            // Use real data if available, otherwise generate demo records
            if (!data.reports || data.reports.length === 0) {
                allReports = generateFakeData();
            } else {
                allReports = data.reports;
            }

            currentPage = 0;
            renderTable();
            renderTimeline();
        } catch (e) {
            console.error('Failed to load historical data:', e);
            // Fallback to demo data when API is unreachable
            allReports = generateFakeData();
            currentPage = 0;
            renderTable();
            renderTimeline();
        }
    }

    // ── Render Timeline Chart ───────────────────────
    function renderTimeline() {
        const ctx = document.getElementById('timeline-chart');
        if (!ctx) return;

        if (timelineChart) timelineChart.destroy();

        const sorted = [...allReports].reverse();

        timelineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sorted.map(r => new Date(r.timestamp).toLocaleString()),
                datasets: [
                    {
                        label: 'Amplitude (mm)',
                        data: sorted.map(r => r.amplitude),
                        borderColor: '#00ffc8',
                        backgroundColor: 'rgba(0,255,200,0.05)',
                        borderWidth: 1.5,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Frequency (Hz)',
                        data: sorted.map(r => r.frequency),
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0,212,255,0.05)',
                        borderWidth: 1.5,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2,
                        yAxisID: 'y1',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, labels: { font: { family: "'JetBrains Mono', monospace", size: 10 }, boxWidth: 12 } },
                },
                scales: {
                    x: { display: true, grid: { display: false }, ticks: { maxTicksLimit: 8 } },
                    y: { display: true, position: 'left', grid: { color: 'rgba(255,255,255,0.03)' }, title: { display: true, text: 'Amplitude (mm)' } },
                    y1: { display: true, position: 'right', grid: { display: false }, title: { display: true, text: 'Frequency (Hz)' } },
                }
            }
        });
    }

    // ── Render Table ────────────────────────────────
    function renderTable() {
        const tbody = document.getElementById('hist-tbody');
        if (!tbody) return;

        const start = currentPage * PAGE_SIZE;
        const page = allReports.slice(start, start + PAGE_SIZE);

        if (page.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-dim text-xs mono" style="text-align:center;padding:40px;">NO RECORDS</td></tr>`;
            return;
        }

        tbody.innerHTML = page.map((r, i) => {
            const isDanger = r.threat_level === 'DANGER';
            return `
                <tr class="${isDanger ? 'danger-row' : ''}">
                    <td>${new Date(r.timestamp).toLocaleString()}</td>
                    <td>${r.structure_id || '—'}</td>
                    <td>${r.frequency?.toFixed(2) || '—'} Hz</td>
                    <td>${r.amplitude?.toFixed(4) || '—'} mm</td>
                    <td>${Math.round(r.health_score) || '—'}</td>
                    <td><span class="badge ${(r.threat_level || '').toLowerCase()}">${r.threat_level || '—'}</span></td>
                    <td>${(r.confidence * 100)?.toFixed(1) || '—'}%</td>
                    <td>${r.snapshot_url ? `<span class="snapshot-link" onclick="openSnapshotModal('${r.snapshot_url}')">📸 VIEW</span>` : '—'}</td>
                    <td><button class="expand-btn" onclick="toggleExpandRow(this, '${r.snapshot_url || ''}')">▶</button></td>
                </tr>
            `;
        }).join('');

        document.getElementById('hist-page-info').textContent = `PAGE ${currentPage + 1} / ${Math.ceil(allReports.length / PAGE_SIZE) || 1}`;
    }

    // ── Snapshot Lightbox Modal ─────────────────────
    window.openSnapshotModal = function (url) {
        const modal = document.getElementById('snapshot-modal');
        const img = document.getElementById('snapshot-modal-img');
        if (!modal || !img) return;
        img.src = url;
        modal.classList.add('active');
    };

    window.closeSnapshotModal = function () {
        const modal = document.getElementById('snapshot-modal');
        if (modal) modal.classList.remove('active');
    };

    // ── Expand Row ──────────────────────────────────
    window.toggleExpandRow = function (btn, snapshotUrl) {
        const row = btn.closest('tr');
        const next = row.nextElementSibling;

        if (next && next.classList.contains('expanded-row')) {
            next.remove();
            btn.textContent = '▶';
            return;
        }

        const expandedRow = document.createElement('tr');
        expandedRow.className = 'expanded-row';
        expandedRow.innerHTML = `<td colspan="9">${snapshotUrl ? `<img src="${snapshotUrl}" alt="Danger snapshot" onclick="openSnapshotModal('${snapshotUrl}')" style="cursor:pointer;">` : '<span class="text-dim">No snapshot available</span>'}</td>`;
        row.after(expandedRow);
        btn.textContent = '▼';
    };

    // ── Page Change Handler ─────────────────────────
    window.addEventListener('page-change', (e) => {
        if (e.detail.page === 'historical') loadData();
    });

    // Initial load
    loadData();
})();
