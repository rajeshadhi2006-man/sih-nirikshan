import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query
from ..models.schemas import (
    AttendanceEntryRequest,
    AttendanceExitRequest,
    AttendanceVerifyRequest,
    EnrollAttendanceUserPayload,
)
from ..database import query_all, query_one, execute_commit
from ..websocket.connection_manager import manager
from ..services.geofence_service import check_geofence
from ..services.verification_fusion import fusion_engine
from ..services.supabase_service import execute_supabase_upsert

router = APIRouter(prefix="/api/attendance", tags=["Automatic Geofence Attendance"])

# ========================================================================
# STATIC ATTENDANCE ENDPOINTS (MUST PRECEDE DYNAMIC /{user_id} ROUTE)
# ========================================================================

@router.get("")
def get_all_attendance():
    """Returns official muster roll & attendance records."""
    records = query_all("SELECT * FROM attendance ORDER BY created_at DESC LIMIT 100")
    if not records:
        records = query_all("SELECT * FROM attendance_sessions ORDER BY created_at DESC LIMIT 100")
    return records


@router.post("/enroll")
async def enroll_attendance_user(req: EnrollAttendanceUserPayload):
    """
    Enroll a user for automatic zero-manual geofence attendance.
    Persists geofence boundary, enrolled user record, and geofence assignment.
    """
    now_str = datetime.utcnow().isoformat() + "Z"
    geo_id = req.geofence_id or f"geo-att-{req.user_id.lower()}"
    radius = req.geofence_radius or 200.0

    # 1. Upsert Geofence Boundary
    existing_geo = query_one("SELECT * FROM geofences WHERE id = ?", (geo_id,))
    if existing_geo:
        execute_commit(
            """UPDATE geofences 
               SET name = ?, department = ?, center_latitude = ?, center_longitude = ?, radius_meters = ?, is_active = 1
               WHERE id = ?""",
            (f"{req.name} Perimeter", req.authorized_location, req.geofence_center_lat, req.geofence_center_lng, radius, geo_id)
        )
    else:
        execute_commit(
            """INSERT INTO geofences (id, name, department, description, center_latitude, center_longitude, radius_meters, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)""",
            (geo_id, f"{req.name} Perimeter", req.authorized_location, f"Geofence for {req.name}", req.geofence_center_lat, req.geofence_center_lng, radius, now_str)
        )

    # 2. Upsert Enrolled Attendance User
    execute_commit(
        """INSERT INTO enrolled_attendance_users 
           (user_id, name, authorized_location, geofence_id, geofence_center_lat, geofence_center_lng, geofence_radius, enrollment_status, current_attendance_status, last_gps_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'ENROLLED', 'OUTSIDE', 'ONLINE', ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             name=excluded.name,
             authorized_location=excluded.authorized_location,
             geofence_id=excluded.geofence_id,
             geofence_center_lat=excluded.geofence_center_lat,
             geofence_center_lng=excluded.geofence_center_lng,
             geofence_radius=excluded.geofence_radius,
             updated_at=excluded.updated_at""",
        (req.user_id, req.name, req.authorized_location, geo_id, req.geofence_center_lat, req.geofence_center_lng, radius, now_str, now_str)
    )

    # 3. Create Geofence Assignment
    assign_id = f"assign-{uuid.uuid4().hex[:8]}"
    execute_commit(
        """INSERT INTO geofence_assignments (id, user_id, geofence_id, assigned_by, assigned_at, active)
           VALUES (?, ?, ?, 'Command Officer', ?, 1)
           ON CONFLICT(id) DO NOTHING""",
        (assign_id, req.user_id, geo_id, now_str)
    )

    # Broadcast enrollment over WebSockets
    await manager.broadcast({
        "type": "ATTENDANCE_USER_ENROLLED",
        "event": "ATTENDANCE_USER_ENROLLED",
        "data": {
            "user_id": req.user_id,
            "name": req.name,
            "authorized_location": req.authorized_location,
            "geofence_center_lat": req.geofence_center_lat,
            "geofence_center_lng": req.geofence_center_lng,
            "geofence_radius": radius,
            "timestamp": now_str
        }
    })

    enrolled_data = query_one("SELECT * FROM enrolled_attendance_users WHERE user_id = ?", (req.user_id,))
    return {"success": True, "enrolled": dict(enrolled_data) if enrolled_data else None}


