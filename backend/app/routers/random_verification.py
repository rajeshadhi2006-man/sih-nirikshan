"""
AI Random Verification Router
==============================
POST /api/random-verification/initiate      — Government Web initiates session
GET  /api/random-verification/sessions      — List recent sessions (Gov Web history)
GET  /api/random-verification/{ver_id}      — Poll/get session status
POST /api/random-verification/{ver_id}/submit     — Flutter App submits face + location
POST /api/random-verification/{ver_id}/voice-result — Telephony webhook posts voice result

Architecture:
  Government Web → FastAPI → Telephony Provider → Person's Phone
                           → Flutter App (via WS) → Face + GPS → FastAPI → Final Result
"""

import json
import uuid
import time
from datetime import datetime
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from ..database import query_all, query_one, execute_commit
from ..websocket.connection_manager import manager
from ..services.telephony_service import place_verification_call
from ..services.geofence_service import check_geofence
from ..services.verification_fusion import fusion_engine
from ..routers.verification import compare_embeddings

router = APIRouter(
    prefix="/api/random-verification",
    tags=["AI Random Verification Call"]
)


# ============================================================
# Pydantic Schemas
# ============================================================

class InitiateVerificationRequest(BaseModel):
    person_id: str = Field(..., example="P00125")
    initiated_by: Optional[str] = Field("COMMAND-OFFICER", example="GOV-12345")
    initiated_by_name: Optional[str] = Field("Command Officer", example="Director S. Ramanathan")


class FlutterSubmitRequest(BaseModel):
    """Payload sent by Flutter User App after completing biometric + GPS verification."""
    person_id: str = Field(..., example="P00125")
    face_embedding: Optional[str] = Field(None, description="128-d JSON float array from live camera")
    face_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0)
    accuracy: Optional[float] = Field(None, ge=0.0)
    timestamp: Optional[str] = None


class VoiceResultRequest(BaseModel):
    """Posted by telephony provider webhook OR voice processing pipeline."""
    voice_status: str = Field(..., example="VERIFIED")  # VERIFIED | MISMATCH | NOT_ENABLED | FAILED
    voice_score: Optional[float] = Field(None, ge=0.0, le=100.0)
    call_status: Optional[str] = Field(None, example="CONNECTED")
    call_sid: Optional[str] = None
    raw_transcript: Optional[str] = None


# ============================================================
# Helper: Build full session response dict
# ============================================================

def _session_to_dict(session: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "verification_id": session.get("verification_id"),
        "person_id": session.get("person_id"),
        "person_name": session.get("person_name"),
        "status": session.get("status"),
        "call_status": session.get("call_status"),
        "voice_status": session.get("voice_status"),
        "face_status": session.get("face_status"),
        "location_status": session.get("location_status"),
        "geofence_status": session.get("geofence_status"),
        "final_result": session.get("final_result"),
        "face_score": session.get("face_score"),
        "voice_score": session.get("voice_score"),
        "latitude": session.get("latitude"),
        "longitude": session.get("longitude"),
        "telephony_provider": session.get("telephony_provider"),
        "created_at": session.get("created_at"),
        "updated_at": session.get("updated_at"),
        "completed_at": session.get("completed_at"),
    }


# ============================================================
# Background: place phone call and update session
# ============================================================

