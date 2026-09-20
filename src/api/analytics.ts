import { apiClient } from './client';

export const analyticsApi = {
  getSummary: async () => {
    const res = await apiClient.get('/api/analytics/summary');
    return res.data;
  },
  getGeofenceStats: async () => {
    const res = await apiClient.get('/api/analytics/geofences');
    return res.data;
  },
};