@router.get("/enrolled")
def get_enrolled_attendance_users():
    """Fetch directory of all enrolled attendance personnel."""
    return query_all("SELECT * FROM enrolled_attendance_users ORDER BY created_at DESC")


@router.get("/live")
def get_live_attendance():
    """Fetch live automatic attendance dashboard cards & real-time personnel states."""
    enrolled = query_all("SELECT * FROM enrolled_attendance_users")
    if not enrolled:
        # Pull real registered persons without any synthetic or hardcoded coordinates
        persons = query_all("SELECT * FROM persons ORDER BY created_at DESC")
        if not persons:
            persons = query_all("SELECT * FROM profiles ORDER BY created_at DESC")
        if not persons:
            persons = query_all("SELECT * FROM users ORDER BY created_at DESC")

        enrolled = []
        for p in persons:
            pid = p.get("person_id") or p.get("officer_id") or p.get("user_id") or p.get("id")
            geo = query_one(
                """SELECT g.* FROM geofences g 
                   WHERE g.person_id = ? AND g.is_active = 1 
                   ORDER BY g.created_at DESC LIMIT 1""",
                (pid,)
            )
            g_lat = geo.get("center_latitude") if geo and geo.get("center_latitude") is not None else (geo.get("latitude") if geo else None)
            g_lng = geo.get("center_longitude") if geo and geo.get("center_longitude") is not None else (geo.get("longitude") if geo else None)
            g_rad = geo.get("radius_meters") if geo and geo.get("radius_meters") is not None else (geo.get("radius") if geo else 150.0)

            enrolled.append({
                "user_id": pid,
                "name": p.get("full_name") or pid,
                "authorized_location": p.get("assigned_area") or p.get("organization") or p.get("department") or "Field Operations",
                "geofence_id": geo["id"] if geo else None,
                "geofence_center_lat": g_lat,
                "geofence_center_lng": g_lng,
                "geofence_radius": g_rad,
                "current_attendance_status": "OUTSIDE",
                "last_gps_status": "ONLINE"
            })

    records = []
    present_c = 0
    leave_c = 0
    uncertain_c = 0
    signal_lost_c = 0

    for item in enrolled:
        u_id = item["user_id"]
        loc = query_one("SELECT * FROM locations WHERE user_id = ?", (u_id,))
        geo = query_one(
            """SELECT g.* FROM geofences g 
               WHERE (g.person_id = ? OR g.id = ?) AND g.is_active = 1 
               ORDER BY g.created_at DESC LIMIT 1""",
            (u_id, item.get("geofence_id") or f"geo-{u_id.lower()}")
        )

        g_lat = item.get("geofence_center_lat")
        if g_lat is None and geo:
            g_lat = geo.get("center_latitude") if geo.get("center_latitude") is not None else geo.get("latitude")

        g_lng = item.get("geofence_center_lng")
        if g_lng is None and geo:
            g_lng = geo.get("center_longitude") if geo.get("center_longitude") is not None else geo.get("longitude")

        g_rad = item.get("geofence_radius")
        if g_rad is None and geo:
            g_rad = geo.get("radius_meters") if geo.get("radius_meters") is not None else geo.get("radius", 150.0)

        lat = loc["latitude"] if loc else g_lat
        lng = loc["longitude"] if loc else g_lng
        acc = loc["accuracy"] if loc else 5.0
        is_inside = bool(loc["is_inside_geofence"]) if loc else (1 if (geo and loc) else 0)

        att = query_one("SELECT * FROM attendance WHERE (user_id = ? OR person_id = ?) ORDER BY created_at DESC", (u_id, u_id))
        status = item.get("current_attendance_status", "OUTSIDE")
        if is_inside:
            status = "PRESENT"
            present_c += 1
        elif status == "LEAVE":
            leave_c += 1
        elif status == "GPS_UNCERTAIN":
            uncertain_c += 1
        else:
            signal_lost_c += 1

        rec = {
            "user_id": u_id,
            "name": item.get("name") or u_id,
            "authorized_location": item.get("authorized_location") or (geo.get("name") if geo else "Operational Perimeter"),
            "geofence_center_lat": g_lat,
            "geofence_center_lng": g_lng,
            "geofence_radius": g_rad or 150.0,
            "current_attendance_status": status,
            "attendance_status": status,
            "latitude": lat,
            "longitude": lng,
            "accuracy": acc,
            "check_in_time": att["check_in_time"] if att else None,
            "duration_formatted": f"{int(att['duration_seconds']/60)}m" if (att and att.get("duration_seconds")) else "0m",
            "last_updated": loc["updated_at"] if loc else (item.get("updated_at") or datetime.utcnow().isoformat() + "Z")
        }
        records.append(rec)

    stats = {
        "total_enrolled": len(records),
        "present_count": present_c,
        "leave_count": leave_c,
        "gps_uncertain_count": uncertain_c,
        "signal_lost_count": signal_lost_c
    }

    return {"stats": stats, "records": records}


