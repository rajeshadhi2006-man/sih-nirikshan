import { apiClient } from './client';

export interface UserCreatePayload {
  user_id: string;
  full_name: string;
  phone?: string;
  department: string;
  designation: string;
  device_id?: string;
  status?: string;
  role?: string;
  email?: string;
}

export const usersApi = {
  getUsers: async () => {
    const res = await apiClient.get('/api/users');
    return res.data;
  },
  getUserById: async (id: string) => {
    const res = await apiClient.get(`/api/users/${id}`);
    return res.data;
  },
  createUser: async (payload: UserCreatePayload) => {
    const res = await apiClient.post('/api/users', payload);
    return res.data;
  },
  updateUser: async (id: string, payload: Partial<UserCreatePayload>) => {
    const res = await apiClient.put(`/api/users/${id}`, payload);
    return res.data;
  },
  deleteUser: async (id: string) => {
    const res = await apiClient.delete(`/api/users/${id}`);
    return res.data;
  },
  pingUser: async (id: string, coords?: { latitude?: number; longitude?: number }) => {
    const res = await apiClient.post(`/api/users/${id}/ping`, coords || {});
    return res.data;
  },
  toggleOnline: async (id: string, online: boolean) => {
    const res = await apiClient.post(`/api/users/${id}/toggle-online`, { online });
    return res.data;
  },
};

