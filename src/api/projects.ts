import axios from 'axios';

export interface DoSJEProject {
  id: string;
  name: string;
  scheme: string;
  ngo_institute: string;
  incharge_name: string;
  incharge_phone?: string;
  state: string;
  district: string;
  location_address: string;
  latitude: number;
  longitude: number;
  registered_beneficiaries: number;
  staff_count: number;
  compliance_status: string;
  risk_score: number;
  geofence_id?: string;
  cctv_count: number;
  created_at: string;
  updated_at: string;
}

export interface Institution {
  id: string;
  name: string;
  type: string;
  code: string;
  state: string;
  district: string;
  address: string;
  contact_person: string;
  contact_phone?: string;
  email?: string;
  created_at: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000');

export async function fetchProjects(): Promise<DoSJEProject[]> {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/projects`);
    return res.data || [];
  } catch (err) {
    console.warn('[Projects API]: Error fetching projects', err);
    return [];
  }
}

export async function createProject(payload: {
  name: string;
  scheme: string;
  ngo_institute: string;
  incharge_name: string;
  incharge_phone?: string;
  state: string;
  district: string;
  location_address: string;
  latitude: number;
  longitude: number;
  registered_beneficiaries: number;
  staff_count: number;
}): Promise<DoSJEProject | null> {
  const res = await axios.post(`${API_BASE_URL}/api/projects`, payload);
  return res.data?.project || null;
}

export async function fetchInstitutions(): Promise<Institution[]> {
  try {
    const res = await axios.get(`${API_BASE_URL}/api/projects/institutions`);
    return res.data || [];
  } catch {
    return [];
  }
}

export async function createInstitution(payload: {
  name: string;
  type: string;
  code: string;
  state: string;
  district: string;
  address: string;
  contact_person: string;
  contact_phone?: string;
  email?: string;
}): Promise<Institution | null> {
  const res = await axios.post(`${API_BASE_URL}/api/projects/institutions`, payload);
  return res.data?.institution || null;
}
