const HEARTBEAT_INTERVAL = 8000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export class WebSocketManager {
    private _socket: WebSocket | null;
    private _roomId: string | null;
    private _userId: string | null;
    private _heartbeatTimer: ReturnType<typeof setInterval> | null;
    private _reconnectAttempt: number;
    private _handlers: Map<string, Set<(data?: any) => void>>;
    private _connected: boolean;

    constructor() {
        this._socket = null;
        this._roomId = null;
        this._userId = null;
        this._heartbeatTimer = null;
        this._reconnectAttempt = 0;
        this._handlers = new Map();
        this._connected = false;
    }

    connect(roomId: string, userId: string): void {
        this._roomId = roomId;
        this._userId = userId;
        this._createConnection();
    }

    private _createConnection(): void {
        if (this._socket) {
            this._socket.close();
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        this._socket = new WebSocket(
            `${protocol}//${window.location.host}/ws/${this._roomId}/${this._userId}`
        );

        this._socket.onopen = () => {
            this._connected = true;
            this._reconnectAttempt = 0;
            this._startHeartbeat();
            this._emit("open");
        };

        this._socket.onmessage = (event: MessageEvent) => {
            try {
                const msg = JSON.parse(event.data);
                this._emit(msg.type, msg);
            } catch (e) { }
        };

        this._socket.onclose = () => {
            this._connected = false;
            this._stopHeartbeat();
            this._emit("close");
            this._scheduleReconnect();
        };

        this._socket.onerror = () => {
            this._emit("error");
        };
    }

    private _startHeartbeat(): void {
        this._stopHeartbeat();
        this._heartbeatTimer = setInterval(() => {
            this.send({ type: "ping" });
        }, HEARTBEAT_INTERVAL);
    }

    private _stopHeartbeat(): void {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    private _scheduleReconnect(): void {
        if (!this._roomId) return;
        const delay = RECONNECT_DELAYS[Math.min(this._reconnectAttempt, RECONNECT_DELAYS.length - 1)];
        this._reconnectAttempt++;
        setTimeout(() => {
            if (!this._connected && this._roomId) {
                this._createConnection();
            }
        }, delay);
    }

    send(data: any): void {
        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
            this._socket.send(JSON.stringify(data));
        }
    }

    on(event: string, handler: (data?: any) => void): void {
        if (!this._handlers.has(event)) {
            this._handlers.set(event, new Set());
        }
        this._handlers.get(event)!.add(handler);
    }

    off(event: string, handler: (data?: any) => void): void {
        if (this._handlers.has(event)) {
            this._handlers.get(event)!.delete(handler);
        }
    }

    private _emit(event: string, data?: any): void {
        if (this._handlers.has(event)) {
            this._handlers.get(event)!.forEach(h => h(data));
        }
    }

    disconnect(): void {
        this._roomId = null;
        this._stopHeartbeat();
        if (this._socket) {
            this._socket.close();
            this._socket = null;
        }
    }

    get isConnected(): boolean {
        return this._connected;
    }
}

export const ws = new WebSocketManager();
