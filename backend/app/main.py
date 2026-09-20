import os
import logging
import json
import time
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, CORS_ORIGIN_REGEX, FRONTEND_URL
from .database import init_db, query_all, query_one, execute_commit
from .websocket.connection_manager import manager
from .services.simulation_service import simulator
from .models.schemas import LocationUpdatePayload, TelemetryPing, SimulationControlRequest

# Routers
from .routers.face import router as face_router
from .routers.auth import router as auth_router
from .routers.persons import router as persons_router
from .routers.users import router as users_router
from .routers.location import router as location_router
from .routers.geofences import router as geofences_router
from .routers.assignments import router as assignments_router
from .routers.devices import router as devices_router
from .routers.attendance import router as attendance_router
from .routers.verification import router as verification_router
from .routers.alerts import router as alerts_router
from .routers.analytics import router as analytics_router
from .routers.reports import router as reports_router
from .routers.calls import router as calls_router
from .routers.projects import router as projects_router
from .routers.cctv import router as cctv_router
from .routers.inspections import router as inspections_router
from .routers.anomalies import router as anomalies_router
from .routers.random_verification import router as random_verification_router

logger = logging.getLogger("main")

app = FastAPI(
    title="National Command Center Telemetry Engine",
    description="Production-Ready Python Real-Time Geospatial & Biometric Command Backend for Smart India Hackathon (SIH). Supports Web Dashboard, Flutter Government App, and Flutter User App.",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Production CORS Configuration
cors_params: Dict[str, Any] = {
    "allow_methods": ["*"],
    "allow_headers": ["*"],
    "allow_credentials": True,
}

# Clean origins: exclude wildcards when credentials are required
clean_origins = [o for o in CORS_ORIGINS if o and o != "*"]
if FRONTEND_URL and FRONTEND_URL not in clean_origins:
    clean_origins.append(FRONTEND_URL)

if clean_origins:
    cors_params["allow_origins"] = clean_origins
    if CORS_ORIGIN_REGEX:
        cors_params["allow_origin_regex"] = CORS_ORIGIN_REGEX
else:
    cors_params["allow_origins"] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    cors_params["allow_origin_regex"] = r"https://.*\.pages\.dev"

app.add_middleware(CORSMiddleware, **cors_params)

# Register Modular Routers
app.include_router(persons_router)
app.include_router(face_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(location_router)
app.include_router(geofences_router)
app.include_router(assignments_router)
app.include_router(devices_router)
app.include_router(attendance_router)
app.include_router(verification_router)
app.include_router(alerts_router)
app.include_router(analytics_router)
app.include_router(reports_router)
app.include_router(calls_router)
app.include_router(projects_router)
app.include_router(cctv_router)
app.include_router(inspections_router)
app.include_router(anomalies_router)
app.include_router(random_verification_router)

# ========================================================================
# STARTUP EVENT
# ========================================================================
@app.on_event("startup")
def on_startup():
    init_db()
    try:
        import threading
        from .services.supabase_service import sync_supabase_to_sqlite
        threading.Thread(target=sync_supabase_to_sqlite, daemon=True, name="supabase-sync").start()
    except Exception as e:
        print(f'Supabase startup sync warning: {e}')
    now_str = datetime.utcnow().isoformat() + "Z"

    # Startup audit log
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'SYS-CORE', 'FastAPI Telemetry Kernel', 'STARTUP_SYSTEM', 'Command Hub', 'SUCCESS', 'FastAPI & WebSockets Initialized', '127.0.0.1', ?)""",
        (f"log-init-{int(time.time()*1000)}", now_str)
    )

# ========================================================================
# HEALTH CHECK & SYSTEM STATUS
# ========================================================================
@app.get("/health")
def health_check():
    """
    Public production health check endpoint for Cloudflare, ALB, and monitors.
    Returns real status of Database, Supabase client, YOLO11, and CCTV.
    """
    db_ok = False
    try:
        res = query_one("SELECT 1 as alive")
        db_ok = bool(res and res.get("alive") == 1)
    except Exception as e:
        logger.error(f"Health check DB error: {e}")
        db_ok = False

    supabase_connected = False
    try:
        from .services.supabase_service import get_supabase_client
        supabase_connected = get_supabase_client() is not None
    except Exception:
        supabase_connected = False

    yolo_info: Dict[str, Any] = {"loaded": False, "device": "unknown"}
    try:
        from .services.yolo_service import yolo_service
        yolo_info = {
            "loaded": yolo_service.is_loaded,
            "device": yolo_service.device,
            "half_precision": yolo_service.use_half,
            "model": os.path.basename(yolo_service.model_path) if yolo_service.model_path else "none"
        }
    except Exception as e:
        yolo_info["error"] = str(e)

    cctv_status = "UNKNOWN"
    try:
        from .services.cctv_stream_service import cctv_stream_manager
        cctv_status = cctv_stream_manager.status
    except Exception:
        pass

    return {
        "status": "ok" if db_ok else "degraded",
        "service": "SIH Telemetry Backend",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "checks": {
            "database": "ok" if db_ok else "error",
            "supabase": "connected" if supabase_connected else "disconnected",
            "yolo11": yolo_info,
            "cctv": cctv_status,
            "active_websockets": len(manager.active_connections)
        }
    }

@app.get("/api/health")
def get_health():
    total_users = query_one("SELECT COUNT(*) as count FROM profiles")["count"] or 0
    total_geofences = query_one("SELECT COUNT(*) as count FROM geofences")["count"] or 0
    total_alerts = query_one("SELECT COUNT(*) as count FROM alerts WHERE status = 'ACTIVE'")["count"] or 0
    total_logs = query_one("SELECT COUNT(*) as count FROM audit_logs")["count"] or 0

    return {
        "status": "HEALTHY",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "active_ws_clients": len(manager.active_connections),
        "db_stats": {
            "registered_profiles": total_users,
            "active_geofences": total_geofences,
            "active_alerts": total_alerts,
            "audit_entries": total_logs
        },
        "simulation": simulator.status()
    }

@app.get("/api/audit-logs")
@app.get("/api/audits")
@app.get("/api/audits/my")
@app.get("/api/audit-logs/officer/{officer_id}")
@app.get("/api/audits/officer/{officer_id}")
def get_audit_logs(
    officer_id: Optional[str] = None,
    user_id: Optional[str] = None,
    email: Optional[str] = None,
    limit: int = 100
):
    """
    Returns system and officer security audit logs.
    Supports filtering by specific officer_id, user_id, or login email.
    """
    target = (officer_id or user_id or email or "").strip()
    if target:
        # Resolve all linked officer identifiers
        candidate_ids = [target, target.lower(), target.upper()]
        u = query_one(
            "SELECT officer_id, full_name, email FROM profiles WHERE LOWER(email) = ? OR LOWER(officer_id) = ? OR LOWER(id) = ?",
            (target.lower(), target.lower(), target.lower())
        )
        if not u:
            u = query_one(
                "SELECT person_id as officer_id, full_name, email FROM persons WHERE LOWER(email) = ? OR LOWER(person_id) = ? OR LOWER(employee_id) = ?",
                (target.lower(), target.lower(), target.lower())
            )
        if u:
            if u.get("officer_id") and u["officer_id"] not in candidate_ids:
                candidate_ids.append(u["officer_id"])
            if u.get("email") and u["email"].lower() not in candidate_ids:
                candidate_ids.append(u["email"].lower())
            if u.get("full_name") and u["full_name"] not in candidate_ids:
                candidate_ids.append(u["full_name"])

        placeholders = ",".join(["?"] * len(candidate_ids))
        logs = query_all(
            f"""SELECT * FROM audit_logs 
               WHERE officer_id IN ({placeholders}) 
                  OR officer_name IN ({placeholders}) 
                  OR details LIKE ?
               ORDER BY created_at DESC LIMIT ?""",
            tuple(candidate_ids + candidate_ids + [f"%{target}%", limit])
        )
        if logs:
            return logs

    return query_all("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", (limit,))

# ========================================================================
# CONTROLLED SIMULATION / DEMO MODE ENDPOINTS (Section 23)
# ========================================================================
@app.get("/api/demo/status")
def get_demo_status():
    return simulator.status()

@app.post("/api/demo/step")
async def step_demo_simulation():
    """Generates a discrete tick of simulated movements, breach checks, and WebSocket alerts."""
    updates = await simulator.step()
    return {"success": True, "step": simulator.step_index, "updated_units": updates}

@app.post("/api/demo/start")
def start_demo_simulation():
    simulator.is_running = True
    return {"success": True, "message": "Demo simulation activated."}

@app.post("/api/demo/stop")
def stop_demo_simulation():
    simulator.is_running = False
    return {"success": True, "message": "Demo simulation stopped."}

# ========================================================================
# WEBSOCKET REAL-TIME BROADCAST HUB (Section 8)
# Both /ws/monitoring and /ws/live are supported identically
# ========================================================================
async def handle_monitoring_websocket(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Initial snapshot to populate UI on connect
        from .routers.users import get_users
        from .routers.geofences import get_geofences
        from .routers.alerts import get_alerts
        from .routers.location import get_all_user_locations

        await websocket.send_json({
            "type": "INITIAL_SNAPSHOT",
            "event": "INITIAL_SNAPSHOT",
            "data": {
                "users": get_users(),
                "locations": get_all_user_locations(history=True),
                "geofences": get_geofences(),
                "alerts": get_alerts()
            }
        })

        while True:
            data_text = await websocket.receive_text()
            try:
                msg = json.loads(data_text)
                msg_type = msg.get("type") or msg.get("event")

                if msg_type == "LOCATION_UPDATE":
                    loc_data = msg.get("data", msg)
                    from .routers.location import update_location
                    payload = LocationUpdatePayload(**loc_data)
                    await update_location(payload)

                elif msg_type == "PING" or msg_type == "HEARTBEAT":
                    await websocket.send_json({"type": "PONG", "event": "PONG", "timestamp": time.time()})

            except Exception as e:
                await websocket.send_json({"type": "ERROR", "event": "ERROR", "message": str(e)})

    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.websocket("/ws/monitoring")
async def websocket_monitoring(websocket: WebSocket):
    """Section 8 Specified WebSocket endpoint: /ws/monitoring."""
    await handle_monitoring_websocket(websocket)

@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """Live Web Dashboard broadcast endpoint."""
    await handle_monitoring_websocket(websocket)

@app.websocket("/ws/location/{user_id}")
async def user_location_websocket(websocket: WebSocket, user_id: str):
    """Direct bi-directional WebSocket for Flutter Mobile GPS Units."""
    await manager.connect(websocket, user_id=user_id)
    now_str = datetime.utcnow().isoformat() + "Z"

    await websocket.send_json({
        "type": "HANDSHAKE_SUCCESS",
        "event": "HANDSHAKE_SUCCESS",
        "user_id": user_id,
        "message": f"Connected to National Telemetry Engine as {user_id}",
        "timestamp": now_str
    })

    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                msg = json.loads(data_text)
                loc_dict = msg.get("data", msg)
                from .routers.location import update_location
                payload = LocationUpdatePayload(
                    user_id=user_id,
                    latitude=float(loc_dict.get("latitude")),
                    longitude=float(loc_dict.get("longitude")),
                    accuracy=float(loc_dict.get("accuracy", 5.0)),
                    speed=float(loc_dict.get("speed", 0.0)),
                    heading=float(loc_dict.get("heading", 0.0)),
                    timestamp=loc_dict.get("timestamp") or datetime.utcnow().isoformat() + "Z"
                )
                ack = await update_location(payload)
                await websocket.send_json({
                    "type": "LOCATION_ACK",
                    "event": "LOCATION_ACK",
                    "user_id": user_id,
                    "is_inside": ack["is_inside"],
                    "timestamp": ack["timestamp"]
                })
            except Exception as e:
                await websocket.send_json({"type": "ERROR", "event": "ERROR", "detail": str(e)})

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id=user_id)

@app.websocket("/ws/cctv/{camera_id}")
async def cctv_camera_websocket(websocket: WebSocket, camera_id: str):
    """
    Real-Time CCTV & YOLO11 Detection WebSocket Hub.
    Continuously streams live YOLO detection metadata, counts, FPS, and status to the National Command Center.
    """
    from .services.cctv_stream_service import cctv_stream_manager
    await websocket.accept()

    async def telemetry_sender():
        while True:
            try:
                data = cctv_stream_manager.get_latest_data()
                await websocket.send_json(data)
                await asyncio.sleep(0.033)  # 30 Hz Telemetry update rate
            except Exception:
                break

    sender_task = asyncio.create_task(telemetry_sender())

    try:
        while True:
            raw_msg = await websocket.receive()
            if "bytes" in raw_msg and raw_msg["bytes"]:
                # Ultra-fast raw JPEG binary frame from Flutter Android App
                cctv_stream_manager.ingest_frame_bytes(raw_msg["bytes"])
            elif "text" in raw_msg and raw_msg["text"]:
                try:
                    msg = json.loads(raw_msg["text"])
                    msg_type = msg.get("type") or msg.get("event")
                    if msg_type == "PING":
                        await websocket.send_json({"type": "PONG", "timestamp": time.time()})
                    elif msg_type == "SET_SOURCE":
                        new_src = msg.get("source_url")
                        if new_src:
                            cctv_stream_manager.set_source(new_src)
                    elif msg_type == "CCTV_FRAME":
                        frame_data = msg.get("data", {})
                        img_b64 = frame_data.get("image")
                        if img_b64:
                            cctv_stream_manager.ingest_frame_base64(img_b64)
                except Exception:
                    pass
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        sender_task.cancel()




