import axios from 'axios';

export interface Inspection {
  id: string;
  inspection_code: string;
  project_id: string;
  project_name: string;
  ngo_institute: string;
  inspection_type: 'SURPRISE' | 'SCHEDULED' | 'RANDOM_AI';
  reason: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  deadline?: string;
  team_id?: string;
  team_name?: string;
  inspector_id?: string;
  inspector_name?: string;
  status: 'PENDING' | 'ASSIGNED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  start_time?: string;
  completion_time?: string;
  created_at: string;
  updated_at: string;
}

export interface InspectionTeam {
  id: string;
  team_name: string;
  lead_officer_name: string;
  members_json: string;
  state: string;
  district: string;
  availability_status: 'AVAILABLE' | 'BUSY' | 'ON_INSPECTION';
  current_workload: number;
  created_at: string;
}

export interface InspectionReport {
  id: string;
  inspection_id: string;
  project_id: string;
  inspector_id: string;
  inspector_name: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  geofence_status: string;
  observations: string;
  compliance_findings?: string;
  violations?: string;
  beneficiary_verification_summary?: string;
  staff_verification_summary?: string;
  remarks?: string;
  final_status: string;
  created_at: string;
}
import { API_BASE_URL } from '../config/apiConfig';

export async function fetchInspections(statusFilter?: string): Promise<Inspection[]> {
  try {
    const url = statusFilter
      ? `${API_BASE_URL}/api/inspections?status=${statusFilter}`
      : `${API_BASE_URL}/api/inspections`;
    const res = await axios.get(url);
    return res.data || [];
  } catch (err) {
    console.warn('[Inspections API]: Error fetching inspections', err);
    return [];
  }
}

export async function initiateSurpriseInspection(payload: {
  project_id: string;
  reason: string;
  priority: string;
  deadline_hours?: number;
  team_id?: string;
  team_name?: string;
  lead_officer_name?: string;
  inspector_id?: string;
}): Promise<Inspection | null> {
  const res = await axios.post(`${API_BASE_URL}/api/inspections/surprise`, payload);
  return res.data?.inspection || null;
}

export async function manualAssignInspection(
  inspectionId: string,
  payload: {
    team_id?: string;
    team_name: string;
    lead_officer_name: string;
    inspector_id?: string;
  }
): Promise<{ success: boolean; inspection: Inspection }> {
  const res = await axios.post(`${API_BASE_URL}/api/inspections/${inspectionId}/assign-manual`, payload);
  return res.data;
}

export async function deleteInspection(inspectionId: string): Promise<boolean> {
  try {
    await axios.delete(`${API_BASE_URL}/api/inspections/${inspectionId}`);
    return true;
  } catch (err) {
    console.error('[Inspections API]: Error deleting inspection', err);
    return false;
  }
}

export async function triggerAIAssignment(payload: {
  inspection_id?: string;
  project_id?: string;
}) {
  const res = await axios.post(`${API_BASE_URL}/api/inspections/ai-assign`, payload);
  return res.data;
}

export async function submitInspectionReport(
  inspectionId: string,
  payload: {
    inspector_id: string;
    inspector_name: string;
    latitude: number;
    longitude: number;
    accuracy: number;
    geofence_status?: string;
    observations: string;
    compliance_findings?: string;
    violations?: string;
    beneficiary_verification_summary?: string;
    staff_verification_summary?: string;
    remarks?: string;
  }
): Promise<InspectionReport | null> {
  const res = await axios.post(`${API_BASE_URL}/api/inspections/${inspectionId}/report`, payload);
  return res.data?.report || null;
}

export async function fetchInspectionTeams(): Promise<InspectionTeam[]> {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/inspections/teams`);
    return res.data || [];
  } catch {
    return [];
  }
}

export async function createInspectionTeam(payload: {
  team_name: string;
  lead_officer_name: string;
  members: string[];
  state: string;
  district: string;
}): Promise<InspectionTeam | null> {
  const res = await axios.post(`${API_BASE_URL}/api/inspections/teams`, payload);
  return res.data?.team || null;
}

export async function deleteInspectionTeam(teamId: string): Promise<boolean> {
  try {
    await axios.delete(`${API_BASE_URL}/api/inspections/teams/${teamId}`);
    return true;
  } catch (err) {
    console.error('[Inspections API]: Error deleting inspection team', err);
    return false;
  }
}

export async function triggerRandomVC(projectId?: string, targetRole: string = 'INCHARGE') {
  const res = await axios.post(`${API_BASE_URL}/api/calls/random-vc`, {
    project_id: projectId,
    target_role: targetRole,
  });
  return res.data;
}
