import {
  MonitoredUser,
  Geofence,
  AttendanceRecord,
  VerificationRecord,
  Alert,
  AuditLog,
  BreadcrumbPoint,
  UserProfile,
} from '../types';

export const DEMO_OFFICER: UserProfile = {
  id: 'off-001',
  officer_id: 'GOV-CMD-9041',
  full_name: 'Dr. Rajesh Sharma, IAS',
  email: 'rajesh.sharma@nic.in',
  phone: '+91 98112 44332',
  department: 'National Command & Surveillance Directorate',
  designation: 'Joint Secretary / Chief Monitoring Officer',
  role: 'SUPER_ADMIN',
  is_active: true,
  created_at: '2026-01-10T08:00:00Z',
};

// Real-time Clean Slate: No mock / predefined dummy entities
export const INITIAL_GEOFENCES: Geofence[] = [];

export const INITIAL_USERS: MonitoredUser[] = [];

export const INITIAL_ALERTS: Alert[] = [];

export const INITIAL_ATTENDANCE: AttendanceRecord[] = [];

export const INITIAL_VERIFICATIONS: VerificationRecord[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

export const SAMPLE_ROUTE_USR1024: BreadcrumbPoint[] = [];
