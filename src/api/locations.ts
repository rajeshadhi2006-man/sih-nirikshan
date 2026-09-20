import { apiClient } from './client';

export interface LocationUpdatePayload {
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp?: string;
}

export const locationsApi = {
  updateLocation: async (payload: LocationUpdatePayload) => {
    const res = await apiClient.post('/api/location/update', payload);
    return res.data;
  },
  getUsersLocations: async (includeHistory = true, limit = 30) => {
    const res = await apiClient.get(`/api/users/locations?history=${includeHistory}&limit=${limit}`);
    return res.data;
  },
  getUserLocation: async (userId: string, includeHistory = true, limit = 50) => {
    const res = await apiClient.get(`/api/users/${userId}/location?history=${includeHistory}&limit=${limit}`);
    return res.data;
  },
};
