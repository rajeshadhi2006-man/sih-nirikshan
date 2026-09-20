import { apiClient } from './client';
import { Geofence } from '../types';

export interface Person {
  person_id: string;
  full_name: string;
  employee_id: string;
  mobile?: string;
  email?: string;
  role: string;
  organization: string;
  assigned_area?: string;
  profile_photo_url?: string;
  face_embedding?: string;
  voice_embedding?: string;
  status: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  id?: string;
  officer_id?: string;
  geofence?: Geofence | null;
  geofence_status: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN';
  attendance_status: string;
  current_location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    last_updated?: string;
  } | null;
  has_face_enrolled?: boolean;
  has_voice_enrolled?: boolean;
  face_status?: string;
  voice_status?: string;
  verification_status?: string;
}

export interface PersonEnrollPayload {
  full_name: string;
  employee_id: string;
  mobile?: string;
  email?: string;
  role?: string;
  organization?: string;
  assigned_area?: string;
  profile_photo_url?: string;
  face_embedding?: string;
  voice_embedding?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  person_id?: string;
}

export const personsApi = {
  getPersons: async (): Promise<Person[]> => {
    const res = await apiClient.get<Person[]>('/api/persons');
    return res.data;
  },

  getPersonById: async (personId: string): Promise<any> => {
    const res = await apiClient.get(`/api/persons/${encodeURIComponent(personId)}`);
    return res.data;
  },

  enrollPerson: async (payload: PersonEnrollPayload): Promise<{ success: boolean; person: Person; geofence?: Geofence; message: string; person_id?: string }> => {
    const res = await apiClient.post('/api/persons/enroll', payload);
    return res.data;
  },

  getGeofenceByPersonId: async (personId: string): Promise<Geofence> => {
    const res = await apiClient.get(`/api/geofences/person/${encodeURIComponent(personId)}`);
    return res.data;
  },

  checkAttendance: async (payload: { person_id: string; latitude: number; longitude: number }): Promise<any> => {
    const res = await apiClient.post('/api/attendance/check', payload);
    return res.data;
  },

  verifyFace: async (payload: { person_id: string; face_embedding?: string; sample_data?: string }): Promise<any> => {
    const res = await apiClient.post('/api/verification/face', payload);
    return res.data;
  },

  verifyVoice: async (payload: { person_id: string; voice_embedding?: string; sample_data?: string }): Promise<any> => {
    const res = await apiClient.post('/api/verification/voice', payload);
    return res.data;
  },

  verifyFinal: async (payload: string | {
    user_id: string;
    latitude?: number;
    longitude?: number;
    face_score?: number;
    voice_score?: number;
    accuracy?: number;
  }): Promise<any> => {
    const body = typeof payload === 'string' ? { user_id: payload } : payload;
    const res = await apiClient.post('/api/verification/final', body);
    return res.data;
  },

  deletePerson: async (personId: string): Promise<{ success: boolean; message: string; person_id: string }> => {
    const res = await apiClient.delete(`/api/persons/${encodeURIComponent(personId)}`);
    return res.data;
  },
};
