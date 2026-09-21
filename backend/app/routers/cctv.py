import uuid
import time
import socket
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from ..config import PUBLIC_API_URL, PORT
from ..database import query_all, query_one, execute_commit
from ..services.cctv_stream_service import cctv_stream_manager
from ..services.yolo_service import yolo_service

router = APIRouter(prefix="/api/cctv", tags=["Live CCTV Surveillance Center"])

def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_base_urls(request: Optional[Request] = None) -> Tuple[str, str]:
    """
    Returns (http_base_url, ws_base_url).
    Prefers PUBLIC_API_URL if configured, otherwise falls back to incoming Request headers or LAN IP.
    """
    if PUBLIC_API_URL:
        http_base = PUBLIC_API_URL
        ws_base = PUBLIC_API_URL.replace("http://", "ws://").replace("https://", "wss://")
        return http_base, ws_base

    if request:
        proto = request.headers.get("x-forwarded-proto", request.url.scheme or "http")
        host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
        if host:
            ws_proto = "wss" if proto == "https" else "ws"
            return f"{proto}://{host}", f"{ws_proto}://{host}"

    local_ip = get_local_ip()
    return f"http://{local_ip}:{PORT}", f"ws://{local_ip}:{PORT}"

class CCTVCameraCreateRequest(BaseModel):
    project_id: str = Field(..., example="proj-001")
    camera_name: str = Field(..., example="Main Entry Gate CAM-01")
    location_description: Optional[str] = Field("Front Gate & Reception Area", example="Front Gate Area")
    stream_url: Optional[str] = Field(None, example="rtsp://192.168.1.100:554/stream1")
    status: Optional[str] = Field("ONLINE", example="ONLINE")

class CCTVConfigUpdateRequest(BaseModel):
    source_url: Optional[str] = None
    confidence: Optional[float] = None
    max_fps: Optional[int] = None
    imgsz: Optional[int] = None
    iou: Optional[float] = None
    flip_horizontal: Optional[bool] = None

class CCTVTestRequest(BaseModel):
    source_url: Optional[str] = None

class CCTVSessionStartRequest(BaseModel):
    officer_id: Optional[str] = Field("OFF-101", example="OFF-101")
    officer_name: Optional[str] = Field("Officer Vikramaditya Rao", example="Officer Vikramaditya Rao")
    device_model: Optional[str] = Field("Physical Android Phone", example="Physical Android Phone")
    resolution: Optional[str] = Field("720p", example="720p")
    fps: Optional[int] = Field(30, example=30)
    project_id: Optional[str] = Field(None, example="proj-001")

class CCTVSessionStopRequest(BaseModel):
    camera_id: str
    session_id: Optional[str] = None
    officer_id: Optional[str] = None

@router.post("/sessions/start")
def start_cctv_camera_session(req: CCTVSessionStartRequest, request: Request = None):
    """
    Initializes a dynamic mobile / drone camera streaming session.
    Associates the stream with the officer, device, session, and timestamp.
    Returns dynamic camera ID, WebSocket URL, and streaming endpoints.
    """
    http_base, ws_base = get_base_urls(request)
    session_id = f"sess-{uuid.uuid4().hex[:10]}"
    clean_officer = (req.officer_id or "OFF101").replace("-", "").upper()
    camera_id = f"CAM-{clean_officer}-{int(time.time() % 10000):04d}"
    now_str = datetime.utcnow().isoformat() + "Z"

    # Default project fallback if not provided
    project_id = req.project_id
    if not project_id:
        p = query_one("SELECT id FROM projects LIMIT 1")
        project_id = p["id"] if p else "proj-001"

    # Register dynamic camera in DB
    try:
        execute_commit(
            """INSERT OR REPLACE INTO cctv_cameras (id, project_id, camera_name, location_description, stream_url, status, last_heartbeat, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, 'ONLINE', ?, 1, ?)""",
            (
                camera_id,
                project_id,
                f"{req.officer_name} Mobile Camera ({req.device_model})",
                f"Physical Android Phone • Officer {req.officer_id} • Device: {req.device_model}",
                f"{http_base}/api/cctv/{camera_id}/stream",
                now_str,
                now_str
            )
        )
    except Exception as e:
        print(f"Error registering dynamic camera session: {e}")

    # Set as active camera in stream manager
    cctv_stream_manager.camera_id = camera_id
    cctv_stream_manager.status = "LIVE"

    return {
        "success": True,
        "camera_id": camera_id,
        "session_id": session_id,
        "status": "READY",
        "officer_id": req.officer_id,
        "officer_name": req.officer_name,
        "device": req.device_model,
        "resolution": req.resolution,
        "fps": req.fps,
        "ws_url": f"{ws_base}/ws/cctv/{camera_id}",
        "upload_url": f"{http_base}/api/cctv/frame",
        "stream_url": f"{http_base}/api/cctv/{camera_id}/stream",
        "timestamp": now_str
    }

