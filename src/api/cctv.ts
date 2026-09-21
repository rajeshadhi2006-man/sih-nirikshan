import axios from 'axios';

export interface CCTVCamera {
  id: string;
  project_id: string;
  project_name?: string;
  camera_name: string;
  location_description?: string;
  stream_url?: string;
  status: 'ONLINE' | 'OFFLINE' | 'UNCONFIGURED';
  last_heartbeat?: string;
  state?: string;
  district?: string;
  created_at: string;
}

export interface NetworkInfo {
  local_ip: string;
  frontend_port: number;
  backend_port: number;
  current_source_url: string;
  status: string;
  ws_url: string;
  stream_url: string;
}

export interface CCTVFrameData {
  camera_id: string;
  image: string; // Base64 data URL
  fps?: number;
  resolution?: string;
  officer_name?: string;
  latitude?: number;
  longitude?: number;
  battery?: number;
  timestamp?: string;
}

export interface YOLODetection {
  track_id: number | null;
  class: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface YOLOTelemetry {
  camera_id: string;
  timestamp: string;
  status: 'LIVE' | 'CONNECTING' | 'OFFLINE';
  connected?: boolean;
  is_fallback?: boolean;
  source?: string;
  last_frame?: string | null;
  fps: number;
  detections: YOLODetection[];
  counts: {
    person: number;
    vehicle: number;
    total: number;
    [key: string]: number;
  };
}


export interface CCTVConfig {
  camera_id: string;
  source_url: string;
  status: string;
  fps: number;
  model_name: string;
  confidence: number;
  imgsz: number;
  max_fps: number;
  flip_horizontal?: boolean;
}

export interface CCTVTestResponse {
  connected: boolean;
  source: string;
  protocol: string;
  message: string;
  error?: string;
  frame_size?: string;
}

export interface CCTVNetworkTestResponse {
  source: string;
  protocol: string;
  network_reachable: boolean;
  stream_opened: boolean;
  first_frame_received: boolean;
  decoder_working: boolean;
  ready_for_yolo: boolean;
  diagnostics: string;
}


import { API_BASE_URL, getApiBaseUrl, getWsBaseUrl } from '../config/apiConfig';

export { API_BASE_URL, getApiBaseUrl };

export function getCCTVStreamUrl(cameraId = 'CCTV-01', key?: number | string): string {
  return key ? `${API_BASE_URL}/api/cctv/${cameraId}/stream?k=${key}` : `${API_BASE_URL}/api/cctv/${cameraId}/stream`;
}

export function getCCTVWebSocketUrl(cameraId = 'CCTV-01'): string {
  return getWsBaseUrl(`/ws/cctv/${cameraId}`);
}

export async function fetchNetworkInfo(): Promise<NetworkInfo> {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/cctv/network-info`);
    return res.data;
  } catch (err) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    const wsProto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000';
    return {
      local_ip: host,
      frontend_port: 5173,
      backend_port: 8000,
      current_source_url: '0',
      status: 'OFFLINE',
      ws_url: `${wsProto}//${host}/ws/cctv/CCTV-01`,
      stream_url: `${origin}/api/cctv/CCTV-01/stream`,
    };
  }
}

export async function fetchCCTVConfig(): Promise<CCTVConfig | null> {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/cctv/config`);
    return res.data;
  } catch {
    return null;
  }
}

export async function updateCCTVConfig(payload: {
  source_url?: string;
  confidence?: number;
  max_fps?: number;
  imgsz?: number;
  flip_horizontal?: boolean;
}): Promise<boolean> {
  try {
    await axios.post(`${API_BASE_URL}/api/cctv/config`, payload);
    return true;
  } catch (e) {
    console.warn('Error updating CCTV config:', e);
    return false;
  }
}

export async function toggleCCTVFlip(flip?: boolean): Promise<{ success: boolean; flip_horizontal: boolean }> {
  try {
    const url = flip !== undefined ? `${API_BASE_URL}/api/cctv/flip?flip=${flip}` : `${API_BASE_URL}/api/cctv/flip`;
    const res = await axios.post(url);
    return res.data;
  } catch (e) {
    console.warn('Error toggling CCTV flip:', e);
    return { success: false, flip_horizontal: false };
  }
}

export async function fetchCCTVPercentCameras(projectId?: string): Promise<CCTVCamera[]> {
  try {
    const url = projectId
      ? `${API_BASE_URL}/api/cctv/cameras?project_id=${projectId}`
      : `${API_BASE_URL}/api/cctv/cameras`;
    const res = await axios.get(url);
    return res.data || [];
  } catch (err) {
    console.warn('[CCTV API]: Error fetching cameras', err);
    return [];
  }
}

export async function createCCTVCamera(payload: {
  project_id: string;
  camera_name: string;
  location_description?: string;
  stream_url?: string;
  status?: string;
}): Promise<CCTVCamera | null> {
  const res = await axios.post(`${API_BASE_URL}/api/cctv/cameras`, payload);
  return res.data?.camera || null;
}

export async function testCCTVConnection(sourceUrl?: string): Promise<CCTVTestResponse> {
  try {
    const res = await axios.post(`${API_BASE_URL}/api/cctv/test`, { source_url: sourceUrl });
    return res.data;
  } catch (err: any) {
    return {
      connected: false,
      source: sourceUrl || '',
      protocol: 'UNKNOWN',
      message: 'Failed to reach CCTV test endpoint',
      error: err.response?.data?.detail || err.message || 'Connection error'
    };
  }
}

export async function networkTestCCTV(sourceUrl?: string): Promise<CCTVNetworkTestResponse> {
  try {
    const res = await axios.post(`${API_BASE_URL}/api/cctv/network-test`, { source_url: sourceUrl });
    return res.data;
  } catch (err: any) {
    return {
      source: sourceUrl || '',
      protocol: 'UNKNOWN',
      network_reachable: false,
      stream_opened: false,
      first_frame_received: false,
      decoder_working: false,
      ready_for_yolo: false,
      diagnostics: `Network test failed: ${err.message}`
    };
  }
}

export interface CCTVSessionStartResponse {
  success: boolean;
  camera_id: string;
  session_id: string;
  status: string;
  officer_id?: string;
  officer_name?: string;
  device?: string;
  resolution?: string;
  fps?: number;
  ws_url: string;
  upload_url: string;
  stream_url: string;
  timestamp: string;
}

export async function startCCTVSession(payload: {
  officer_id?: string;
  officer_name?: string;
  device_model?: string;
  resolution?: string;
  fps?: number;
  project_id?: string;
}): Promise<CCTVSessionStartResponse | null> {
  try {
    const res = await axios.post(`${API_BASE_URL}/api/cctv/sessions/start`, payload);
    return res.data;
  } catch (err) {
    console.warn('Error starting CCTV session:', err);
    return null;
  }
}

export async function stopCCTVSession(cameraId: string, sessionId?: string): Promise<boolean> {
  try {
    await axios.post(`${API_BASE_URL}/api/cctv/sessions/stop`, {
      camera_id: cameraId,
      session_id: sessionId,
    });
    return true;
  } catch (err) {
    console.warn('Error stopping CCTV session:', err);
    return false;
  }
}

export async function uploadCCTVFrame(payload: CCTVFrameData) {
  try {
    const res = await axios.post(`${API_BASE_URL}/api/cctv/frame`, payload);
    return res.data?.data || null;
  } catch (e) {
    console.warn('CCTV frame upload fallback error:', e);
    return null;
  }
}


