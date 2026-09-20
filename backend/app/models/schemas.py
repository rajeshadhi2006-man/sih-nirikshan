from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# ========================================================================
# AUTHENTICATION SCHEMAS
# ========================================================================
class LoginRequest(BaseModel):
    username: str = Field(..., example="admin@command.gov.in")
    password: str = Field(..., example="Admin@123")

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: Dict[str, Any]

class UserProfileResponse(BaseModel):
    id: str
    officer_id: str
    full_name: str
    email: str
    department: str
    designation: str
    role: str

# ========================================================================
# LOCATION & TELEMETRY SCHEMAS (Matches Section 7 & Mobile App API)
# ========================================================================
class LocationUpdatePayload(BaseModel):
    user_id: str = Field(..., example="U001")
    latitude: float = Field(..., ge=-90.0, le=90.0, example=11.0168)
    longitude: float = Field(..., ge=-180.0, le=180.0, example=76.9558)
    accuracy: Optional[float] = Field(5.0, ge=0.0, example=8.5)
    speed: Optional[float] = Field(0.0, ge=0.0, example=12.4)
    heading: Optional[float] = Field(0.0, ge=0.0, le=360.0, example=180.0)
    timestamp: Optional[str] = Field(None, example="2026-09-06T12:00:00Z")
    status: Optional[str] = Field("online", example="online")

class TelemetryPing(BaseModel):
    user_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = 5.0
    speed: Optional[float] = 0.0
    heading: Optional[float] = 0.0
    full_name: Optional[str] = None
    officer_id: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None

# ========================================================================
# GEOFENCE SCHEMAS (Matches Section 10)
# ========================================================================
class GeofenceCreateRequest(BaseModel):
    name: str = Field(..., example="District Office Perimeter")
    person_id: Optional[str] = Field(None, example="P00125")
    area_name: Optional[str] = Field(None, example="District Office Working Area")
    department: Optional[str] = Field("Field Operations", example="Field Operations")
    description: Optional[str] = Field("", example="High-security administrative perimeter")
    center_latitude: float = Field(..., ge=-90.0, le=90.0, example=11.0168)
    center_longitude: float = Field(..., ge=-180.0, le=180.0, example=76.9558)
    radius_meters: float = Field(..., gt=0, example=100.0)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[str] = "ACTIVE"

class GeofenceUpdateRequest(BaseModel):
    name: Optional[str] = None
    person_id: Optional[str] = None
    area_name: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    center_latitude: Optional[float] = None
    center_longitude: Optional[float] = None
    radius_meters: Optional[float] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None

class GeofenceCheckRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0, example=11.0168)
    longitude: float = Field(..., ge=-180.0, le=180.0, example=76.9558)
    geofence_id: Optional[str] = None
    buffer_meters: Optional[float] = 0.0
    polygon_coords: Optional[List[List[float]]] = None

# ========================================================================
# GEOFENCE ASSIGNMENT SCHEMAS
# ========================================================================
class AssignmentCreateRequest(BaseModel):
    user_id: str = Field(..., example="U001")
    geofence_id: Optional[str] = Field(None, example="geo-001")
    assignment_type: Optional[str] = Field("NORMAL_INSPECTION", example="NORMAL_INSPECTION") # NORMAL_INSPECTION | SURPRISE_INSPECTION
    title: Optional[str] = Field("Field Inspection Assignment", example="District Health Center Inspection")
    description: Optional[str] = Field("Conduct physical compliance verification.", example="Conduct physical compliance verification.")
    target_location: Optional[str] = Field("Authorized Facility", example="Coimbatore Central Health Center")
    latitude: Optional[float] = Field(None, example=11.0168)
    longitude: Optional[float] = Field(None, example=76.9558)
    radius_meters: Optional[float] = Field(100.0, example=100.0)
    scheduled_date: Optional[str] = Field(None, example="2026-09-15")
    start_time: Optional[str] = Field(None, example="09:00 AM")
    end_time: Optional[str] = Field(None, example="05:00 PM")
    priority: Optional[str] = Field("MEDIUM", example="HIGH") # LOW | MEDIUM | HIGH | CRITICAL
    is_surprise: Optional[bool] = Field(False, example=False)
    assigned_by: Optional[str] = Field("Command Officer", example="Command Officer")

