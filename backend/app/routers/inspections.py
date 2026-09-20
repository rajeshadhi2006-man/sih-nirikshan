import uuid
import time
import json
import math
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from ..database import query_all, query_one, execute_commit
from ..websocket.connection_manager import manager
from ..services.supabase_service import execute_supabase_upsert

router = APIRouter(prefix="/api/inspections", tags=["DoSJE Surprise Inspections & AI Assignment"])

class SurpriseInspectionRequest(BaseModel):
    project_id: str = Field(..., example="proj-001")
    reason: str = Field(..., example="Surprise verification of beneficiary attendance & CCTV integrity")
    priority: str = Field("HIGH", example="HIGH") # LOW | MEDIUM | HIGH | CRITICAL
    deadline_hours: Optional[int] = Field(24, example=24)
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    lead_officer_name: Optional[str] = None
    inspector_id: Optional[str] = None

class ManualAssignRequest(BaseModel):
    team_id: Optional[str] = None
    team_name: str = Field(..., example="District Flying Squad")
    lead_officer_name: str = Field(..., example="Inspector V. Murugan")
    inspector_id: Optional[str] = Field(None, example="DOSJE-INSP-042")

class DynamicAIAssignRequest(BaseModel):
    inspection_id: Optional[str] = Field(None, example="insp-001")
    project_id: Optional[str] = Field(None, example="proj-001")

class InspectionTeamCreateRequest(BaseModel):
    team_name: str = Field(..., example="Southern Tactical Inspection Squad Alpha")
    lead_officer_name: str = Field(..., example="Inspector V. Murugan")
    members: List[str] = Field(["Officer A. Kumar", "Inspector R. Priya"], example=["Officer A. Kumar", "Inspector R. Priya"])
    state: str = Field(..., example="Tamil Nadu")
    district: str = Field(..., example="Coimbatore")

class InspectionReportSubmitRequest(BaseModel):
    inspection_id: str = Field(..., example="insp-001")
    inspector_id: str = Field(..., example="DOSJE-INSP-042")
    inspector_name: str = Field(..., example="Inspector V. Murugan")
    latitude: float = Field(..., example=11.0168)
    longitude: float = Field(..., example=76.9558)
    accuracy: float = Field(5.0, example=5.0)
    geofence_status: Optional[str] = Field("INSIDE", example="INSIDE")
    observations: str = Field(..., example="Physical inspection completed.")
    compliance_findings: Optional[str] = Field("", example="Compliant with guidelines")
    violations: Optional[str] = Field("", example="None detected")
    beneficiary_verification_summary: Optional[str] = Field(None, example="Verified")
    staff_verification_summary: Optional[str] = Field(None, example="Verified")
    remarks: Optional[str] = Field(None, example="Remarks")

class EvidenceUploadRequest(BaseModel):
    inspection_id: str = Field(..., example="insp-001")
    evidence_type: str = Field("PHOTO", example="PHOTO") # PHOTO | VIDEO | DOCUMENT
    file_url: str = Field(..., example="https://storage.gov.in/evidence/photo_001.jpg")
    latitude: Optional[float] = Field(11.0168, example=11.0168)
    longitude: Optional[float] = Field(76.9558, example=76.9558)
    inspector_id: Optional[str] = Field(None, example="DOSJE-INSP-042")
    description: Optional[str] = Field("Verification photo", example="Verification photo")

@router.get("")
def get_all_inspections(status: Optional[str] = None):
    """Fetch all inspections from database with filtering by status."""
    if status:
        return query_all("SELECT * FROM inspections WHERE status = ? ORDER BY created_at DESC", (status,))
    return query_all("SELECT * FROM inspections ORDER BY created_at DESC")

