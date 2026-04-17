/* ── WebSocket Client ─────────────────────────────── */

class VibraSenseWS {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.listeners = {};
        this.reconnectInterval = 2000;
        this.connect();
    }

    connect() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${proto}//${location.host}/ws/stream`);

        this.ws.onopen = () => {
            this.connected = true;
            this.emit('connection', { connected: true });
            console.log('[WS] Connected');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'ALERT') {
                    this.emit('alert', data);
                } else if (data.type === 'frame') {
                    this.emit('frame', data);
                }
                this.emit('data', data);
            } catch (e) {
                console.error('[WS] Parse error:', e);
            }
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.emit('connection', { connected: false });
            console.log('[WS] Disconnected, reconnecting...');
            setTimeout(() => this.connect(), this.reconnectInterval);
        };

        this.ws.onerror = (err) => {
            console.error('[WS] Error:', err);
        };
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        (this.listeners[event] || []).forEach(cb => cb(data));
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
}

// Global WebSocket instance
const ws = new VibraSenseWS();
