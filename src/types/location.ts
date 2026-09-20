// ========================================================================
// REAL-TIME GPS TRACKING & GEOFENCING TYPE DEFINITIONS
// ========================================================================

export type MarkerStatus = 'LIVE' | 'RECENT' | 'OFFLINE' | 'GPS ERROR';

export interface LocationObject {
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;     // in meters (e.g. 5.0)
  speed: number;        // in km/h or m/s
  heading: number;      // 0 - 360 degrees
  timestamp: string;    // ISO timestamp
  status: 'online' | 'offline' | string;
}

export interface UserLocation extends LocationObject {
  full_name?: string;
  officer_id?: string;
  department?: string;
  is_inside_geofence?: boolean;
  geofence_status?: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN';
  distance_to_geofence?: number;
  computed_status?: MarkerStatus;
  last_seen_seconds_ago?: number;
  history?: LocationBreadcrumb[];
}

export interface LocationBreadcrumb {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number;
  heading: number;
  timestamp: string;
}

export interface CircularGeofence {
  id: string;
  name: string;
  person_id?: string;
  department?: string;
  description?: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  is_active: boolean;
}

export interface TrackingStats {
  totalUsers: number;
  liveCount: number;
  offlineCount: number;
  gpsErrorCount: number;
}

export type ConnectionState = 'CONNECTING' | 'CONNECTED' | 'CONNECTION_LOST' | 'RECONNECTING';

export interface EnrolledAttendanceUser {
  user_id: string;
  name: string;
  authorized_location: string;
  geofence_id?: string;
  geofence_center_lat: number;
  geofence_center_lng: number;
  geofence_radius: number;
  enrollment_status: 'ENROLLED' | 'SUSPENDED' | string;
  current_attendance_status: 'OUTSIDE' | 'PRESENT' | 'LEAVE' | string;
  last_gps_status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceSession {
  attendance_id: string;
  user_id: string;
  name?: string;
  authorized_location?: string;
  geofence_id?: string;
  entry_time: string;
  entry_latitude: number;
  entry_longitude: number;
  entry_accuracy: number;
  exit_time?: string | null;
  exit_latitude?: number | null;
  exit_longitude?: number | null;
  exit_accuracy?: number | null;
  status: 'PRESENT' | 'LEAVE';
  duration_seconds: number;
  duration_formatted: string;
  date: string;
  created_at: string;
  updated_at?: string;
}

export interface LiveAttendanceRecord {
  user_id: string;
  name: string;
  authorized_location: string;
  geofence_center_lat: number;
  geofence_center_lng: number;
  geofence_radius: number;
  status: 'PRESENT' | 'LEAVE' | 'OUTSIDE' | string;
  gps_status: 'ONLINE' | 'GPS UNCERTAIN' | 'LOCATION SIGNAL LOST' | 'OFFLINE' | string;
  entry_time: string;
  exit_time: string;
  duration: string;
  accuracy: number;
  latitude: number;
  longitude: number;
  distance_to_geofence: number;
  last_seen_seconds_ago?: number | null;
}

export interface LiveAttendanceStats {
  total_enrolled: number;
  present_count: number;
  leave_count: number;
  gps_uncertain_count: number;
  signal_lost_count: number;
}

export interface AttendanceVerificationPayload {
  user_id: string;
  latitude: number;
  longitude: number;
  face_features?: string;
  voice_features?: string;
  accuracy?: number;
  timestamp?: string;
}