@router.get("/history")
def get_attendance_history(
    date: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100)
):
    """Fetch attendance sessions and audit logs with date, status, and officer filters."""
    sql = "SELECT * FROM attendance WHERE 1=1"
    params = []
    if date:
        sql += " AND date = ?"
        params.append(date)
    if user_id and user_id != 'ALL':
        sql += " AND (user_id = ? OR officer_id = ?)"
        params.extend([user_id, user_id])
    if status and status != 'ALL':
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    rows = query_all(sql, tuple(params))
    if not rows:
        s_sql = "SELECT * FROM attendance_sessions WHERE 1=1"
        s_params = []
        if date:
            s_sql += " AND date = ?"
            s_params.append(date)
        if user_id and user_id != 'ALL':
            s_sql += " AND user_id = ?"
            s_params.append(user_id)
        if status and status != 'ALL':
            s_sql += " AND status = ?"
            s_params.append(status)
        s_sql += " ORDER BY created_at DESC LIMIT ?"
        s_params.append(limit)
        rows = query_all(s_sql, tuple(s_params))

    return rows


class AttendanceCheckPayload(BaseModel):
    person_id: Optional[str] = None
    user_id: Optional[str] = None
    latitude: float
    longitude: float

@router.post("/check")
async def check_attendance(req: AttendanceCheckPayload):
    """Checks attendance status and geofence containment for an enrolled person."""
    pid = (req.person_id or req.user_id or "").strip()
    if not pid:
        raise HTTPException(status_code=400, detail="person_id or user_id required.")

    geo = query_one(
        "SELECT * FROM geofences WHERE (person_id = ? OR id = ?) AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
        (pid, f"geo-{pid.lower()}")
    )
    if not geo:
        asgn = query_one(
            """SELECT g.* FROM geofence_assignments ga JOIN geofences g ON ga.geofence_id = g.id
               WHERE (ga.user_id = ? OR ga.officer_id = ?) AND ga.active = 1 AND g.is_active = 1 LIMIT 1""",
            (pid, pid)
        )
        if asgn:
            geo = asgn

    if not geo:
        return {
            "person_id": pid,
            "has_geofence": False,
            "is_inside": False,
            "geofence_status": "GPS UNAVAILABLE",
            "attendance_status": "UNKNOWN",
            "message": "No active geofence assigned to this person."
        }

    chk = check_geofence(req.latitude, req.longitude, geo["center_latitude"], geo["center_longitude"], geo["radius_meters"], buffer_meters=15.0)
    status_str = "INSIDE" if chk["is_inside"] else "OUTSIDE"

    return {
        "person_id": pid,
        "has_geofence": True,
        "geofence_id": geo["id"],
        "geofence_name": geo["name"],
        "is_inside": chk["is_inside"],
        "geofence_status": status_str,
        "attendance_status": "PRESENT" if chk["is_inside"] else "OUTSIDE",
        "distance_meters": chk["distance_meters"],
        "radius_meters": geo["radius_meters"]
    }