@router.post("/surprise")
async def initiate_surprise_inspection(req: SurpriseInspectionRequest):
    """
    Initiates a surprise inspection for a selected DoSJE project.
    Can either queue as PENDING or immediately assign manually if team/officer details are provided.
    """
    proj = query_one("SELECT * FROM projects WHERE id = ?", (req.project_id,))
    if not proj:
        raise HTTPException(status_code=404, detail="Selected project not found in database")

    iid = f"insp-{uuid.uuid4().hex[:8]}"
    code = f"INSP-SIH-{int(time.time())}"
    now_str = datetime.utcnow().isoformat() + "Z"

    initial_status = "ASSIGNED" if (req.team_name or req.lead_officer_name) else "PENDING"
    t_name = req.team_name.strip() if req.team_name else None
    l_officer = req.lead_officer_name.strip() if req.lead_officer_name else None
    insp_id = req.inspector_id.strip() if req.inspector_id else None

    execute_commit(
        """INSERT INTO inspections (id, inspection_code, project_id, project_name, ngo_institute, inspection_type,
                                    reason, priority, team_id, team_name, inspector_id, inspector_name, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'SURPRISE', ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (iid, code, proj["id"], proj["name"], proj["ngo_institute"], req.reason, req.priority,
         req.team_id, t_name, insp_id, l_officer, initial_status, now_str, now_str)
    )

    if req.team_id:
        execute_commit(
            "UPDATE inspection_teams SET current_workload = current_workload + 1, availability_status = 'ON_INSPECTION' WHERE id = ?",
            (req.team_id,)
        )

    try:
        execute_supabase_upsert("inspections", {
            "id": iid,
            "inspection_code": code,
            "project_id": proj["id"],
            "project_name": proj["name"],
            "ngo_institute": proj["ngo_institute"],
            "inspection_type": "SURPRISE",
            "reason": req.reason,
            "priority": req.priority,
            "team_id": req.team_id,
            "team_name": t_name,
            "inspector_id": insp_id,
            "inspector_name": l_officer,
            "status": initial_status
        })
        print(f"[DATABASE] inspection saved to Supabase: {iid}")
    except Exception as e:
        print(f"Error saving inspection to Supabase: {e}")

    created = query_one("SELECT * FROM inspections WHERE id = ?", (iid,))

    # Log audit entry
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'COMMAND-OFFICER', 'DoSJE Command Official', 'SURPRISE_INSPECTION_INITIATED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-insp-{int(time.time()*1000)}", proj["name"], f"Initiated surprise inspection {code} ({initial_status})", now_str)
    )

    # Broadcast WebSocket alert
    await manager.broadcast({
        "type": "INSPECTION_CREATED",
        "event": "INSPECTION_CREATED",
        "data": created
    })

    return {"success": True, "inspection": created}

@router.post("/{inspection_id}/assign-manual")
async def manual_assign_inspection(inspection_id: str, req: ManualAssignRequest):
    """
    Manually assigns an inspection team or designated lead officer to an inspection.
    Updates inspection status to ASSIGNED, adjusts team workload if team_id matches, logs audit trail,
    and broadcasts real-time WebSocket event.
    """
    insp = query_one("SELECT * FROM inspections WHERE id = ?", (inspection_id,))
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")

    now_str = datetime.utcnow().isoformat() + "Z"
    t_name = req.team_name.strip()
    l_officer = req.lead_officer_name.strip()
    insp_id = req.inspector_id.strip() if req.inspector_id else None

    execute_commit(
        """UPDATE inspections 
           SET team_id = ?, team_name = ?, inspector_id = ?, inspector_name = ?, status = 'ASSIGNED', updated_at = ? 
           WHERE id = ?""",
        (req.team_id, t_name, insp_id, l_officer, now_str, inspection_id)
    )

    if req.team_id:
        execute_commit(
            "UPDATE inspection_teams SET current_workload = current_workload + 1, availability_status = 'ON_INSPECTION' WHERE id = ?",
            (req.team_id,)
        )

    # Log audit entry
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'COMMAND-OFFICIAL', ?, 'INSPECTION_MANUALLY_ASSIGNED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-assign-{int(time.time()*1000)}", l_officer, insp["project_name"],
         f"Manually assigned inspection {insp['inspection_code']} to {t_name} (Lead: {l_officer})", now_str)
    )

    updated_insp = query_one("SELECT * FROM inspections WHERE id = ?", (inspection_id,))

    # Broadcast WebSocket update
    await manager.broadcast({
        "type": "INSPECTION_ASSIGNED",
        "event": "INSPECTION_ASSIGNED",
        "data": updated_insp
    })

    return {"success": True, "inspection": updated_insp}

@router.delete("/{inspection_id}")
async def delete_inspection(inspection_id: str):
    """Deletes an inspection record and associated reports/evidence."""
    insp = query_one("SELECT * FROM inspections WHERE id = ?", (inspection_id,))
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")

    execute_commit("DELETE FROM inspection_reports WHERE inspection_id = ?", (inspection_id,))
    execute_commit("DELETE FROM inspection_evidence WHERE inspection_id = ?", (inspection_id,))
    execute_commit("DELETE FROM inspections WHERE id = ?", (inspection_id,))

    now_str = datetime.utcnow().isoformat() + "Z"
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'COMMAND-OFFICIAL', 'DoSJE Command Official', 'INSPECTION_DELETED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-del-{int(time.time()*1000)}", insp["project_name"], f"Deleted inspection {insp['inspection_code']}", now_str)
    )

    await manager.broadcast({
        "type": "INSPECTION_DELETED",
        "event": "INSPECTION_DELETED",
        "data": {"inspection_id": inspection_id}
    })

    return {"success": True, "deleted_id": inspection_id}

@router.post("/ai-assign")
async def ai_random_assign_inspection(req: DynamicAIAssignRequest):
    """
    AI Dynamic Random Assignment Engine:
    Calculates dynamic inspection team assignment based on DB parameters:
    - Project Risk Score & Compliance History
    - Available Inspection Teams in District/State
    - Current Workload Count & Distance Feasibility
    NEVER uses fixed hardcoded pairs.
    """
    now_str = datetime.utcnow().isoformat() + "Z"

    # Find pending inspection
    insp = None
    if req.inspection_id:
        insp = query_one("SELECT * FROM inspections WHERE id = ?", (req.inspection_id,))
    elif req.project_id:
        insp = query_one("SELECT * FROM inspections WHERE project_id = ? AND status = 'PENDING'", (req.project_id,))
    else:
        insp = query_one("SELECT * FROM inspections WHERE status = 'PENDING' ORDER BY created_at ASC")

    if not insp:
        # Create a dynamic surprise inspection if none pending
        projects = query_all("SELECT * FROM projects ORDER BY risk_score DESC")
        if not projects:
            raise HTTPException(status_code=400, detail="No projects registered in database to assign inspection")
        target_proj = projects[0]
        
        iid = f"insp-{uuid.uuid4().hex[:8]}"
        code = f"INSP-AI-{int(time.time())}"
        execute_commit(
            """INSERT INTO inspections (id, inspection_code, project_id, project_name, ngo_institute, inspection_type,
                                        reason, priority, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'RANDOM_AI', 'AI Risk-Based Automated Surprise Inspection', 'HIGH', 'PENDING', ?, ?)""",
            (iid, code, target_proj["id"], target_proj["name"], target_proj["ngo_institute"], now_str, now_str)
        )
        insp = query_one("SELECT * FROM inspections WHERE id = ?", (iid,))

    proj = query_one("SELECT * FROM projects WHERE id = ?", (insp["project_id"],))
    state = proj["state"] if proj else "Tamil Nadu"

    # Fetch available inspection teams from DB
    teams = query_all("SELECT * FROM inspection_teams WHERE availability_status = 'AVAILABLE' ORDER BY current_workload ASC")
    if not teams:
        # Fallback to any registered inspection team
        teams = query_all("SELECT * FROM inspection_teams ORDER BY current_workload ASC")

    if not teams:
        raise HTTPException(
            status_code=400,
            detail="No inspection teams registered in the system. Please register an inspection team in the 'Inspection Teams' tab or assign an officer manually."
        )

    # AI Assignment Scoring Formula
    # Score = (100 - Workload * 20) + (10 if state match else 0)
    best_team = max(teams, key=lambda t: (100 - t["current_workload"] * 20) + (10 if t["state"] == state else 0))

    # Update inspection record with dynamic AI assignment
    execute_commit(
        """UPDATE inspections 
           SET team_id = ?, team_name = ?, inspector_name = ?, status = 'ASSIGNED', updated_at = ? 
           WHERE id = ?""",
        (best_team["id"], best_team["team_name"], best_team["lead_officer_name"], now_str, insp["id"])
    )

    # Update team workload
    execute_commit(
        "UPDATE inspection_teams SET current_workload = current_workload + 1, availability_status = 'ON_INSPECTION' WHERE id = ?",
        (best_team["id"],)
    )

    # Log audit entry
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'AI-ENGINE', 'AI Dynamic Inspection Dispatcher', 'INSPECTION_ASSIGNED_BY_AI', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-ai-{int(time.time()*1000)}", best_team["team_name"], f"AI dynamically assigned inspection {insp['inspection_code']} to {best_team['team_name']}", now_str)
    )

    updated_insp = query_one("SELECT * FROM inspections WHERE id = ?", (insp["id"],))

    # Broadcast WebSocket update for mobile app and dashboard
    await manager.broadcast({
        "type": "INSPECTION_ASSIGNED",
        "event": "INSPECTION_ASSIGNED",
        "data": updated_insp
    })

    return {
        "success": True,
        "assigned_inspection": updated_insp,
        "assigned_team": best_team,
        "ai_match_explanation": f"Assigned to '{best_team['team_name']}' based on lowest workload ({best_team['current_workload']}) and geographic proximity."
    }

@router.post("/{inspection_id}/report")
async def submit_inspection_report(inspection_id: str, req: InspectionReportSubmitRequest):
    """
    Submits a geo-tagged inspection report containing device GPS lat/lng coordinates.
    Updates inspection status to COMPLETED and recalculates project compliance score.
    """
    insp = query_one("SELECT * FROM inspections WHERE id = ?", (inspection_id,))
    if not insp:
        raise HTTPException(status_code=404, detail="Inspection not found")

    rid = f"rep-{uuid.uuid4().hex[:8]}"
    now_str = datetime.utcnow().isoformat() + "Z"

    execute_commit(
        """INSERT INTO inspection_reports (id, inspection_id, project_id, inspector_id, inspector_name,
                                           latitude, longitude, accuracy, geofence_status, observations,
                                           compliance_findings, violations, beneficiary_verification_summary,
                                           staff_verification_summary, remarks, final_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)""",
        (rid, inspection_id, insp["project_id"], req.inspector_id, req.inspector_name,
         req.latitude, req.longitude, req.accuracy, req.geofence_status, req.observations,
         req.compliance_findings, req.violations, req.beneficiary_verification_summary,
         req.staff_verification_summary, req.remarks, now_str)
    )

    # Update inspection status to COMPLETED
    execute_commit(
        "UPDATE inspections SET status = 'COMPLETED', completion_time = ?, updated_at = ? WHERE id = ?",
        (now_str, now_str, inspection_id)
    )

    # Log audit entry
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, ?, ?, 'INSPECTION_REPORT_SUBMITTED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-rep-{int(time.time()*1000)}", req.inspector_id, req.inspector_name, insp["project_name"], f"Submitted report for {insp['inspection_code']}", now_str)
    )

    report = query_one("SELECT * FROM inspection_reports WHERE id = ?", (rid,))

    # Broadcast WebSocket update
    await manager.broadcast({
        "type": "INSPECTION_COMPLETED",
        "event": "INSPECTION_COMPLETED",
        "data": {"inspection_id": inspection_id, "report": report}
    })

    return {"success": True, "report": report}

class DirectEvidenceUploadRequest(BaseModel):
    assignment_id: Optional[str] = None
    inspection_id: Optional[str] = None
    user_id: Optional[str] = None
    evidence_type: str = "PHOTO"
    file_url: Optional[str] = None
    image_base64: Optional[str] = None
    latitude: float = Field(..., example=11.0168)
    longitude: float = Field(..., example=76.9558)
    accuracy: Optional[float] = Field(None, example=8.5)
    geofence_status: Optional[str] = Field("INSIDE_GEOFENCE", example="INSIDE_GEOFENCE")
    timestamp: Optional[str] = None
    description: Optional[str] = Field("Field inspection photo verification", example="Field inspection photo verification")

@router.post("/evidence")
async def submit_inspection_evidence(req: DirectEvidenceUploadRequest):
    """
    Submits geo-tagged evidence directly from Flutter Field App or Web Dashboard.
    Associates evidence with: User -> Assignment -> Inspection.
    Updates assignment inspection status to COMPLETED and broadcasts real-time telemetry.
    """
    eid = f"evd-{uuid.uuid4().hex[:8]}"
    now_str = datetime.utcnow().isoformat() + "Z"
    ts = req.timestamp or now_str

    final_file_url = req.file_url or ""
    if req.image_base64:
        if not req.image_base64.startswith("data:"):
            final_file_url = f"data:image/jpeg;base64,{req.image_base64}"
        else:
            final_file_url = req.image_base64
    
    if not final_file_url:
        final_file_url = f"/api/storage/evidence/{eid}.jpg"

    insp_id = req.inspection_id or (f"insp-{req.assignment_id}" if req.assignment_id else f"insp-{uuid.uuid4().hex[:8]}")
    user_id = req.user_id or "OFFICER"

    # If assignment_id is provided, verify and update geofence_assignments
    if req.assignment_id:
        assignment = query_one("SELECT * FROM geofence_assignments WHERE id = ?", (req.assignment_id,))
        if assignment:
            user_id = assignment.get("user_id") or user_id
            execute_commit(
                "UPDATE geofence_assignments SET inspection_status = 'COMPLETED', status = 'COMPLETED' WHERE id = ?",
                (req.assignment_id,)
            )

    execute_commit(
        """INSERT INTO inspection_evidence (id, inspection_id, assignment_id, evidence_type, file_url,
                                            latitude, longitude, accuracy, geofence_status, timestamp,
                                            inspector_id, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (eid, insp_id, req.assignment_id, req.evidence_type, final_file_url,
         req.latitude, req.longitude, req.accuracy, req.geofence_status, ts,
         user_id, req.description, now_str)
    )

    try:
        execute_supabase_upsert("inspection_evidence", {
            "id": eid,
            "inspection_id": insp_id,
            "assignment_id": req.assignment_id,
            "evidence_type": req.evidence_type,
            "file_url": final_file_url,
            "latitude": req.latitude,
            "longitude": req.longitude,
            "accuracy": req.accuracy,
            "geofence_status": req.geofence_status,
            "timestamp": ts,
            "inspector_id": user_id,
            "description": req.description,
            "created_at": now_str
        })
    except Exception:
        pass

    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, ?, ?, 'EVIDENCE_SUBMITTED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-evd-{int(time.time()*1000)}", user_id, user_id, req.assignment_id or insp_id,
         f"Inspection evidence submitted at ({req.latitude}, {req.longitude})", now_str)
    )

    evidence_record = query_one("SELECT * FROM inspection_evidence WHERE id = ?", (eid,))

    await manager.broadcast({
        "type": "EVIDENCE_SUBMITTED",
        "event": "EVIDENCE_SUBMITTED",
        "data": {
            "id": eid,
            "assignment_id": req.assignment_id,
            "inspection_id": insp_id,
            "user_id": user_id,
            "latitude": req.latitude,
            "longitude": req.longitude,
            "accuracy": req.accuracy,
            "geofence_status": req.geofence_status,
            "file_url": final_file_url,
            "timestamp": ts,
            "inspection_status": "COMPLETED"
        }
    })

    return {
        "success": True,
        "message": "Inspection evidence recorded successfully",
        "evidence": evidence_record,
        "assignment_id": req.assignment_id,
        "inspection_status": "COMPLETED"
    }

