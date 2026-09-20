import { apiClient } from './client';

export interface LoginPayload {
  username: string;
  password?: string;
}

export interface UserProfileResponse {
  id: string;
  officer_id: string;
  full_name: string;
  email: string;
  department: string;
  designation: string;
  role: string;
}

export const authApi = {
  login: async (payload: LoginPayload) => {
    const res = await apiClient.post('/api/auth/login', payload);
    return res.data;
  },
  getMe: async () => {
    const res = await apiClient.get<UserProfileResponse>('/api/auth/me');
    return res.data;
  },
  logout: async () => {
    const res = await apiClient.post('/api/auth/logout');
    return res.data;
  },
};