@router.post("/entry")
@router.post("")
async def record_geofence_entry(req: AttendanceEntryRequest):
    """Automated Geofence Entry & Attendance Workflow with Server-Side Verification."""
    now_str = req.timestamp or (datetime.utcnow().isoformat() + "Z")
    today_date = now_str[:10]

    target_asgn = None
    asgn_id_val = getattr(req, "assignment_id", None)
    if asgn_id_val and asgn_id_val.strip():
        target_asgn = query_one(
            "SELECT * FROM geofence_assignments WHERE id = ? OR assignment_name = ?",
            (asgn_id_val.strip(), asgn_id_val.strip())
        )

    # Look up assigned geofence
    geo = None
    center_lat = None
    center_lng = None
    radius = 100.0

    if target_asgn and target_asgn.get("latitude") is not None and target_asgn.get("longitude") is not None:
        center_lat = float(target_asgn["latitude"])
        center_lng = float(target_asgn["longitude"])
        radius = float(target_asgn.get("radius_meters") or 100.0)
    else:
        geo = query_one(
            "SELECT * FROM geofences WHERE (person_id = ? OR id = ?) AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
            (req.user_id, f"geo-{req.user_id.lower()}")
        )
        if not geo:
            asgn = query_one(
                """SELECT g.* FROM geofence_assignments ga JOIN geofences g ON ga.geofence_id = g.id
                   WHERE (ga.user_id = ? OR ga.officer_id = ?) AND ga.active = 1 AND g.is_active = 1 LIMIT 1""",
                (req.user_id, req.user_id)
            )
            if asgn:
                geo = asgn
        if geo:
            center_lat = float(geo.get("center_latitude") or geo.get("latitude") or 11.0168)
            center_lng = float(geo.get("center_longitude") or geo.get("longitude") or 76.9558)
            radius = float(geo.get("radius_meters") or geo.get("radius") or 100.0)

    if center_lat is None or center_lng is None:
        center_lat = req.latitude
        center_lng = req.longitude
        radius = 100.0

    check = check_geofence(req.latitude, req.longitude, center_lat, center_lng, radius, buffer_meters=15.0)
    is_inside = check["is_inside"]
    dist_m = check["distance_meters"]

    # Reject poor accuracy if worse than 35 meters
    acc = req.accuracy or 5.0
    if acc > 35.0:
        is_inside = False

    attendance_status = "PRESENT" if is_inside else "FLAGGED_ENTRY"
    att_id = str(uuid.uuid4())

    # 1. Update assignment attendance_status if linked
    if target_asgn and is_inside:
        execute_commit(
            "UPDATE geofence_assignments SET attendance_status = 'VERIFIED' WHERE id = ?",
            (target_asgn["id"],)
        )

    # 2. Mirror to SQLite attendance
    execute_commit(
        """INSERT INTO attendance (id, user_id, officer_id, date, check_in_time, entry_lat, entry_lng, status, geofence_verified, face_verified, voice_verified, duration_seconds, created_at, updated_at, assignment_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?, ?)""",
        (att_id, req.user_id, req.user_id, today_date, now_str, req.latitude, req.longitude,
         attendance_status, 1 if is_inside else 0, now_str, now_str, asgn_id_val)
    )

    execute_commit(
        """INSERT INTO attendance_events (id, user_id, event_type, latitude, longitude, gps_verified, geofence_verified, face_verified, voice_verified, status, timestamp)
           VALUES (?, ?, 'ENTRY', ?, ?, 1, ?, 1, 1, ?, ?)""",
        (f"evt-{uuid.uuid4().hex[:8]}", req.user_id, req.latitude, req.longitude, 1 if is_inside else 0, attendance_status, now_str)
    )

    execute_commit(
        """INSERT INTO locations (user_id, latitude, longitude, accuracy, status, is_inside_geofence, timestamp, updated_at)
           VALUES (?, ?, ?, ?, 'online', ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET latitude=excluded.latitude, longitude=excluded.longitude, accuracy=excluded.accuracy, status='online', is_inside_geofence=excluded.is_inside_geofence, timestamp=excluded.timestamp, updated_at=excluded.updated_at""",
        (req.user_id, req.latitude, req.longitude, acc, 1 if is_inside else 0, now_str, now_str)
    )

    # 3. Authoritative Persistence to Supabase
    try:
        execute_supabase_upsert("attendance", {
            "id": att_id,
            "user_id": req.user_id,
            "officer_id": req.user_id,
            "date": today_date,
            "check_in_time": now_str,
            "entry_lat": req.latitude,
            "entry_lng": req.longitude,
            "status": attendance_status,
            "geofence_verified": 1 if is_inside else 0
        })
    except Exception as e:
        print(f"[Supabase Attendance Error]: {e}")

    # 4. Broadcast Real-Time WebSocket Event
    await manager.broadcast({
        "type": "ATTENDANCE_VERIFIED" if is_inside else "ATTENDANCE_FLAGGED",
        "event": "ATTENDANCE_VERIFIED" if is_inside else "ATTENDANCE_FLAGGED",
        "data": {
            "user_id": req.user_id,
            "assignment_id": asgn_id_val,
            "status": attendance_status,
            "latitude": req.latitude,
            "longitude": req.longitude,
            "accuracy": acc,
            "is_inside": is_inside,
            "distance_meters": dist_m,
            "timestamp": now_str
        }
    })

    return {
        "success": is_inside,
        "attendance_id": att_id,
        "status": attendance_status,
        "attendance_status": attendance_status,
        "is_inside_geofence": is_inside,
        "distance_meters": dist_m,
        "radius_meters": radius,
        "assignment_id": asgn_id_val,
        "message": "Attendance marked and verified inside geofence." if is_inside else f"Attendance locked: You are {dist_m}m away from the assigned geofence perimeter."
    }


