import { apiClient } from './client';

export interface EnrollUserPayload {
  user_id: string;
  name: string;
  authorized_location: string;
  geofence_center_lat: number;
  geofence_center_lng: number;
  geofence_radius?: number;
  geofence_id?: string;
}

export const attendanceApi = {
  getAttendanceRecords: async (params?: { date?: string; user_id?: string; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.date) searchParams.append('date', params.date);
    if (params?.user_id) searchParams.append('user_id', params.user_id);
    if (params?.status && params.status !== 'ALL') searchParams.append('status', params.status);

    const url = `/api/attendance/history${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const res = await apiClient.get(url);
    return res.data;
  },
  getLiveAttendance: async () => {
    const res = await apiClient.get('/api/attendance/live');
    return res.data;
  },
  getEnrolledUsers: async () => {
    const res = await apiClient.get('/api/attendance/enrolled');
    return res.data;
  },
  enrollUser: async (payload: EnrollUserPayload) => {
    const res = await apiClient.post('/api/attendance/enroll', payload);
    return res.data;
  },
  deleteEnrolledUser: async (userId: string) => {
    const res = await apiClient.delete(`/api/attendance/enrolled/${encodeURIComponent(userId)}`);
    return res.data;
  },
  deleteAttendanceSession: async (attendanceId: string) => {
    const res = await apiClient.delete(`/api/attendance/history/${encodeURIComponent(attendanceId)}`);
    return res.data;
  },
  clearHistory: async (date?: string) => {
    const res = await apiClient.delete(`/api/attendance/history${date ? `?date=${encodeURIComponent(date)}` : ''}`);
    return res.data;
  },
};

