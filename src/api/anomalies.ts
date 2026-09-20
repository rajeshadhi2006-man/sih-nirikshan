import axios from 'axios';

export interface Anomaly {
  id: string;
  entity_type: 'PROJECT' | 'USER' | 'INSPECTION' | 'CCTV';
  entity_id: string;
  entity_name: string;
  event_type: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  evidence_summary?: string;
  recommended_action?: string;
  status: string;
  created_at: string;
}

export interface ProjectCompliance {
  project_id: string;
  project_name: string;
  scheme: string;
  ngo_institute: string;
  state: string;
  district: string;
  compliance_score: number;
  cctv_availability_pct: number;
  total_inspections: number;
  completed_inspections: number;
  anomaly_count: number;
  status: string;
}
import { API_BASE_URL } from '../config/apiConfig';

export async function fetchAnomalies(): Promise<{ anomalies: Anomaly[]; indicator: string }> {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/anomalies`);
    return {
      anomalies: res.data?.anomalies || [],
      indicator: res.data?.indicator || 'INSUFFICIENT_DATA',
    };
  } catch (err) {
    console.warn('[Anomalies API]: Error fetching anomalies', err);
    return { anomalies: [], indicator: 'INSUFFICIENT_DATA' };
  }
}

export async function fetchCompliance(): Promise<ProjectCompliance[]> {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/anomalies/compliance`);
    return res.data || [];
  } catch (err) {
    console.warn('[Compliance API]: Error fetching compliance scores', err);
    return [];
  }
}