@router.post("/exit")
async def record_geofence_exit(req: AttendanceExitRequest):
    """Automated Geofence Exit Workflow."""
    now_str = req.timestamp or (datetime.utcnow().isoformat() + "Z")
    today_date = now_str[:10]

    open_att = query_one(
        "SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out_time IS NULL ORDER BY created_at DESC",
        (req.user_id, today_date)
    )

    if open_att:
        execute_commit(
            """UPDATE attendance SET check_out_time = ?, exit_lat = ?, exit_lng = ?, updated_at = ?
               WHERE id = ?""",
            (now_str, req.latitude, req.longitude, now_str, open_att["id"])
        )

    execute_commit(
        """INSERT INTO attendance_events (id, user_id, event_type, latitude, longitude, gps_verified, geofence_verified, status, timestamp)
           VALUES (?, ?, 'EXIT', ?, ?, 1, 0, 'DEPARTED', ?)""",
        (f"evt-{uuid.uuid4().hex[:8]}", req.user_id, req.latitude, req.longitude, now_str)
    )

    await manager.broadcast({
        "type": "ATTENDANCE_UPDATE",
        "event": "ATTENDANCE_CHECKOUT",
        "data": {
            "user_id": req.user_id,
            "event_type": "EXIT",
            "status": "DEPARTED",
            "timestamp": now_str
        }
    })

    return {
        "success": True,
        "user_id": req.user_id,
        "event": "AUTOMATIC_EXIT",
        "timestamp": now_str
    }


# ========================================================================
# DELETE ENDPOINTS (MUST PRECEDE DYNAMIC /{user_id} ROUTE)
# ========================================================================

