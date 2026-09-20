// ========================================================================
// SMART INDIA HACKATHON - CORE TYPE DEFINITIONS
// ========================================================================

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OFFICER' | 'VIEWER';

export type UserStatus = 'ACTIVE' | 'OFFLINE' | 'STALE' | 'SUSPENDED';

export type GeofenceStatus = 'INSIDE' | 'OUTSIDE' | 'UNKNOWN';

export type VerificationState = 'VERIFIED' | 'FAILED' | 'PENDING' | 'REVIEW_REQUIRED';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'REVIEW' | 'LEAVE';

export interface UserProfile {
  id: string;
  auth_user_id?: string;
  officer_id: string;
  full_name: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  role: UserRole;
  is_active: boolean;
  avatar_url?: string;
  created_at: string;
}

export interface Geofence {
  id: string;
  name: string;
  person_id?: string;
  area_name?: string;
  department: string;
  description?: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  latitude?: number;
  longitude?: number;
  radius?: number;
  is_active: boolean;
  status?: string;
  person_name?: string;
  employee_id?: string;
  user_count_inside?: number;
  user_count_outside?: number;
  created_at: string;
}

export interface LocationUpdate {
  id?: number | string;
  user_id: string;
  tracking_session_id?: string;
  latitude: number;
  longitude: number;
  accuracy: number;     // in meters
  altitude?: number;
  speed?: number;        // in m/s
  heading?: number;      // 0 - 360
  geofence_id?: string;
  is_inside_geofence: boolean;
  created_at: string;
}

export interface MonitoredUser {
  id: string;
  officer_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  department: string;
  designation: string;
  role?: string;
  status: UserStatus;
  geofence_status: GeofenceStatus;
  current_location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed: number;
    heading: number;
    last_updated: string;
  };
  verification: {
    face: VerificationState;
    voice: VerificationState;
    location: VerificationState;
    overall: VerificationState;
    last_verified_at?: string;
  };
  attendance_status: AttendanceStatus;
  assigned_geofence?: Geofence;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  user?: {
    full_name: string;
    officer_id: string;
    department: string;
  };
  check_in_time: string;
  check_out_time?: string;
  latitude?: number;
  longitude?: number;
  face_verified: boolean;
  voice_verified: boolean;
  location_verified: boolean;
  status: AttendanceStatus;
  remarks?: string;
  created_at: string;
}

export interface VerificationRecord {
  id: string;
  user_id: string;
  user_name?: string;
  officer_id?: string;
  verification_type: 'FACE' | 'VOICE' | 'LOCATION' | 'MULTI_FACTOR';
  confidence_score: number; // 0.00 - 1.00
  status: VerificationState;
  failure_reason?: string;
  metadata?: {
    liveness_passed?: boolean;
    anti_spoof_score?: number;
    device_integrity?: string;
    audio_snr_db?: number;
    matched_features?: number;
    ip_subnet?: string;
  };
  created_at: string;
}

export interface Alert {
  id: string;
  user_id?: string;
  user_name?: string;
  officer_id?: string;
  severity: AlertSeverity;
  alert_type: string;
  title: string;
  description: string;
  status: AlertStatus;
  acknowledged_by?: string;
  acknowledged_at?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  officer_id?: string;
  officer_name: string;
  action: string;
  target?: string;
  result: 'SUCCESS' | 'DENIED' | 'FAILURE';
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface BreadcrumbPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number;
  accuracy: number;
}

export const STATUS_THRESHOLDS = {
  LIVE_SECONDS: 30,
  STALE_SECONDS: 120,
};
