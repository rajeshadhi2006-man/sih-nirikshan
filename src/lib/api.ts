// ========================================================================
// PYTHON FASTAPI & WEBSOCKET BACKEND CLIENT
// ========================================================================

import { API_BASE_URL, getWsBaseUrl } from '../config/apiConfig';

export { API_BASE_URL };
export const WS_URL = getWsBaseUrl('/ws/live');

// Generic fetch wrapper with timeout & error handling
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// REST Endpoints
export async function apiFetchHealth() {
  return apiRequest<any>('/api/health');
}

export async function apiFetchUsers() {
  return apiRequest<any[]>('/api/users');
}

export async function apiEnrollUser(data: {
  officer_id: string;
  full_name: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  role?: string;
}) {
  return apiRequest<{ success: boolean; profile: any }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiFetchGeofences() {
  return apiRequest<any[]>('/api/geofences');
}

export async function apiCreateGeofence(data: {
  name: string;
  person_id?: string;
  area_name?: string;
  department: string;
  description?: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
}) {
  return apiRequest<{ success: boolean; geofence: any }>('/api/geofences', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiDeleteGeofence(geofenceId: string) {
  return apiRequest<{ success: boolean }>(`/api/geofences/${geofenceId}`, {
    method: 'DELETE',
  });
}

export async function apiCheckGeofence(data: {
  latitude: number;
  longitude: number;
  geofence_id?: string;
  buffer_meters?: number;
  polygon_coords?: [number, number][];
}) {
  return apiRequest<{
    geofence_id?: string;
    geofence_name?: string;
    department?: string;
    is_inside: boolean;
    in_buffer?: boolean;
    status: string;
    distance_meters?: number;
    delta_meters?: number;
    bearing_degrees?: number;
    vertex_count?: number;
  }>('/api/geofence/check', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiCheckAllGeofences(data: {
  latitude: number;
  longitude: number;
  buffer_meters?: number;
}) {
  return apiRequest<{
    inside_any: boolean;
    matching_geofences: Array<{
      geofence_id: string;
      name: string;
      department: string;
      is_inside: boolean;
      in_buffer: boolean;
      status: string;
      distance_meters: number;
      delta_meters: number;
      bearing_degrees: number;
    }>;
    closest_geofence: any;
    total_active_geofences: number;
    latitude: number;
    longitude: number;
  }>('/api/geofence/check-all', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function apiFetchAlerts() {
  return apiRequest<any[]>('/api/alerts');
}

export async function apiAcknowledgeAlert(alertId: string) {
  return apiRequest<{ success: boolean }>(`/api/alerts/${alertId}/acknowledge`, {
    method: 'POST',
  });
}

export async function apiSendTelemetry(ping: {
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  full_name?: string;
  officer_id?: string;
  department?: string;
  designation?: string;
}) {
  return apiRequest<{ success: boolean; geofence_status: string; is_inside: boolean }>(
    '/api/telemetry',
    {
      method: 'POST',
      body: JSON.stringify(ping),
    }
  );
}

export async function apiSimulateBreach(userId?: string) {
  return apiRequest<any>('/api/action/simulate-breach', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function apiRestoreSafe(userId?: string) {
  return apiRequest<any>('/api/action/restore-safe', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function apiDispatchIntercept(targetUserId?: string) {
  return apiRequest<any>('/api/action/dispatch-intercept', {
    method: 'POST',
    body: JSON.stringify({ target_user_id: targetUserId }),
  });
}

export async function apiVerifyBiometric(userId: string, type: 'FACE' | 'VOICE' | 'LOCATION' = 'FACE', isSpoof = false) {
  return apiRequest<any>('/api/verification/verify', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      verification_type: type,
      is_spoof_simulation: isSpoof,
    }),
  });
}

export async function apiCheckIn(userId: string, latitude?: number, longitude?: number) {
  return apiRequest<any>('/api/attendance/check-in', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, latitude, longitude }),
  });
}

export async function apiFetchAuditLogs() {
  return apiRequest<any[]>('/api/audit-logs');
}

// ========================================================================
// REAL-TIME WEBSOCKET HUB LISTENER
// ========================================================================
type WebSocketListener = (event: { event: string; data?: any }) => void;

class RealtimeWebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Set<WebSocketListener> = new Set();
  private reconnectTimer: any = null;
  private isExplicitlyClosed = false;

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[Python WS] Connected to Python Telemetry Hub at', WS_URL);
      };

      this.ws.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          this.listeners.forEach((listener) => listener(parsed));
        } catch (err) {
          console.warn('[Python WS Parse Error]', err);
        }
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed) {
          console.warn('[Python WS] Disconnected. Reconnecting in 3s...');
          this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[Python WS Error]', err);
      };
    } catch (err) {
      console.warn('[Python WS Init Error]', err);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
  }

  public subscribe(listener: WebSocketListener): () => void {
    this.listeners.add(listener);
    this.connect();
    return () => {
      this.listeners.delete(listener);
    };
  }

  public send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public close() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const realtimeWS = new RealtimeWebSocketClient();
