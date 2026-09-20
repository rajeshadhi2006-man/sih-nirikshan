import uuid
import time
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from ..database import query_all, query_one, execute_commit
from ..websocket.connection_manager import manager

router = APIRouter(prefix="/api/calls", tags=["WebRTC Video Call & Signaling Hub"])

# In-memory WebRTC active call sessions
active_calls: Dict[str, Dict[str, Any]] = {}
call_websockets: Dict[str, List[WebSocket]] = {}

class RandomVCRequest(BaseModel):
    project_id: Optional[str] = Field(None, example="proj-001")
    target_role: Optional[str] = Field("INCHARGE", example="INCHARGE") # INCHARGE | STAFF | BENEFICIARY

@router.post("/random-vc")
async def initiate_random_vc(req: RandomVCRequest):
    """
    Random VC / Surprise Call Engine:
    Selects an eligible target person (Project Incharge, Staff, or Beneficiary) dynamically
    from actual database records and dispatches a WebRTC call session.
    """
    now_str = datetime.utcnow().isoformat() + "Z"
    target_user_id = None
    target_name = None
    site_name = "DoSJE Project Site"

    if req.project_id:
        proj = query_one("SELECT * FROM projects WHERE id = ?", (req.project_id,))
        if proj:
            site_name = proj["name"]
            target_name = proj["incharge_name"]
            target_user_id = f"incharge-{proj['id']}"

    if not target_user_id:
        db_users = query_all("SELECT * FROM users ORDER BY RANDOM()")
        if db_users:
            u = db_users[0]
            target_user_id = u["user_id"]
            target_name = u["full_name"]
            site_name = f"{u['department']} Unit"

    if not target_user_id:
        target_user_id = "OFFICER-01"
        target_name = "Field Officer"

    call_id = f"call-vc-{uuid.uuid4().hex[:8]}"
    call_session = {
        "call_id": call_id,
        "user_id": target_user_id,
        "officer_id": "COMMAND-HQ",
        "officer_name": target_name,
        "site_name": site_name,
        "trigger_reason": f"SURPRISE_RANDOM_VC ({req.target_role or 'PERSONNEL'})",
        "status": "CONNECTED",
        "is_automatic": True,
        "created_at": now_str,
        "started_at": now_str,
        "ended_at": None
    }
    active_calls[call_id] = call_session

    # Log VC session into database
    execute_commit(
        """INSERT INTO vc_sessions (id, project_id, project_name, target_person_id, target_person_name, target_role, initiator_id, status, started_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'COMMAND-OFFICER', 'CONNECTED', ?, ?)""",
        (call_id, req.project_id or "GENERIC", site_name, target_user_id, target_name, req.target_role or "STAFF", now_str, now_str)
    )

    # Log audit entry
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'COMMAND-OFFICER', 'Command Official', 'RANDOM_VC_INITIATED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-vc-{int(time.time()*1000)}", target_name, f"Initiated random surprise VC call to {target_name} ({target_user_id})", now_str)
    )

    # Broadcast WebSocket CALL_STARTED
    await manager.broadcast({
        "type": "CALL_STARTED",
        "event": "RANDOM_VC_STARTED",
        "data": call_session
    })

    return {"success": True, "call_session": call_session}

class InitiateCallRequest(BaseModel):
    user_id: str = Field(..., example="OFFICER-01")
    officer_id: Optional[str] = Field("COMMAND-HQ", example="COMMAND-HQ")
    site_name: Optional[str] = Field("Field Operations Site", example="Field Operations Site")

class CallSignalPayload(BaseModel):
    call_id: str
    sender: str
    target: str
    type: str # "OFFER" | "ANSWER" | "ICE_CANDIDATE" | "REJECT" | "END"
    sdp: Optional[str] = None
    candidate: Optional[Dict[str, Any]] = None

@router.post("/initiate")
async def initiate_call(req: InitiateCallRequest):
    """
    Initiates an in-app WebRTC video call session for a field worker.
    Creates call session, logs audit entry, and broadcasts CALL_STARTED over WebSockets.
    """
    call_id = f"call-{uuid.uuid4().hex[:10]}"
    now_str = datetime.utcnow().isoformat() + "Z"

    call_session = {
        "call_id": call_id,
        "user_id": req.user_id,
        "officer_id": req.officer_id or "COMMAND-HQ",
        "site_name": req.site_name,
        "status": "RINGING", # RINGING | CONNECTED | ENDED | REJECTED
        "created_at": now_str,
        "started_at": None,
        "ended_at": None
    }
    active_calls[call_id] = call_session

    # Log audit entry
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, ?, 'Command Officer', 'CALL_INITIATED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-call-{int(time.time()*1000)}", req.officer_id or "COMMAND-HQ", req.user_id, f"Initiated WebRTC video call to {req.user_id}", now_str)
    )

    # Broadcast WebSocket CALL_STARTED to field applications
    await manager.broadcast({
        "type": "CALL_STARTED",
        "event": "CALL_STARTED",
        "data": call_session
    })

    return {"success": True, "call_session": call_session}

@router.get("/active")
def get_active_calls():
    """Fetch currently active video call sessions."""
    return list(active_calls.values())

