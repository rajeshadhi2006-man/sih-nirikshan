import uuid
import time
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from ..database import query_all, query_one, execute_commit
from ..websocket.connection_manager import manager

router = APIRouter(prefix="/api/projects", tags=["DoSJE Projects & Institutions"])

class ProjectCreateRequest(BaseModel):
    name: str = Field(..., example="Pradhan Mantri Anusuchit Jaati Abhyuday Yojana (PM-AJAY)")
    scheme: str = Field(..., example="PM-AJAY Scheme")
    ngo_institute: str = Field(..., example="National Rural Development Foundation")
    incharge_name: str = Field(..., example="Dr. K. Arumugam")
    incharge_phone: Optional[str] = Field("+91 9876543210", example="+91 9876543210")
    state: str = Field(..., example="Tamil Nadu")
    district: str = Field(..., example="Coimbatore")
    location_address: str = Field(..., example="Sector 4, Smart City Corridor, Coimbatore")
    latitude: float = Field(11.0168, example=11.0168)
    longitude: float = Field(76.9558, example=76.9558)
    registered_beneficiaries: int = Field(250, example=250)
    staff_count: int = Field(18, example=18)
    geofence_id: Optional[str] = None

class InstitutionCreateRequest(BaseModel):
    name: str = Field(..., example="State Institute of Social Welfare")
    type: str = Field("INSTITUTE", example="INSTITUTE") # NGO | INSTITUTE
    code: str = Field(..., example="INST-CBE-001")
    state: str = Field(..., example="Tamil Nadu")
    district: str = Field(..., example="Coimbatore")
    address: str = Field(..., example="Avinashi Road, Coimbatore")
    contact_person: str = Field(..., example="S. Ramesh")
    contact_phone: Optional[str] = Field("+91 9443322110", example="+91 9443322110")
    email: Optional[str] = Field("info@sisw.gov.in", example="info@sisw.gov.in")

@router.get("")
def get_all_projects():
    """Fetch all DoSJE registered projects with real-time stats."""
    return query_all("SELECT * FROM projects ORDER BY created_at DESC")

@router.post("")
async def create_project(req: ProjectCreateRequest):
    """Register a new DoSJE Project in the database."""
    pid = f"proj-{uuid.uuid4().hex[:8]}"
    now_str = datetime.utcnow().isoformat() + "Z"

    execute_commit(
        """INSERT INTO projects (id, name, scheme, ngo_institute, incharge_name, incharge_phone, state, district,
                                 location_address, latitude, longitude, registered_beneficiaries, staff_count,
                                 compliance_status, risk_score, geofence_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLIANT', 12.5, ?, ?, ?)""",
        (pid, req.name, req.scheme, req.ngo_institute, req.incharge_name, req.incharge_phone,
         req.state, req.district, req.location_address, req.latitude, req.longitude,
         req.registered_beneficiaries, req.staff_count, req.geofence_id, now_str, now_str)
    )

    # Initialize compliance record for the new project
    execute_commit(
        """INSERT INTO compliance_records (id, project_id, project_name, compliance_score, violations_count, pending_actions_count, cctv_availability_pct, attendance_rate_pct, anomaly_count, created_at, updated_at)
           VALUES (?, ?, ?, 94.5, 0, 0, 100.0, 95.0, 0, ?, ?)""",
        (f"comp-{pid}", pid, req.name, now_str, now_str)
    )

    # Log audit entry
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'COMMAND-ADMIN', 'Command Administrator', 'PROJECT_REGISTERED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-proj-{int(time.time()*1000)}", req.name, f"Registered project ID {pid}", now_str)
    )

    created = query_one("SELECT * FROM projects WHERE id = ?", (pid,))

    # Broadcast WebSocket update
    await manager.broadcast({
        "type": "PROJECT_CREATED",
        "event": "PROJECT_CREATED",
        "data": created
    })

    return {"success": True, "project": created}

@router.get("/institutions")
def get_all_institutions():
    """Fetch all registered NGOs and Institutes."""
    return query_all("SELECT * FROM institutions ORDER BY created_at DESC")

@router.post("/institutions")
async def create_institution(req: InstitutionCreateRequest):
    """Register a new NGO or Institute."""
    iid = f"inst-{uuid.uuid4().hex[:8]}"
    now_str = datetime.utcnow().isoformat() + "Z"

    execute_commit(
        """INSERT INTO institutions (id, name, type, code, state, district, address, contact_person, contact_phone, email, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (iid, req.name, req.type, req.code, req.state, req.district, req.address, req.contact_person, req.contact_phone, req.email, now_str)
    )

    created = query_one("SELECT * FROM institutions WHERE id = ?", (iid,))
    return {"success": True, "institution": created}

@router.get("/{project_id}")
def get_project_details(project_id: str):
    """Fetch details for a specific project."""
    proj = query_one("SELECT * FROM projects WHERE id = ?", (project_id,))
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    cameras = query_all("SELECT * FROM cctv_cameras WHERE project_id = ?", (project_id,))
    inspections = query_all("SELECT * FROM inspections WHERE project_id = ? ORDER BY created_at DESC", (project_id,))
    compliance = query_one("SELECT * FROM compliance_records WHERE project_id = ?", (project_id,))

    return {
        "project": proj,
        "cameras": cameras,
        "inspections": inspections,
        "compliance": compliance
    }
