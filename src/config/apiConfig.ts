// ========================================================================
// CENTRALIZED API & WEBSOCKET CONFIGURATION (MoSJE Nirikshan)
// ========================================================================

// Permanent 24/7 cloud backend hosted on Render
export const CLOUD_BACKEND_URL = 'https://sih-nirikshan-o5rn.onrender.com';

/**
 * Returns the correct HTTP(S) API base URL.
 * Prioritizes:
 * 1. Explicit environment variable (VITE_API_BASE_URL or VITE_API_URL)
 * 2. If running locally on localhost/127.0.0.1 -> http://localhost:8000
 * 3. In cloud production (Cloudflare Pages, Vercel, or any custom domain) -> CLOUD_BACKEND_URL
 */
export const getApiBaseUrl = (): string => {
  const envUrl = (import.meta.env?.VITE_API_BASE_URL || import.meta.env?.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (envUrl) {
    return envUrl;
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:8000';
    }
  }

  return CLOUD_BACKEND_URL;
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Returns the correct WebSocket (ws:// or wss://) URL for any given path.
 */
export const getWsBaseUrl = (path: string = '/ws/live'): string => {
  const base = getApiBaseUrl();
  const wsProto = base.startsWith('https://') ? 'wss://' : 'ws://';
  const cleanBase = base.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${wsProto}${cleanBase}${cleanPath}`;
};