@router.post("/sessions/stop")
def stop_cctv_camera_session(req: CCTVSessionStopRequest):
    """Terminates an active camera session and marks status OFFLINE."""
    now_str = datetime.utcnow().isoformat() + "Z"
    try:
        execute_commit(
            "UPDATE cctv_cameras SET status = 'OFFLINE', last_heartbeat = ? WHERE id = ?",
            (now_str, req.camera_id)
        )
    except Exception:
        pass
    return {"success": True, "message": f"Camera session {req.camera_id} stopped", "timestamp": now_str}

@router.get("/test")
def test_current_cctv_connection(source_url: Optional[str] = None):
    """Tests whether the configured or specified CCTV stream source can be opened and decoded."""
    return cctv_stream_manager.test_cctv_source(source_url)

@router.post("/test")
def test_cctv_connection_post(req: CCTVTestRequest):
    """Tests a specific CCTV stream source URL before saving."""
    return cctv_stream_manager.test_cctv_source(req.source_url)

@router.get("/network-test")
def network_test_cctv(source_url: Optional[str] = None):
    """Runs granular network, socket, OpenCV, and decoder diagnostics for a camera source."""
    return cctv_stream_manager.network_test_cctv_source(source_url)

@router.post("/network-test")
def network_test_cctv_post(req: CCTVTestRequest):
    """Runs granular network, socket, OpenCV, and decoder diagnostics for a specified camera URL."""
    return cctv_stream_manager.network_test_cctv_source(req.source_url)

@router.get("/network-info")
def get_network_info(request: Request = None):
    """Returns local LAN IP and stream connection information."""
    http_base, ws_base = get_base_urls(request)
    local_ip = get_local_ip()
    return {
        "local_ip": local_ip,
        "frontend_port": 5173,
        "backend_port": PORT,
        "current_source_url": cctv_stream_manager.source_url,
        "status": cctv_stream_manager.status,
        "ws_url": f"{ws_base}/ws/cctv/{cctv_stream_manager.camera_id}",
        "stream_url": f"{http_base}/api/cctv/{cctv_stream_manager.camera_id}/stream"
    }

@router.get("/config")
def get_cctv_config():
    """Returns current real-time YOLO11 and CCTV configuration."""
    return {
        "camera_id": cctv_stream_manager.camera_id,
        "source_url": cctv_stream_manager.source_url,
        "status": cctv_stream_manager.status,
        "fps": cctv_stream_manager.actual_fps,
        "yolo_fps": cctv_stream_manager.yolo_fps,
        "model_name": "YOLO11n",
        "device": yolo_service.device,
        "half_precision": yolo_service.use_half,
        "confidence": yolo_service.confidence,
        "iou": yolo_service.iou,
        "imgsz": yolo_service.imgsz,
        "max_fps": cctv_stream_manager.max_fps,
        "inference_latency_ms": yolo_service.last_inference_latency_ms,
        "flip_horizontal": cctv_stream_manager.flip_horizontal
    }

@router.post("/config")
def update_cctv_config(req: CCTVConfigUpdateRequest):
    """Updates CCTV source URL, confidence, or framerate on the fly."""
    if req.source_url is not None and req.source_url.strip():
        cctv_stream_manager.set_source(req.source_url.strip())

    if req.confidence is not None and 0.05 <= req.confidence <= 1.0:
        yolo_service.confidence = float(req.confidence)

    if req.iou is not None and 0.05 <= req.iou <= 1.0:
        yolo_service.iou = float(req.iou)

    if req.max_fps is not None and 1 <= req.max_fps <= 60:
        cctv_stream_manager.max_fps = int(req.max_fps)

    if req.imgsz is not None and req.imgsz in [320, 384, 416, 480, 640, 1280]:
        yolo_service.imgsz = int(req.imgsz)

    if req.flip_horizontal is not None:
        cctv_stream_manager.set_flip_horizontal(req.flip_horizontal)

    return {
        "success": True,
        "message": "CCTV configuration updated",
        "config": get_cctv_config()
    }

