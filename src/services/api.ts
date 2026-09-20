// ========================================================================
// FASTAPI REST SERVICE CLIENT
// ========================================================================
import { LocationObject, UserLocation, CircularGeofence, AttendanceVerificationPayload } from '../types/location';

const getApiBaseUrl = (): string => {
  if (import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:8000';
};

export const API_BASE_URL = getApiBaseUrl();

async function safeFetch(urlOrPath: string, init?: RequestInit): Promise<Response> {
  const fullUrl = urlOrPath.startsWith('http') ? urlOrPath : `${API_BASE_URL}${urlOrPath}`;
  try {
    const res = await fetch(fullUrl, init);
    return res;
  } catch (err) {
    if (typeof window !== 'undefined' && !urlOrPath.startsWith('http')) {
      // Fallback to relative path through dev proxy
      return await fetch(urlOrPath, init);
    }
    throw err;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}`;
    try {
      const jsonErr = await res.json();
      errorDetail = jsonErr.detail || jsonErr.message || JSON.stringify(jsonErr);
    } catch {
      errorDetail = await res.text();
    }
    throw new Error(errorDetail);
  }
  return res.json();
}

/**
 * Update a user's GPS location via REST POST.
 */
export async function apiUpdateLocation(payload: LocationObject): Promise<UserLocation> {
  const res = await safeFetch(`/api/location/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<UserLocation>(res);
}

/**
 * Fetch latest locations of all tracked users with optional breadcrumbs history.
 */
export async function apiGetUsersLocations(includeHistory = true, limit = 30): Promise<UserLocation[]> {
  const res = await safeFetch(`/api/users/locations?history=${includeHistory}&limit=${limit}`);
  return handleResponse<UserLocation[]>(res);
}

/**
 * Fetch latest location and route history for a single user.
 */
export async function apiGetUserLocation(userId: string, includeHistory = true, limit = 50): Promise<UserLocation> {
  const res = await safeFetch(`/api/users/${userId}/location?history=${includeHistory}&limit=${limit}`);
  return handleResponse<UserLocation>(res);
}

/**
 * Verify attendance using GPS coordinates, Geofence radius check, and biometric hooks.
 */
export async function apiVerifyAttendance(payload: AttendanceVerificationPayload) {
  const res = await safeFetch(`/api/attendance/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}

/**
 * Fetch all defined geofences.
 */
export async function apiGetGeofences(): Promise<CircularGeofence[]> {
  const res = await safeFetch(`/api/geofences`);
  return handleResponse<CircularGeofence[]>(res);
}

/**
 * Create a new circular geofence.
 */
export async function apiCreateGeofence(geofence: Omit<CircularGeofence, 'id'>): Promise<CircularGeofence> {
  const res = await safeFetch(`/api/geofences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geofence),
  });
  const data = await handleResponse<{ success: boolean; geofence: CircularGeofence }>(res);
  return data.geofence;
}

/**
 * Check if coordinates are inside a specific geofence or polygon.
 */
export async function apiCheckGeofence(payload: {
  latitude: number;
  longitude: number;
  geofence_id?: string;
  buffer_meters?: number;
  polygon_coords?: [number, number][];
}): Promise<any> {
  const res = await safeFetch(`/api/geofence/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}

/**
 * Check coordinates against all active geofences simultaneously.
 */
export async function apiCheckAllGeofences(payload: {
  latitude: number;
  longitude: number;
  buffer_meters?: number;
}): Promise<any> {
  const res = await safeFetch(`/api/geofence/check-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<any>(res);
}

/**
 * Check backend health & telemetry kernel statistics.
 */
export async function apiGetHealth(): Promise<any> {
  const res = await safeFetch(`/api/health`);
  return handleResponse<any>(res);
}

// ========================================================================
// AUTOMATIC GEOFENCE ATTENDANCE REST CLIENT
// ========================================================================

export interface EnrollAttendanceUserPayload {
  user_id: string;
  name: string;
  authorized_location: string;
  geofence_center_lat: number;
  geofence_center_lng: number;
  geofence_radius?: number;
  geofence_id?: string;
}

/**
 * Enroll a user for zero-manual automatic geofence attendance.
 */
export async function apiEnrollAttendanceUser(payload: EnrollAttendanceUserPayload) {
  const res = await safeFetch(`/api/attendance/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ success: boolean; enrolled: any }>(res);
}

/**
 * Fetch all enrolled attendance users.
 */
export async function apiGetEnrolledAttendanceUsers(): Promise<any[]> {
  const res = await safeFetch(`/api/attendance/enrolled`);
  return handleResponse<any[]>(res);
}

/**
 * Fetch real-time automatic attendance dashboard cards & live user table.
 */
export async function apiGetLiveAttendance(): Promise<{
  stats: {
    total_enrolled: number;
    present_count: number;
    leave_count: number;
    gps_uncertain_count: number;
    signal_lost_count: number;
  };
  records: any[];
}> {
  const res = await safeFetch(`/api/attendance/live`);
  return handleResponse<any>(res);
}

/**
 * Fetch complete attendance audit sessions history with optional filters.
 */
export async function apiGetAttendanceHistory(params?: {
  date?: string;
  user_id?: string;
  status?: string;
  limit?: number;
}): Promise<any[]> {
  const searchParams = new URLSearchParams();
  if (params?.date) searchParams.append('date', params.date);
  if (params?.user_id) searchParams.append('user_id', params.user_id);
  if (params?.status && params.status !== 'ALL') searchParams.append('status', params.status);
  if (params?.limit) searchParams.append('limit', params.limit.toString());

  const url = `/api/attendance/history${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const res = await safeFetch(url);
  return handleResponse<any[]>(res);
}

/**
 * Delete an enrolled user from automatic geofence attendance.
 */
export async function apiDeleteEnrolledAttendanceUser(userId: string): Promise<{ success: boolean; message: string }> {
  const res = await safeFetch(`/api/attendance/enrolled/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  return handleResponse<{ success: boolean; message: string }>(res);
}

/**
 * Delete a specific attendance session history record.
 */
export async function apiDeleteAttendanceHistory(attendanceId: string): Promise<{ success: boolean; message: string }> {
  const res = await safeFetch(`/api/attendance/history/${encodeURIComponent(attendanceId)}`, {
    method: 'DELETE',
  });
  return handleResponse<{ success: boolean; message: string }>(res);
}

/**
 * Clear/prune attendance history logs.
 */
export async function apiClearAttendanceHistory(date?: string): Promise<{ success: boolean; message: string }> {
  const url = `/api/attendance/history${date ? `?date=${encodeURIComponent(date)}` : ''}`;
  const res = await safeFetch(url, {
    method: 'DELETE',
  });
  return handleResponse<{ success: boolean; message: string }>(res);
}