class AssignmentUpdateRequest(BaseModel):
    active: Optional[bool] = Field(None, example=True)
    status: Optional[str] = Field(None, example="ACTIVE")
    attendance_status: Optional[str] = Field(None, example="VERIFIED")
    inspection_status: Optional[str] = Field(None, example="COMPLETED")


# ========================================================================
# ATTENDANCE SCHEMAS (Matches Section 11)
# ========================================================================
class AttendanceEntryRequest(BaseModel):
    user_id: str = Field(..., example="U001")
    latitude: float = Field(..., example=11.0168)
    longitude: float = Field(..., example=76.9558)
    accuracy: Optional[float] = 5.0
    timestamp: Optional[str] = None
    assignment_id: Optional[str] = None

class AttendanceExitRequest(BaseModel):
    user_id: str = Field(..., example="U001")
    latitude: float = Field(..., example=11.0195)
    longitude: float = Field(..., example=76.9580)
    accuracy: Optional[float] = 5.0
    timestamp: Optional[str] = None

class AttendanceVerifyRequest(BaseModel):
    user_id: str
    latitude: float
    longitude: float
    face_features: Optional[str] = None
    voice_features: Optional[str] = None

class EnrollAttendanceUserPayload(BaseModel):
    user_id: str = Field(..., example="OFFICER-01")
    name: str = Field(..., example="Officer Rajesh")
    authorized_location: str = Field(..., example="Field Surveillance Station")
    geofence_center_lat: float = Field(..., ge=-90.0, le=90.0, example=11.0968)
    geofence_center_lng: float = Field(..., ge=-180.0, le=180.0, example=77.0211)
    geofence_radius: Optional[float] = Field(150.0, gt=0, example=150.0)
    geofence_id: Optional[str] = None


# ========================================================================
# VERIFICATION FUSION SCHEMAS (Matches Section 12)
# ========================================================================
class VerificationFusionRequest(BaseModel):
    user_id: Optional[str] = Field(None, example="U001")
    person_id: Optional[str] = Field(None, example="P001")
    face_score: Optional[float] = Field(None, ge=0.0, le=100.0, example=97.8)
    voice_score: Optional[float] = Field(None, ge=0.0, le=100.0, example=94.6)
    latitude: Optional[float] = Field(None, example=11.0168)
    longitude: Optional[float] = Field(None, example=76.9558)
    accuracy: Optional[float] = Field(5.0, example=8.5)
    engine_mode: Optional[str] = Field("PRODUCTION_AI", example="PRODUCTION_AI")

class VerificationConfigPayload(BaseModel):
    face_threshold: float = Field(85.0, ge=50.0, le=99.0)
    voice_threshold: float = Field(80.0, ge=50.0, le=99.0)
    gps_tolerance_meters: float = Field(30.0, ge=5.0, le=100.0)
    engine_mode: str = Field("PRODUCTION_AI") # PRODUCTION_AI | DEMO_MOCK

# ========================================================================
# ALERT SCHEMAS (Matches Section 13)
# ========================================================================
class AlertCreateRequest(BaseModel):
    user_id: str
    severity: str = Field(..., example="CRITICAL") # LOW | MEDIUM | HIGH | CRITICAL
    alert_type: str = Field(..., example="GEOFENCE_BREACH")
    title: str = Field(..., example="🚨 Unauthorized Boundary Exit")
    description: str = Field(..., example="User U001 exited assigned geofence perimeter.")

class AlertResolveRequest(BaseModel):
    resolution_notes: Optional[str] = "Resolved by Command Center Operator"

# ========================================================================
# SIMULATION / DEMO SCHEMAS (Matches Section 23)
# ========================================================================
class SimulationControlRequest(BaseModel):
    action: str = Field(..., example="START") # START | STOP | STEP | RESET
    speed_factor: Optional[float] = 1.0
