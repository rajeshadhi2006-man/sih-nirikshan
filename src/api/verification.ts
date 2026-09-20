import { apiClient } from './client';

export interface FusionRequestPayload {
  user_id: string;
  face_score?: number;
  voice_score?: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  engine_mode?: string;
}

export const verificationApi = {
  verifyFace: async (payload: { user_id: string; sample_data?: string }) => {
    const res = await apiClient.post('/api/verification/face', payload);
    return res.data;
  },
  verifyVoice: async (payload: { user_id: string; sample_data?: string }) => {
    const res = await apiClient.post('/api/verification/voice', payload);
    return res.data;
  },
  runFusion: async (payload: FusionRequestPayload) => {
    const res = await apiClient.post('/api/verification/final', payload);
    return res.data;
  },
  getHistory: async (limit = 50) => {
    const res = await apiClient.get(`/api/verification/history?limit=${limit}`);
    return res.data;
  },
  getConfig: async () => {
    const res = await apiClient.get('/api/verification/config');
    return res.data;
  },
};