@router.get("/{call_id}")
def get_call_details(call_id: str):
    """Fetch details for a specific call session."""
    call = active_calls.get(call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call session not found")
    return call

@router.post("/signal")
async def send_webrtc_signal(payload: CallSignalPayload):
    """
    Relays WebRTC SDP Offers, SDP Answers, and ICE Candidates between Command Dashboard and Mobile App.
    """
    call = active_calls.get(payload.call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Active call session not found")

    now_str = datetime.utcnow().isoformat() + "Z"
    if payload.type == "ANSWER" and call["status"] == "RINGING":
        call["status"] = "CONNECTED"
        call["started_at"] = now_str
    elif payload.type == "END":
        call["status"] = "ENDED"
        call["ended_at"] = now_str

    # Broadcast signaling event over WebSockets hub
    await manager.broadcast({
        "type": "WEBRTC_SIGNAL",
        "event": "WEBRTC_SIGNAL",
        "data": payload.dict()
    })

    # Send to specific call websockets if registered
    ws_list = call_websockets.get(payload.call_id, [])
    for ws in ws_list:
        try:
            await ws.send_json({"type": "WEBRTC_SIGNAL", "data": payload.dict()})
        except Exception:
            pass

    return {"success": True, "status": call["status"]}

@router.post("/{call_id}/end")
async def end_call(call_id: str):
    """Terminates an ongoing video call session."""
    call = active_calls.get(call_id)
    now_str = datetime.utcnow().isoformat() + "Z"

    if call:
        call["status"] = "ENDED"
        call["ended_at"] = now_str

    await manager.broadcast({
        "type": "CALL_ENDED",
        "event": "CALL_ENDED",
        "data": {"call_id": call_id, "timestamp": now_str}
    })

    return {"success": True, "message": f"Call {call_id} ended"}

class FrameAnalysisRequest(BaseModel):
    call_id: str = Field(..., example="call-123456")
    user_id: str = Field(..., example="U001")
    officer_name: Optional[str] = Field("Field Officer", example="Field Officer")
    image_base64: str = Field(..., example="data:image/jpeg;base64,...")
    prompt: Optional[str] = None

class AutoTriggerCallRequest(BaseModel):
    user_id: str = Field(..., example="U001")
    trigger_reason: str = Field("GEOFENCE_BREACH", example="GEOFENCE_BREACH")
    officer_name: Optional[str] = Field("Field Officer", example="Field Officer")
    site_name: Optional[str] = Field("Perimeter Zone A", example="Perimeter Zone A")

@router.post("/analyze-frame")
async def analyze_call_frame(req: FrameAnalysisRequest):
    """
    Submits a video call snapshot frame to Gemini AI Vision for real-time
    facial liveness check, uniform compliance, and tactical threat evaluation.
    """
    from ..services.gemini_service import analyze_video_frame_with_gemini

    analysis = analyze_video_frame_with_gemini(
        image_base64=req.image_base64,
        user_id=req.user_id,
        officer_name=req.officer_name or "Field Officer",
        prompt_context=req.prompt
    )

    now_str = datetime.utcnow().isoformat() + "Z"
    analysis["timestamp"] = now_str
    analysis["call_id"] = req.call_id

    # Broadcast Gemini AI evaluation result over WebSockets hub
    await manager.broadcast({
        "type": "GEMINI_FRAME_ANALYZED",
        "event": "GEMINI_FRAME_ANALYZED",
        "data": analysis
    })

    return {"success": True, "analysis": analysis}

@router.post("/auto-trigger")
async def auto_trigger_video_call(req: AutoTriggerCallRequest):
    """
    Automated endpoint called when a perimeter breach or security event occurs.
    Initiates an urgent automatic video call session and dispatches WebSockets alerts.
    """
    call_id = f"call-auto-{uuid.uuid4().hex[:8]}"
    now_str = datetime.utcnow().isoformat() + "Z"

    call_session = {
        "call_id": call_id,
        "user_id": req.user_id,
        "officer_id": "COMMAND-AUTOMATION",
        "officer_name": req.officer_name or "Field Officer",
        "site_name": req.site_name or "Tactical Perimeter",
        "trigger_reason": req.trigger_reason,
        "status": "RINGING",
        "is_automatic": True,
        "created_at": now_str,
        "started_at": None,
        "ended_at": None
    }
    active_calls[call_id] = call_session

    # Log audit entry
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'COMMAND-AI', 'Gemini AI Automation', 'AUTO_CALL_DISPATCHED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-autocall-{int(time.time()*1000)}", req.user_id, f"Auto video call dispatched: {req.trigger_reason}", now_str)
    )

    # Broadcast auto-call event to all dashboard operators
    await manager.broadcast({
        "type": "CALL_STARTED",
        "event": "AUTOMATIC_CALL_TRIGGERED",
        "data": call_session
    })

    return {"success": True, "call_session": call_session}

@router.websocket("/ws/call/{call_id}")
async def websocket_call_signaling(websocket: WebSocket, call_id: str):
    """Dedicated WebSockets channel for low-latency WebRTC media signaling."""
    await websocket.accept()
    if call_id not in call_websockets:
        call_websockets[call_id] = []
    call_websockets[call_id].append(websocket)

    try:
        while True:
            data = await websocket.receive_json()
            # Broadcast signal to other peer on the call
            for ws in call_websockets.get(call_id, []):
                if ws != websocket:
                    await ws.send_json(data)
    except WebSocketDisconnect:
        if call_id in call_websockets and websocket in call_websockets[call_id]:
            call_websockets[call_id].remove(websocket)

