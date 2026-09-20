import { apiClient } from './client';

export interface AssignmentCreatePayload {
  user_id: string;
  geofence_id: string;
  assigned_by?: string;
  assignment_type?: string;
  title?: string;
  description?: string;
  target_location?: string;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  scheduled_date?: string;
  start_time?: string;
  end_time?: string;
  priority?: string;
  is_surprise?: boolean;
}

export interface GeofenceAssignment {
  id: string;
  user_id: string;
  geofence_id: string;
  assigned_by?: string;
  assigned_at: string;
  active: number | boolean;
  user_name?: string;
  user_department?: string;
  geofence_name?: string;
  geofence_radius?: number;
  assignment_type?: string;
  title?: string;
  description?: string;
  target_location?: string;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
  scheduled_date?: string;
  start_time?: string;
  end_time?: string;
  priority?: string;
  is_surprise?: boolean | number;
  attendance_status?: string;
  inspection_status?: string;
}

export const assignmentsApi = {
  getAssignments: async (): Promise<GeofenceAssignment[]> => {
    const res = await apiClient.get('/api/assignments');
    return res.data;
  },
  createAssignment: async (payload: AssignmentCreatePayload) => {
    const res = await apiClient.post('/api/assignments', payload);
    return res.data;
  },
  updateAssignment: async (id: string, active: boolean) => {
    const res = await apiClient.put(`/api/assignments/${id}`, { active });
    return res.data;
  },
  deleteAssignment: async (id: string) => {
    const res = await apiClient.delete(`/api/assignments/${id}`);
    return res.data;
  },
};