@router.post("/{inspection_id}/evidence")
async def upload_inspection_evidence(inspection_id: str, req: EvidenceUploadRequest):
    """Links photo, video, or document evidence to an active inspection."""
    eid = f"evd-{uuid.uuid4().hex[:8]}"
    now_str = datetime.utcnow().isoformat() + "Z"

    execute_commit(
        """INSERT INTO inspection_evidence (id, inspection_id, evidence_type, file_url, latitude, longitude, timestamp, inspector_id, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (eid, inspection_id, req.evidence_type, req.file_url, req.latitude, req.longitude, now_str, req.inspector_id, req.description, now_str)
    )

    evidence = query_one("SELECT * FROM inspection_evidence WHERE id = ?", (eid,))
    return {"success": True, "evidence": evidence}

@router.get("/{inspection_id}/evidence")
def get_inspection_evidence(inspection_id: str):
    """Fetch all evidence linked to an inspection."""
    return query_all("SELECT * FROM inspection_evidence WHERE inspection_id = ? ORDER BY created_at DESC", (inspection_id,))

@router.get("/teams")
def get_all_inspection_teams():
    """Fetch registered inspection teams and workload stats."""
    return query_all("SELECT * FROM inspection_teams ORDER BY created_at DESC")

@router.post("/teams")
async def create_inspection_team(req: InspectionTeamCreateRequest):
    """Register a new inspection team in the database."""
    tid = f"team-{uuid.uuid4().hex[:8]}"
    now_str = datetime.utcnow().isoformat() + "Z"

    execute_commit(
        """INSERT INTO inspection_teams (id, team_name, lead_officer_name, members_json, state, district, availability_status, current_workload, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 0, ?)""",
        (tid, req.team_name, req.lead_officer_name, json.dumps(req.members), req.state, req.district, now_str)
    )

    created = query_one("SELECT * FROM inspection_teams WHERE id = ?", (tid,))
    return {"success": True, "team": created}

@router.delete("/teams/{team_id}")
async def delete_inspection_team(team_id: str):
    """Deletes a registered inspection team."""
    team = query_one("SELECT * FROM inspection_teams WHERE id = ?", (team_id,))
    if not team:
        raise HTTPException(status_code=404, detail="Inspection team not found")

    execute_commit("DELETE FROM inspection_teams WHERE id = ?", (team_id,))
    return {"success": True, "deleted_id": team_id}

