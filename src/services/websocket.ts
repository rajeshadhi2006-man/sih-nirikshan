// ========================================================================
// REAL-TIME WEBSOCKET SERVICE WITH EXPONENTIAL BACKOFF
// ========================================================================
import { ConnectionState } from '../types/location';
import { getWsBaseUrl } from '../config/apiConfig';

export type MessageHandler = (payload: { event: string; data?: any }) => void;
export type StatusHandler = (status: ConnectionState, detail?: string) => void;

class RealtimeWebSocketService {
  private ws: WebSocket | null = null;
  private customUrl?: string;
  private messageListeners: Set<MessageHandler> = new Set();
  private statusListeners: Set<StatusHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private baseReconnectDelayMs = 1000;
  private maxReconnectDelayMs = 20000;
  private reconnectTimer: any = null;
  private heartbeatInterval: any = null;
  private isIntentionallyClosed = false;
  private currentStatus: ConnectionState = 'CONNECTING';

  constructor(url?: string) {
    this.customUrl = url;
  }

  private getEffectiveUrl(): string {
    if (this.customUrl) return this.customUrl;
    return getWsBaseUrl();
  }

  public getStatus(): ConnectionState {
    return this.currentStatus;
  }

  public setStatus(status: ConnectionState, detail?: string) {
    this.currentStatus = status;
    this.statusListeners.forEach((fn) => fn(status, detail));
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionallyClosed = false;
    this.setStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    try {
      const targetUrl = this.getEffectiveUrl();
      this.ws = new WebSocket(targetUrl);

      this.ws.onopen = () => {
        const wasReconnecting = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;
        this.setStatus('CONNECTED', wasReconnecting ? 'CONNECTION RESTORED' : 'CONNECTED');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.messageListeners.forEach((listener) => listener(parsed));
        } catch (err) {
          console.warn('[WebSocket Service] JSON parse error:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[WebSocket Service] Socket error:', err);
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        if (!this.isIntentionallyClosed) {
          this.setStatus('CONNECTION_LOST');
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.setStatus('CONNECTION_LOST');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isIntentionallyClosed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.reconnectAttempts += 1;
    // Calculate exponential backoff: 1s, 2s, 4s, 8s, ... up to 30s max
    const delay = Math.min(
      this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelayMs
    );

    this.setStatus('RECONNECTING', `Attempting reconnect in ${Math.round(delay / 1000)}s... (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: 'HEARTBEAT', timestamp: Date.now() });
    }, 20000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public onMessage(handler: MessageHandler): () => void {
    this.messageListeners.add(handler);
    this.connect();
    return () => {
      this.messageListeners.delete(handler);
    };
  }

  public onStatusChange(handler: StatusHandler): () => void {
    this.statusListeners.add(handler);
    handler(this.currentStatus);
    return () => {
      this.statusListeners.delete(handler);
    };
  }

  public send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public disconnect() {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('CONNECTION_LOST', 'Disconnected manually');
  }
}

export const realtimeWebSocket = new RealtimeWebSocketService();