async def _place_call_and_notify(verification_id: str, person: Dict[str, Any]):
    """
    Background task:
    1. Place telephony call (real or NOT_CONFIGURED)
    2. Update session call_status
    3. Broadcast WS update
    4. Send VERIFICATION_REQUEST WS event directly to person's Flutter app socket
    """
    person_id = person.get("person_id") or person.get("employee_id", "")
    person_name = person.get("full_name", "Unknown")
    person_phone = person.get("mobile") or person.get("phone", "")
    now_str = datetime.utcnow().isoformat() + "Z"

    # ---- 1. Place phone call ----
    call_result = place_verification_call(
        to_phone=person_phone,
        person_name=person_name,
        verification_id=verification_id,
        callback_url=None  # Can add a webhook URL here if needed
    )

    call_status = call_result["status"]  # CALLING | NOT_CONFIGURED | FAILED
    telephony_provider = call_result["provider"]
    call_sid = call_result.get("call_sid")

    # Voice status: NOT_ENABLED if no voice enrollment, else PENDING for now
    voice_emb = person.get("voice_embedding")
    initial_voice_status = "NOT_ENABLED" if not voice_emb else "PENDING"

    # ---- 2. Update session in DB ----
    execute_commit(
        """UPDATE random_verification_sessions
           SET call_status = ?, telephony_call_sid = ?, telephony_provider = ?,
               status = ?, voice_status = ?, updated_at = ?
           WHERE verification_id = ?""",
        (
            call_status,
            call_sid or "",
            telephony_provider,
            "APP_NOTIFIED" if call_status in ("NOT_CONFIGURED", "CALLING") else "CALL_FAILED",
            initial_voice_status,
            now_str,
            verification_id,
        )
    )

    # ---- 3. Build WS payload ----
    session = query_one(
        "SELECT * FROM random_verification_sessions WHERE verification_id = ?",
        (verification_id,)
    )
    session_data = _session_to_dict(session) if session else {}

    # ---- 4. Send VERIFICATION_REQUEST directly to Flutter app's WS socket ----
    verification_request_msg = {
        "type": "VERIFICATION_REQUEST",
        "event": "VERIFICATION_REQUEST",
        "data": {
            "verification_id": verification_id,
            "person_id": person_id,
            "person_name": person_name,
            "initiated_by": session.get("initiated_by") if session else "COMMAND-OFFICER",
            "message": "Government AI Random Verification initiated. Please complete identity verification.",
            "timestamp": now_str,
        }
    }

    # Try per-user targeted delivery first
    user_ws = manager.user_sockets.get(person_id)
    if user_ws:
        try:
            await manager.send_personal(verification_request_msg, user_ws)
        except Exception:
            pass

    # Also broadcast so any connected Flutter transmitter with this person_id gets it
    await manager.broadcast(verification_request_msg)

    # ---- 5. Broadcast session update to all web dashboard clients ----
    await manager.broadcast({
        "type": "RANDOM_VERIFICATION_UPDATE",
        "event": "RANDOM_VERIFICATION_UPDATE",
        "data": {
            "session": session_data,
            "call_message": call_result["message"],
        }
    })


# ============================================================
# POST /api/random-verification/initiate
# ============================================================

@router.post("/initiate")
async def initiate_random_verification(
    req: InitiateVerificationRequest,
    background_tasks: BackgroundTasks
):
    """
    Initiated ONLY by Government Web Dashboard.
    1. Creates verification session
    2. Initiates telephony call (background)
    3. Sends real-time WS VERIFICATION_REQUEST to Flutter app
    4. Returns verification_id immediately so Gov Web can poll/subscribe
    """
    now_str = datetime.utcnow().isoformat() + "Z"

    # Look up person
    person = query_one(
        "SELECT * FROM persons WHERE person_id = ? OR employee_id = ?",
        (req.person_id, req.person_id)
    )
    if not person:
        raise HTTPException(
            status_code=404,
            detail=f"Person '{req.person_id}' not found. Enroll the person first."
        )

    person_id = person["person_id"]
    person_name = person.get("full_name", "Unknown")

    # Create unique verification_id
    verification_id = f"VER-{uuid.uuid4().hex[:8].upper()}"

    # Insert session into DB
    execute_commit(
        """INSERT INTO random_verification_sessions
           (verification_id, person_id, person_name, person_phone, initiated_by,
            status, call_status, voice_status, face_status, location_status,
            geofence_status, final_result, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'INITIATED', 'PENDING', 'PENDING', 'PENDING',
                   'PENDING', 'PENDING', 'PENDING', ?, ?)""",
        (
            verification_id, person_id, person_name,
            person.get("mobile") or person.get("phone") or "",
            req.initiated_by or "COMMAND-OFFICER",
            now_str, now_str
        )
    )

    # Audit log
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, ?, ?, 'RANDOM_VERIFICATION_INITIATED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (
            f"log-rv-{int(time.time()*1000)}",
            req.initiated_by or "COMMAND-OFFICER",
            req.initiated_by_name or "Command Officer",
            person_name,
            json.dumps({"verification_id": verification_id, "person_id": person_id}),
            now_str
        )
    )

    # Broadcast to all dashboard clients immediately
    await manager.broadcast({
        "type": "RANDOM_VERIFICATION_STARTED",
        "event": "RANDOM_VERIFICATION_STARTED",
        "data": {
            "verification_id": verification_id,
            "person_id": person_id,
            "person_name": person_name,
            "status": "INITIATED",
            "timestamp": now_str,
        }
    })

    # Background: place call + notify Flutter app
    background_tasks.add_task(_place_call_and_notify, verification_id, person)

    return {
        "success": True,
        "verification_id": verification_id,
        "person_id": person_id,
        "person_name": person_name,
        "status": "INITIATED",
        "message": f"Verification session {verification_id} initiated for {person_name}.",
        "timestamp": now_str,
    }


