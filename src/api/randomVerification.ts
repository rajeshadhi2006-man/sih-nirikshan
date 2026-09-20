import { apiClient } from './client';

// ============================================================
// Types
// ============================================================

export interface RandomVerificationSession {
  verification_id: string;
  person_id: string;
  person_name: string | null;
  status: string;
  call_status: string;
  voice_status: string;
  face_status: string;
  location_status: string;
  geofence_status: string;
  final_result: string;
  face_score: number | null;
  voice_score: number | null;
  latitude: number | null;
  longitude: number | null;
  telephony_provider: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface InitiateVerificationPayload {
  person_id: string;
  initiated_by?: string;
  initiated_by_name?: string;
}

export interface InitiateVerificationResponse {
  success: boolean;
  verification_id: string;
  person_id: string;
  person_name: string;
  status: string;
  message: string;
  timestamp: string;
}

// ============================================================
// API Functions
// ============================================================

export const randomVerificationApi = {
  /**
   * Gov Web initiates a random verification session for a person.
   */
  initiate: async (payload: InitiateVerificationPayload): Promise<InitiateVerificationResponse> => {
    const res = await apiClient.post('/api/random-verification/initiate', payload);
    return res.data;
  },

  /**
   * Get status of a specific verification session.
   */
  getSession: async (verificationId: string): Promise<RandomVerificationSession> => {
    const res = await apiClient.get(`/api/random-verification/${verificationId}`);
    return res.data;
  },

  /**
   * Get recent verification sessions for history panel.
   */
  listSessions: async (limit = 15): Promise<RandomVerificationSession[]> => {
    const res = await apiClient.get('/api/random-verification/sessions', {
      params: { limit },
    });
    return Array.isArray(res.data) ? res.data : [];
  },

  /**
   * Submit voice result (for manual testing / telephony webhook proxy).
   */
  submitVoiceResult: async (
    verificationId: string,
    voiceStatus: string,
    voiceScore?: number
  ): Promise<{ success: boolean; voice_status: string }> => {
    const res = await apiClient.post(`/api/random-verification/${verificationId}/voice-result`, {
      voice_status: voiceStatus,
      voice_score: voiceScore ?? null,
    });
    return res.data;
  },
};
