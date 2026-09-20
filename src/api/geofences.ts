import { apiClient } from './client';

export interface GeofenceCreatePayload {
  name: string;
  person_id?: string;
  area_name?: string;
  department: string;
  description?: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  is_active?: boolean;
}

export const geofencesApi = {
  getGeofences: async () => {
    const res = await apiClient.get('/api/geofences');
    return res.data;
  },
  getGeofenceById: async (id: string) => {
    const res = await apiClient.get(`/api/geofences/${id}`);
    return res.data;
  },
  createGeofence: async (payload: GeofenceCreatePayload) => {
    const res = await apiClient.post('/api/geofences', payload);
    return res.data;
  },
  updateGeofence: async (id: string, payload: Partial<GeofenceCreatePayload>) => {
    const res = await apiClient.put(`/api/geofences/${id}`, payload);
    return res.data;
  },
  deleteGeofence: async (id: string) => {
    const res = await apiClient.delete(`/api/geofences/${id}`);
    return res.data;
  },
};