# ============================================================
# GET /api/random-verification/sessions
# ============================================================

@router.get("/sessions")
def list_verification_sessions(limit: int = 20):
    """Returns recent AI Random Verification sessions for Government Web history panel."""
    sessions = query_all(
        "SELECT * FROM random_verification_sessions ORDER BY created_at DESC LIMIT ?",
        (limit,)
    )
    return sessions


# ============================================================
# GET /api/random-verification/{verification_id}
# ============================================================

@router.get("/{verification_id}")
def get_verification_session(verification_id: str):
    """Poll a specific session. Used by Gov Web dashboard for status updates."""
    session = query_one(
        "SELECT * FROM random_verification_sessions WHERE verification_id = ?",
        (verification_id,)
    )
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {verification_id} not found.")
    return _session_to_dict(session)


# ============================================================
# POST /api/random-verification/{verification_id}/submit
# ============================================================

@router.post("/{verification_id}/submit")
async def flutter_submit_verification(
    verification_id: str,
    req: FlutterSubmitRequest
):
    """
    Called by Flutter User App after completing live face + GPS verification.
    Performs:
      1. Face embedding comparison against enrolled person
      2. GPS → Geofence check against assigned perimeter
      3. Multi-factor fusion (face + voice + geofence)
      4. Writes final result to DB
      5. Broadcasts RANDOM_VERIFICATION_COMPLETE to all WS clients
      6. Creates alert if FAILED
    """
    now_str = datetime.utcnow().isoformat() + "Z"

    # Fetch session
    session = query_one(
        "SELECT * FROM random_verification_sessions WHERE verification_id = ?",
        (verification_id,)
    )
    if not session:
        raise HTTPException(status_code=404, detail=f"Verification session {verification_id} not found.")

    person_id = session["person_id"]

    # Fetch person (for enrolled embeddings)
    person = query_one(
        "SELECT * FROM persons WHERE person_id = ? OR employee_id = ?",
        (person_id, person_id)
    )
    if not person:
        raise HTTPException(status_code=404, detail=f"Person {person_id} not found in enrollment records.")

    # ---- 1. Face Verification ----
    enrolled_face = person.get("face_embedding")
    face_score = req.face_score
    face_status = "PENDING"

    if enrolled_face and (req.face_embedding or req.face_score is not None):
        if req.face_embedding:
            comp = compare_embeddings(enrolled_face, req.face_embedding, threshold=fusion_engine.face_threshold)
            face_score = comp["score"]
            face_status = "VERIFIED" if comp["match"] else "MISMATCH"
        elif req.face_score is not None:
            face_status = "VERIFIED" if req.face_score >= fusion_engine.face_threshold else "MISMATCH"
    elif not enrolled_face:
        face_status = "MISMATCH"
        face_score = 0.0
    else:
        face_status = "MISMATCH"
        face_score = 0.0

    # ---- 2. Location & Geofence Verification ----
    location_status = "PENDING"
    geofence_status = "PENDING"
    is_inside = False

    if req.latitude is not None and req.longitude is not None:
        # Find assigned geofence for this person
        geo = query_one(
            """SELECT * FROM geofences
               WHERE (person_id = ? OR id = ?) AND is_active = 1
               ORDER BY created_at DESC LIMIT 1""",
            (person_id, f"geo-{person_id.lower()}")
        )
        if not geo:
            # Fallback: check geofence_assignments
            asgn = query_one(
                """SELECT g.* FROM geofence_assignments ga
                   JOIN geofences g ON ga.geofence_id = g.id
                   WHERE (ga.user_id = ? OR ga.officer_id = ?) AND ga.active = 1
                     AND g.is_active = 1 LIMIT 1""",
                (person_id, person_id)
            )
            if asgn:
                geo = asgn

        if geo:
            chk = check_geofence(
                req.latitude, req.longitude,
                geo["center_latitude"], geo["center_longitude"],
                geo["radius_meters"], buffer_meters=15.0
            )
            is_inside = chk["is_inside"]
            location_status = "INSIDE" if is_inside else "OUTSIDE"
            geofence_status = "INSIDE" if is_inside else "OUTSIDE"
        else:
            # No geofence assigned — GPS received but no perimeter to check against
            location_status = "INSIDE"  # Cannot verify boundary
            geofence_status = "NO_FENCE"
            is_inside = True

    # ---- 3. Voice Status (from telephony or already set) ----
    voice_status = session.get("voice_status", "PENDING")
    voice_score = session.get("voice_score")
    # If not yet set by telephony webhook, treat as NOT_ENABLED if no enrollment
    enrolled_voice = person.get("voice_embedding")
    if voice_status == "PENDING" and not enrolled_voice:
        voice_status = "NOT_ENABLED"
        voice_score = 100.0

    voice_passed = voice_status in ("VERIFIED", "NOT_ENABLED")

    # ---- 4. Final Fusion Result ----
    face_passed = face_status == "VERIFIED"
    location_passed = geofence_status in ("INSIDE", "NO_FENCE")
    is_verified = face_passed and location_passed and voice_passed

    final_result = "VERIFIED" if is_verified else "FAILED"

    confidence = round(
        (face_score or 0.0) * 0.45 +
        (voice_score or 0.0) * 0.25 +
        (25.0 if is_inside else 0.0),
        1
    )
    confidence = min(100.0, max(0.0, confidence))

    # ---- 5. Persist results ----
    execute_commit(
        """UPDATE random_verification_sessions
           SET status = 'COMPLETED', face_status = ?, location_status = ?, geofence_status = ?,
               voice_status = ?, final_result = ?, face_score = ?, voice_score = ?,
               latitude = ?, longitude = ?, updated_at = ?, completed_at = ?
           WHERE verification_id = ?""",
        (
            face_status, location_status, geofence_status,
            voice_status, final_result,
            round(face_score or 0.0, 2),
            round(voice_score or 0.0, 2),
            req.latitude, req.longitude,
            now_str, now_str,
            verification_id
        )
    )

    # Write to verification_logs (reuse existing table)
    execute_commit(
        """INSERT OR IGNORE INTO verification_logs
           (verification_id, person_id, geofence_id, gps_result, face_result, voice_result,
            final_result, confidence_score, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            verification_id, person_id,
            geo["id"] if "geo" in dir() and geo else None,
            geofence_status, face_status, voice_status,
            final_result, confidence, now_str
        )
    )

    # ---- 6. Create Alert if FAILED ----
    if not is_verified:
        reasons = []
        if not face_passed:
            reasons.append(f"Face mismatch (score: {round(face_score or 0.0, 1)}%)")
        if not location_passed:
            reasons.append("Outside assigned geofence")
        if not voice_passed:
            reasons.append("Voice mismatch")

        alert_id = f"alert-rv-{uuid.uuid4().hex[:8]}"
        execute_commit(
            """INSERT INTO alerts (id, user_id, user_name, officer_id, severity, alert_type,
               title, description, status, created_at)
               VALUES (?, ?, ?, 'COMMAND-AI', 'HIGH', 'VERIFICATION_FAILURE', ?, ?, 'ACTIVE', ?)""",
            (
                alert_id, person_id, person.get("full_name", person_id),
                f"🔴 AI Verification FAILED — {person.get('full_name', person_id)}",
                f"Random verification {verification_id} failed: {'; '.join(reasons)}.",
                now_str
            )
        )
        await manager.broadcast({
            "type": "ALERT_NEW",
            "event": "ALERT_NEW",
            "data": {
                "id": alert_id,
                "user_id": person_id,
                "user_name": person.get("full_name", person_id),
                "severity": "HIGH",
                "alert_type": "VERIFICATION_FAILURE",
                "title": f"🔴 AI Verification FAILED — {person.get('full_name', person_id)}",
                "description": f"Random verification {verification_id} failed: {'; '.join(reasons)}.",
                "status": "ACTIVE",
                "created_at": now_str,
            }
        })

    # ---- 7. Broadcast final result ----
    updated_session = query_one(
        "SELECT * FROM random_verification_sessions WHERE verification_id = ?",
        (verification_id,)
    )

    await manager.broadcast({
        "type": "RANDOM_VERIFICATION_COMPLETE",
        "event": "RANDOM_VERIFICATION_COMPLETE",
        "data": {
            "session": _session_to_dict(updated_session) if updated_session else {},
            "verification_id": verification_id,
            "person_id": person_id,
            "person_name": person.get("full_name", person_id),
            "face_status": face_status,
            "face_score": round(face_score or 0.0, 2),
            "voice_status": voice_status,
            "voice_score": round(voice_score or 0.0, 2),
            "location_status": location_status,
            "geofence_status": geofence_status,
            "final_result": final_result,
            "confidence": confidence,
            "timestamp": now_str,
        }
    })

    return {
        "success": True,
        "verification_id": verification_id,
        "person_id": person_id,
        "face_status": face_status,
        "face_score": round(face_score or 0.0, 2),
        "voice_status": voice_status,
        "location_status": location_status,
        "geofence_status": geofence_status,
        "final_result": final_result,
        "confidence": confidence,
        "timestamp": now_str,
    }


# ============================================================
# POST /api/random-verification/{verification_id}/voice-result
# ============================================================

@router.post("/{verification_id}/voice-result")
async def submit_voice_result(verification_id: str, req: VoiceResultRequest):
    """
    Posted by:
    - Telephony provider webhook (Twilio StatusCallback / Exotel callback)
    - Voice processing pipeline after analyzing the call recording
    Updates voice_status in session and broadcasts WS update.
    """
    now_str = datetime.utcnow().isoformat() + "Z"

    session = query_one(
        "SELECT * FROM random_verification_sessions WHERE verification_id = ?",
        (verification_id,)
    )
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {verification_id} not found.")

    # Map incoming status to our canonical values
    voice_map = {
        "VERIFIED": "VERIFIED", "MATCH": "VERIFIED", "PASSED": "VERIFIED",
        "MISMATCH": "MISMATCH", "FAILED": "MISMATCH", "NO_MATCH": "MISMATCH",
        "NOT_ENABLED": "NOT_ENABLED", "NOT_ENROLLED": "NOT_ENABLED",
    }
    canonical_voice = voice_map.get(req.voice_status.upper(), "MISMATCH")

    execute_commit(
        """UPDATE random_verification_sessions
           SET voice_status = ?, voice_score = ?,
               call_status = COALESCE(?, call_status), updated_at = ?
           WHERE verification_id = ?""",
        (
            canonical_voice,
            req.voice_score,
            req.call_status,
            now_str,
            verification_id
        )
    )

    updated = query_one(
        "SELECT * FROM random_verification_sessions WHERE verification_id = ?",
        (verification_id,)
    )

    await manager.broadcast({
        "type": "RANDOM_VERIFICATION_UPDATE",
        "event": "RANDOM_VERIFICATION_UPDATE",
        "data": {
            "session": _session_to_dict(updated) if updated else {},
            "field": "voice_status",
            "value": canonical_voice,
        }
    })

    return {
        "success": True,
        "verification_id": verification_id,
        "voice_status": canonical_voice,
        "timestamp": now_str,
    }