@router.post("/flip")
def toggle_or_set_flip(flip: Optional[bool] = None):
    """Toggles or explicitly sets horizontal mirror reflection for the CCTV stream."""
    if flip is None:
        new_state = not cctv_stream_manager.flip_horizontal
    else:
        new_state = bool(flip)
    cctv_stream_manager.set_flip_horizontal(new_state)
    return {"success": True, "flip_horizontal": cctv_stream_manager.flip_horizontal}

@router.get("/status")
def get_cctv_status():
    """Returns latest YOLO11 detection telemetry JSON."""
    return cctv_stream_manager.get_latest_data()

@router.get("/{camera_id}/status")
def get_camera_status(camera_id: str):
    """Returns status and detection counts for a specific camera channel."""
    return cctv_stream_manager.get_latest_data()

STREAM_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}

@router.get("/stream")
def get_default_mjpeg_stream():
    """Real-time multipart MJPEG stream with YOLO11 bounding boxes."""
    return StreamingResponse(
        cctv_stream_manager.generate_mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers=STREAM_HEADERS
    )

@router.get("/{camera_id}/stream")
def get_camera_mjpeg_stream(camera_id: str):
    """Real-time multipart MJPEG stream for a specific camera channel."""
    return StreamingResponse(
        cctv_stream_manager.generate_mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers=STREAM_HEADERS
    )

class CCTVFrameUpload(BaseModel):
    camera_id: Optional[str] = "CCTV-01"
    image: str # Base64 encoded JPEG / PNG

@router.post("/frame")
def upload_cctv_frame(payload: CCTVFrameUpload):
    """Uploads a live frame from a physical mobile phone camera, runs YOLO11, and updates the MJPEG stream and WS telemetry."""
    res = cctv_stream_manager.ingest_frame_base64(payload.image)
    return {"success": True, "data": res}

@router.get("/cameras")
def get_all_cctv_cameras(project_id: Optional[str] = None):
    """Fetch registered CCTV cameras with project metadata."""
    if project_id:
        return query_all(
            """SELECT c.*, p.name as project_name, p.state, p.district 
               FROM cctv_cameras c 
               JOIN projects p ON c.project_id = p.id 
               WHERE c.project_id = ? 
               ORDER BY c.created_at ASC""",
            (project_id,)
        )
    return query_all(
        """SELECT c.*, p.name as project_name, p.state, p.district 
           FROM cctv_cameras c 
           LEFT JOIN projects p ON c.project_id = p.id 
           ORDER BY c.created_at ASC"""
    )

@router.post("/cameras")
async def create_cctv_camera(req: CCTVCameraCreateRequest):
    """Register a new CCTV camera for a DoSJE project."""
    cid = f"cam-{uuid.uuid4().hex[:8]}"
    now_str = datetime.utcnow().isoformat() + "Z"

    proj = query_one("SELECT * FROM projects WHERE id = ?", (req.project_id,))
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    status = req.status or ("ONLINE" if req.stream_url else "UNCONFIGURED")

    execute_commit(
        """INSERT INTO cctv_cameras (id, project_id, camera_name, location_description, stream_url, status, last_heartbeat, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)""",
        (cid, req.project_id, req.camera_name, req.location_description, req.stream_url, status, now_str, now_str)
    )

    execute_commit("UPDATE projects SET cctv_count = cctv_count + 1 WHERE id = ?", (req.project_id,))

    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'COMMAND-ADMIN', 'Command Officer', 'CCTV_CAMERA_ADDED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-cctv-{int(time.time()*1000)}", req.camera_name, f"Added camera ID {cid} to project {req.project_id}", now_str)
    )

    created = query_one("SELECT * FROM cctv_cameras WHERE id = ?", (cid,))
    return {"success": True, "camera": created}

@router.delete("/cameras/{camera_id}")
def delete_cctv_camera(camera_id: str):
    """Delete a registered CCTV camera."""
    cam = query_one("SELECT * FROM cctv_cameras WHERE id = ?", (camera_id,))
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    execute_commit("DELETE FROM cctv_cameras WHERE id = ?", (camera_id,))
    execute_commit("UPDATE projects SET cctv_count = MAX(0, cctv_count - 1) WHERE id = ?", (cam["project_id"],))
    return {"success": True, "deleted_id": camera_id}
