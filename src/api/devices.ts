import { apiClient } from './client';

export interface DeviceRegisterPayload {
  device_id: string;
  user_id?: string;
  device_type?: string;
  os_version?: string;
  app_version?: string;
}

export const devicesApi = {
  getDevices: async () => {
    const res = await apiClient.get('/api/devices');
    return res.data;
  },
  registerDevice: async (payload: DeviceRegisterPayload) => {
    const res = await apiClient.post('/api/devices', payload);
    return res.data;
  },
};
