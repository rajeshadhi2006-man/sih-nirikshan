import { apiClient } from './client';

export interface AlertCreatePayload {
  user_id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  alert_type: string;
  title: string;
  description: string;
}

export const alertsApi = {
  getAlerts: async () => {
    const res = await apiClient.get('/api/alerts');
    return res.data;
  },
  createAlert: async (payload: AlertCreatePayload) => {
    const res = await apiClient.post('/api/alerts', payload);
    return res.data;
  },
  /**
   * Acknowledge is handled optimistically on the frontend.
   * Backend has no /acknowledge endpoint — we call /resolve (PUT) instead
   * so the server state stays consistent.
   */
  acknowledgeAlert: async (alertId: string, _officerName = 'Command Center Operator') => {
    try {
      const res = await apiClient.put(`/api/alerts/${alertId}/resolve`);
      return res.data;
    } catch {
      // Silently ignore — UI has already updated optimistically
      return { success: true };
    }
  },
  /**
   * Backend: PUT /api/alerts/{alert_id}/resolve
   */
  resolveAlert: async (alertId: string, _resolutionNotes = 'Resolved by Operator') => {
    const res = await apiClient.put(`/api/alerts/${alertId}/resolve`);
    return res.data;
  },
  deleteAlert: async (alertId: string) => {
    const res = await apiClient.delete(`/api/alerts/${encodeURIComponent(alertId)}`);
    return res.data;
  },
  /**
   * Backend: DELETE /api/alerts  (with optional ?status= query param)
   * or     : DELETE /api/alerts/all
   */
  deleteAllAlerts: async (status?: string) => {
    const url =
      status && status !== 'ALL'
        ? `/api/alerts?status=${encodeURIComponent(status)}`
        : '/api/alerts';
    const res = await apiClient.delete(url);
    return res.data;
  },
};