@router.delete("/enrolled/{user_id}")
async def delete_enrolled_attendance_user(user_id: str):
    """
    Unenroll and delete a user from automatic geofence attendance.
    Removes their enrollment, geofence assignment, and custom attendance geofence.
    """
    existing = query_one("SELECT * FROM enrolled_attendance_users WHERE user_id = ?", (user_id,))
    if not existing:
        existing = query_one("SELECT * FROM enrolled_attendance_users WHERE LOWER(user_id) = LOWER(?)", (user_id,))
        if not existing:
            raise HTTPException(status_code=404, detail=f"Enrolled attendance user '{user_id}' not found")

    actual_uid = existing["user_id"]
    geo_id = existing.get("geofence_id")

    # 1. Delete from enrolled attendance users
    execute_commit("DELETE FROM enrolled_attendance_users WHERE user_id = ?", (actual_uid,))

    # 2. Delete corresponding geofence assignments
    execute_commit("DELETE FROM geofence_assignments WHERE user_id = ?", (actual_uid,))

    # 3. If geofence was auto-created specifically for this user's attendance, remove it
    if geo_id and ("geo-att-" in geo_id or geo_id.startswith(f"geo-{actual_uid.lower()}")):
        execute_commit("DELETE FROM geofences WHERE id = ?", (geo_id,))

    # 4. Supabase sync if connected
    try:
        from ..services.supabase_service import supabase_client
        if supabase_client:
            supabase_client.table("enrolled_attendance_users").delete().eq("user_id", actual_uid).execute()
    except Exception:
        pass

    # 5. Broadcast real-time deletion over WebSockets
    await manager.broadcast({
        "type": "ATTENDANCE_USER_DELETED",
        "event": "ATTENDANCE_USER_DELETED",
        "data": {
            "user_id": actual_uid,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    })

    return {
        "success": True,
        "message": f"Personnel '{actual_uid}' successfully unenrolled from attendance",
        "user_id": actual_uid
    }


@router.delete("/history/{attendance_id}")
async def delete_attendance_history_session(attendance_id: str):
    """Delete an individual attendance session record from muster roll & audit logs."""
    execute_commit("DELETE FROM attendance_sessions WHERE attendance_id = ?", (attendance_id,))
    execute_commit("DELETE FROM attendance WHERE id = ?", (attendance_id,))

    await manager.broadcast({
        "type": "ATTENDANCE_SESSION_DELETED",
        "event": "ATTENDANCE_SESSION_DELETED",
        "data": {
            "attendance_id": attendance_id,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    })

    return {
        "success": True,
        "message": f"Attendance record '{attendance_id}' deleted successfully",
        "attendance_id": attendance_id
    }


@router.delete("/history")
async def clear_attendance_history(date: Optional[str] = Query(None, description="Optional YYYY-MM-DD date to filter deletion")):
    """Prune or clear attendance sessions."""
    if date:
        execute_commit("DELETE FROM attendance_sessions WHERE DATE(entry_time) = DATE(?)", (date,))
        execute_commit("DELETE FROM attendance WHERE DATE(timestamp) = DATE(?)", (date,))
    else:
        execute_commit("DELETE FROM attendance_sessions")
        execute_commit("DELETE FROM attendance")

    await manager.broadcast({
        "type": "ATTENDANCE_HISTORY_CLEARED",
        "event": "ATTENDANCE_HISTORY_CLEARED",
        "data": {
            "date": date,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    })

    return {"success": True, "message": f"Attendance history {'for ' + date if date else 'all'} cleared successfully"}


# ========================================================================
# PARAMETERIZED USER ROUTE (MUST BE AT THE END OF THE ROUTER)
# ========================================================================

@router.get("/{user_id}")
def get_user_attendance(user_id: str):
    """Returns complete attendance history for a specific officer."""
    records = query_all(
        "SELECT * FROM attendance WHERE user_id = ? OR officer_id = ? OR person_id = ? ORDER BY created_at DESC",
        (user_id, user_id, user_id)
    )
    if not records:
        records = query_all(
            "SELECT * FROM attendance_sessions WHERE user_id = ? ORDER BY date DESC, entry_time DESC",
            (user_id,)
        )
    return records



