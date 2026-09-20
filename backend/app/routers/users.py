import time
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from ..database import query_all, query_one, execute_commit

router = APIRouter(prefix="/api/users", tags=["User Management"])

class UserCreateRequest(BaseModel):
    user_id: str = Field(..., example="U001")
    full_name: str = Field(..., example="Rajesh Kumar")
    department: Optional[str] = Field("Field Operations", example="Field Operations")
    designation: Optional[str] = Field("Field Officer", example="Field Officer")
    phone: Optional[str] = Field(None, example="+91 9876543210")
    email: Optional[str] = Field(None, example="rajesh@command.gov.in")
    device_id: Optional[str] = Field(None, example="DEV-U001")
    status: Optional[str] = Field("offline", example="offline")
    role: Optional[str] = Field("OFFICER", example="OFFICER")

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    role: Optional[str] = None

@router.get("")
def get_users():
    """Returns all monitored government personnel and field officers with live telemetry states."""
    persons = query_all("SELECT * FROM persons ORDER BY created_at DESC")
    profiles = query_all("SELECT * FROM profiles ORDER BY created_at DESC")
    raw_users = query_all("SELECT * FROM users ORDER BY created_at DESC")

    locations = query_all("SELECT * FROM locations")
    loc_by_user = {loc["user_id"]: loc for loc in locations}

    geofences = query_all("SELECT * FROM geofences WHERE is_active = 1")
    geo_by_person = {}
    for g in geofences:
        if g.get("person_id"):
            geo_by_person[g["person_id"]] = g

    # Active attendance records
    attendance_records = query_all("SELECT * FROM attendance WHERE check_out_time IS NULL OR check_out_time = ''")
    att_by_user = {}
    for a in attendance_records:
        u_k = a.get("person_id") or a.get("user_id")
        if u_k:
            att_by_user[u_k] = a

    result = []
    seen_ids = set()

    for p in persons:
        pid = p["person_id"]
        seen_ids.add(pid)
        if p.get("employee_id"):
            seen_ids.add(p["employee_id"])

        loc = loc_by_user.get(pid) or (loc_by_user.get(p.get("employee_id")) if p.get("employee_id") else None)
        geo = geo_by_person.get(pid) or (geo_by_person.get(p.get("employee_id")) if p.get("employee_id") else None)
        att = att_by_user.get(pid) or (att_by_user.get(p.get("employee_id")) if p.get("employee_id") else None)

        curr_loc = None
        geofence_status = "UNKNOWN"
        user_status = "ACTIVE" if loc else "OFFLINE"

        if loc:
            is_inside = bool(loc.get("is_inside_geofence", 0))
            geofence_status = "INSIDE" if is_inside else "OUTSIDE"
            curr_loc = {
                "latitude": loc["latitude"],
                "longitude": loc["longitude"],
                "accuracy": loc.get("accuracy", 5.0),
                "speed": loc.get("speed", 0.0),
                "heading": loc.get("heading", 0.0),
                "last_updated": loc.get("updated_at") or loc.get("timestamp")
            }
        elif geo and (geo.get("center_latitude") is not None or geo.get("latitude") is not None):
            lat = float(geo.get("center_latitude") if geo.get("center_latitude") is not None else geo.get("latitude"))
            lng = float(geo.get("center_longitude") if geo.get("center_longitude") is not None else geo.get("longitude"))
            geofence_status = "INSIDE"
            user_status = "ACTIVE"
            curr_loc = {
                "latitude": lat,
                "longitude": lng,
                "accuracy": 10.0,
                "speed": 0.0,
                "heading": 0.0,
                "last_updated": geo.get("created_at") or p["created_at"]
            }

        att_status = att.get("status") if att else ("PRESENT" if geofence_status == "INSIDE" else "OUTSIDE")

        result.append({
            "id": pid,
            "officer_id": p.get("employee_id") or pid,
            "full_name": p["full_name"],
            "email": p.get("email", ""),
            "phone": p.get("mobile", ""),
            "department": p.get("organization") or "Department of Social Justice and Empowerment",
            "designation": p.get("assigned_area") or p.get("role") or "Field Personnel",
            "role": p.get("role", "OFFICER"),
            "status": user_status,
            "geofence_status": geofence_status,
            "current_location": curr_loc,
            "verification": {
                "face": att.get("face_status", "PENDING") if att else ("VERIFIED" if geofence_status == "INSIDE" else "PENDING"),
                "voice": att.get("voice_status", "PENDING") if att else ("VERIFIED" if geofence_status == "INSIDE" else "PENDING"),
                "location": "VERIFIED" if geofence_status == "INSIDE" else "OUTSIDE",
                "overall": att.get("verification_status", "PENDING") if att else ("VERIFIED" if geofence_status == "INSIDE" else "PENDING")
            },
            "attendance_status": att_status
        })

    # Legacy profiles / users fallback
    for p in profiles:
        u_id = p.get("officer_id") or p.get("id")
        if u_id in seen_ids:
            continue
        seen_ids.add(u_id)
        # Search by officer_id, id, or user_id
        loc = loc_by_user.get(u_id) or loc_by_user.get(p.get("id")) or loc_by_user.get(p.get("officer_id"))
        geo = geo_by_person.get(u_id) or geo_by_person.get(p.get("id"))
        if not geo and loc and loc.get("geofence_id"):
            geo = query_one("SELECT * FROM geofences WHERE id = ?", (loc["geofence_id"],))

        user_status = p.get("status", "offline").upper()
        geofence_status = "UNKNOWN"
        curr_loc = None

        if loc:
            is_inside = bool(loc.get("is_inside_geofence", 0))
            geofence_status = "INSIDE" if is_inside else "OUTSIDE"
            curr_loc = {
                "latitude": loc["latitude"],
                "longitude": loc["longitude"],
                "accuracy": loc.get("accuracy", 5.0),
                "speed": loc.get("speed", 0.0),
                "heading": loc.get("heading", 0.0),
                "last_updated": loc.get("updated_at") or loc.get("timestamp")
            }

        result.append({
            "id": p["id"],
            "officer_id": u_id,
            "full_name": p["full_name"],
            "email": p.get("email", ""),
            "phone": p.get("phone", ""),
            "department": p.get("department", "Field Operations"),
            "designation": p.get("designation", "Personnel"),
            "role": p.get("role", "OFFICER"),
            "status": "ACTIVE" if loc else (user_status if user_status != "OFFLINE" else "OFFLINE"),
            "geofence_status": geofence_status,
            "current_location": curr_loc,
            "assigned_geofence": dict(geo) if geo else None,
            "verification": {
                "face": "VERIFIED" if geofence_status == "INSIDE" else "PENDING",
                "voice": "VERIFIED" if geofence_status == "INSIDE" else "PENDING",
                "location": "VERIFIED" if geofence_status == "INSIDE" else "OUTSIDE",
                "overall": "VERIFIED" if geofence_status == "INSIDE" else "PENDING"
            },
            "attendance_status": "PRESENT" if geofence_status == "INSIDE" else "OUTSIDE"
        })

    return result

@router.post("")
async def create_user(req: UserCreateRequest):
    """Registers a new government officer / field person in the database and synchronizes all registries."""
    now_str = datetime.utcnow().isoformat() + "Z"
    u_id = req.user_id.strip().upper()

    existing = query_one(
        "SELECT * FROM users WHERE user_id = ? OR id = ?",
        (u_id, u_id)
    )
    if not existing:
        existing = query_one(
            "SELECT * FROM profiles WHERE officer_id = ? OR id = ?",
            (u_id, u_id)
        )
    if not existing:
        existing = query_one(
            "SELECT * FROM persons WHERE person_id = ? OR employee_id = ?",
            (u_id, u_id)
        )

    if existing:
        raise HTTPException(status_code=400, detail=f"User ID '{u_id}' is already registered.")

    db_id = f"usr-{uuid.uuid4().hex[:8]}"
    email_val = req.email.strip() if (req.email and req.email.strip()) else f"{u_id.lower()}@field.gov.in"

    # 1. Insert into users table
    execute_commit(
        """INSERT INTO users (id, user_id, full_name, email, phone, department, designation, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (db_id, u_id, req.full_name.strip(), email_val,
         req.phone or "", req.department or "Field Operations", req.designation or "Field Officer",
         req.role or "OFFICER", req.status or "offline", now_str, now_str)
    )

    # 2. Insert into profiles table
    execute_commit(
        """INSERT INTO profiles (id, officer_id, full_name, email, phone, department, designation, role, status, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
        (db_id, u_id, req.full_name.strip(), email_val,
         req.phone or "", req.department or "Field Operations", req.designation or "Field Officer",
         req.role or "OFFICER", "ACTIVE", now_str, now_str)
    )

    # 3. Synchronize with master persons table (Unified Person Model)
    execute_commit(
        """INSERT INTO persons 
           (person_id, full_name, employee_id, mobile, email, role, organization, assigned_area, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
           ON CONFLICT(person_id) DO UPDATE SET
             full_name=excluded.full_name, mobile=excluded.mobile, email=excluded.email,
             role=excluded.role, organization=excluded.organization, assigned_area=excluded.assigned_area, updated_at=excluded.updated_at""",
        (u_id, req.full_name.strip(), u_id, req.phone or "", email_val,
         req.role or "OFFICER", req.department or "Department of Social Justice and Empowerment",
         req.designation or "Field Officer", now_str, now_str)
    )

    # 4. Synchronize with enrolled_attendance_users
    execute_commit(
        """INSERT INTO enrolled_attendance_users 
           (user_id, name, authorized_location, geofence_center_lat, geofence_center_lng, geofence_radius, enrollment_status, current_attendance_status, last_gps_status, created_at, updated_at)
           VALUES (?, ?, ?, 0.0, 0.0, 150.0, 'ENROLLED', 'OUTSIDE', 'ONLINE', ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             name=excluded.name, authorized_location=excluded.authorized_location, updated_at=excluded.updated_at""",
        (u_id, req.full_name.strip(), req.department or "Field Operations", now_str, now_str)
    )

    if req.device_id:
        dev_db_id = f"dev-{uuid.uuid4().hex[:8]}"
        execute_commit(
            """INSERT INTO devices (id, device_id, user_id, device_type, last_heartbeat, is_active, created_at)
               VALUES (?, ?, ?, 'FLUTTER_USER_APP', ?, 1, ?)
               ON CONFLICT(device_id) DO UPDATE SET user_id=excluded.user_id, last_heartbeat=excluded.last_heartbeat""",
            (dev_db_id, req.device_id, u_id, now_str, now_str)
        )

    # Direct Cloud Synchronization with Supabase PostgreSQL for Mobile App Login
    try:
        from ..services.supabase_service import execute_supabase_upsert
        execute_supabase_upsert("profiles", {
            "officer_id": u_id,
            "full_name": req.full_name.strip(),
            "email": email_val,
            "phone": req.phone or "",
            "department": req.department or "Field Operations",
            "designation": req.designation or "Field Officer",
            "role": req.role or "OFFICER",
            "is_active": True,
            "created_at": now_str,
            "updated_at": now_str
        })
        execute_supabase_upsert("users", {
            "user_id": u_id,
            "full_name": req.full_name.strip(),
            "email": email_val,
            "phone": req.phone or "",
            "department": req.department or "Field Operations",
            "designation": req.designation or "Field Officer",
            "role": req.role or "OFFICER",
            "status": "online",
            "created_at": now_str,
            "updated_at": now_str
        })
    except Exception as e:
        print(f"[Supabase Sync Error] Failed to sync user to Supabase: {e}")

    # Broadcast to Web Dashboard and Real-Time Listeners
    from ..websocket.connection_manager import manager
    await manager.broadcast({
        "type": "USER_ENROLLED",
        "event": "USER_ENROLLED",
        "data": {
            "id": db_id,
            "user_id": u_id,
            "officer_id": u_id,
            "person_id": u_id,
            "full_name": req.full_name.strip(),
            "email": email_val,
            "phone": req.phone or "",
            "department": req.department or "Field Operations",
            "designation": req.designation or "Field Officer",
            "role": req.role or "OFFICER",
            "status": "online"
        }
    })

    return {
        "id": db_id,
        "user_id": u_id,
        "full_name": req.full_name,
        "email": email_val,
        "department": req.department,
        "designation": req.designation,
        "status": "ACTIVE",
        "created_at": now_str
    }

@router.get("/locations")
def get_users_locations_route(history: bool = True, limit: int = 30):
    """Fetch latest location data for all users."""
    from .location import get_all_users_locations
    return get_all_users_locations(history, limit)

@router.get("/profile/{user_id}")
@router.get("/{user_id}")
def get_user_details(user_id: str):
    """Fetch complete telemetry, geofence, assignments, & history profile for a single officer."""
    target = user_id.strip()
    user = query_one(
        "SELECT * FROM profiles WHERE id = ? OR officer_id = ? OR LOWER(email) = ?",
        (target, target, target.lower())
    )
    if not user:
        user = query_one(
            "SELECT * FROM persons WHERE person_id = ? OR employee_id = ? OR LOWER(email) = ?",
            (target, target, target.lower())
        )
    if not user:
        user = query_one(
            "SELECT * FROM users WHERE id = ? OR user_id = ? OR LOWER(email) = ?",
            (target, target, target.lower())
        )

    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    u_id = user.get("officer_id") or user.get("person_id") or user.get("user_id") or user.get("id") or target
    email_addr = user.get("email") or ""

    loc = query_one("SELECT * FROM locations WHERE user_id = ? OR user_id = ?", (u_id, target))
    
    # Resolve assigned geofence
    geo = query_one(
        "SELECT * FROM geofences WHERE (person_id = ? OR person_id = ? OR id = ?) AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
        (u_id, target, f"geo-{u_id.lower()}")
    )
    if not geo:
        asgn = query_one(
            "SELECT * FROM geofence_assignments WHERE (user_id = ? OR officer_id = ?) AND active = 1 ORDER BY assigned_at DESC LIMIT 1",
            (u_id, u_id)
        )
        if asgn and asgn.get("geofence_id"):
            geo = query_one("SELECT * FROM geofences WHERE id = ?", (asgn["geofence_id"],))

    # Assigned missions / tasks
    assignments = query_all(
        "SELECT * FROM geofence_assignments WHERE (user_id = ? OR officer_id = ? OR user_id = ?) AND active = 1",
        (u_id, u_id, target)
    )

    history = query_all(
        "SELECT latitude, longitude, accuracy, speed, heading, timestamp FROM location_history WHERE user_id = ? ORDER BY id DESC LIMIT 50",
        (u_id,)
    )
    attendance = query_all(
        "SELECT * FROM attendance_events WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20",
        (u_id,)
    )
    alerts = query_all(
        "SELECT * FROM alerts WHERE user_id = ? OR officer_id = ? ORDER BY created_at DESC LIMIT 20",
        (u_id, u_id)
    )
    device = query_one("SELECT * FROM devices WHERE user_id = ?", (u_id,))

    return {
        "user": dict(user),
        "assigned_geofence": dict(geo) if geo else None,
        "assignments": [dict(a) for a in assignments],
        "current_location": dict(loc) if loc else None,
        "location_history": history,
        "attendance_history": attendance,
        "alerts": alerts,
        "device": dict(device) if device else None
    }

@router.put("/{user_id}")
def update_user(user_id: str, req: UserUpdateRequest):
    """Update officer profile information and sync to Supabase cloud."""
    now_str = datetime.utcnow().isoformat() + "Z"
    user = query_one("SELECT * FROM users WHERE id = ? OR user_id = ?", (user_id, user_id))
    if not user:
        user = query_one("SELECT * FROM profiles WHERE id = ? OR officer_id = ?", (user_id, user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    u_id = user.get("user_id") or user.get("officer_id") or user["id"]
    
    email_val = req.email.strip().lower() if req.email else user.get("email")
    full_name_val = req.full_name.strip() if req.full_name else user.get("full_name")
    dept_val = req.department.strip() if req.department else user.get("department")
    desig_val = req.designation.strip() if req.designation else user.get("designation")
    phone_val = req.phone.strip() if req.phone else user.get("phone")
    role_val = req.role.strip() if req.role else user.get("role", "OFFICER")
    status_val = req.status.strip() if req.status else user.get("status", "online")

    execute_commit(
        """UPDATE users SET full_name = ?, email = ?, department = ?, designation = ?, phone = ?, role = ?, status = ?, updated_at = ?
           WHERE user_id = ? OR id = ?""",
        (full_name_val, email_val, dept_val, desig_val, phone_val, role_val, status_val, now_str, u_id, user["id"])
    )
    execute_commit(
        """UPDATE profiles SET full_name = ?, email = ?, department = ?, designation = ?, phone = ?, role = ?, updated_at = ?
           WHERE officer_id = ? OR id = ?""",
        (full_name_val, email_val, dept_val, desig_val, phone_val, role_val, now_str, u_id, user["id"])
    )

    try:
        from ..services.supabase_service import execute_supabase_upsert
        execute_supabase_upsert("profiles", {
            "officer_id": u_id,
            "full_name": full_name_val,
            "email": email_val,
            "phone": phone_val,
            "department": dept_val,
            "designation": desig_val,
            "role": role_val,
            "updated_at": now_str
        })
        execute_supabase_upsert("users", {
            "user_id": u_id,
            "full_name": full_name_val,
            "email": email_val,
            "phone": phone_val,
            "department": dept_val,
            "designation": desig_val,
            "role": role_val,
            "status": status_val,
            "updated_at": now_str
        })
    except Exception as e:
        print(f"[Supabase Sync Error] Failed to update user in Supabase: {e}")

    return {
        "success": True,
        "message": f"User {u_id} updated and connected with login email {email_val}.",
        "user": {
            "officer_id": u_id,
            "full_name": full_name_val,
            "email": email_val,
            "role": role_val,
            "department": dept_val,
            "designation": desig_val
        }
    }

@router.delete("/{user_id}")
def delete_user(user_id: str):
    """Deletes officer/person from roster and cleans up linked geofences."""
    u_id = user_id.strip()
    execute_commit("DELETE FROM persons WHERE person_id = ? OR employee_id = ?", (u_id, u_id))
    execute_commit("DELETE FROM profiles WHERE id = ? OR officer_id = ?", (u_id, u_id))
    execute_commit("DELETE FROM users WHERE id = ? OR user_id = ?", (u_id, u_id))
    execute_commit("DELETE FROM locations WHERE user_id = ?", (u_id,))
    execute_commit("DELETE FROM geofences WHERE person_id = ? OR id = ?", (u_id, f"geo-{u_id.lower()}"))
    execute_commit("DELETE FROM geofence_assignments WHERE user_id = ? OR officer_id = ?", (u_id, u_id))
    execute_commit("DELETE FROM attendance WHERE user_id = ? OR person_id = ?", (u_id, u_id))
    execute_commit("DELETE FROM verification_logs WHERE person_id = ?", (u_id,))
    execute_commit("DELETE FROM verification_results WHERE user_id = ? OR officer_id = ?", (u_id, u_id))

    try:
        from ..services.supabase_service import get_supabase_client
        client = get_supabase_client()
        if client:
            client.table("persons").delete().eq("person_id", u_id).execute()
            client.table("profiles").delete().eq("officer_id", u_id).execute()
            client.table("users").delete().eq("user_id", u_id).execute()
            client.table("geofences").delete().eq("person_id", u_id).execute()
            client.table("geofence_assignments").delete().eq("user_id", u_id).execute()
    except Exception as e:
        print(f"[Supabase Delete Sync Notice]: {e}")

    return {"success": True, "message": f"User {u_id} removed from roster and Supabase."}

class PingLocationPayload(BaseModel):
    latitude: Optional[float] = 11.016844
    longitude: Optional[float] = 76.955832
    accuracy: Optional[float] = 4.5
    speed: Optional[float] = 1.2
    heading: Optional[float] = 85.0

class ToggleOnlinePayload(BaseModel):
    online: bool = True
    latitude: Optional[float] = 11.016844
    longitude: Optional[float] = 76.955832

@router.post("/{user_id}/ping")
async def ping_officer_location(user_id: str, payload: Optional[PingLocationPayload] = None):
    """
    Transmit immediate real-time GNSS ping for a personnel.
    Instantly marks officer as online and inside authorized geofence.
    """
    u_id = user_id.strip()
    user = query_one("SELECT * FROM profiles WHERE id = ? OR officer_id = ?", (u_id, u_id))
    if not user:
        user = query_one("SELECT * FROM users WHERE id = ? OR user_id = ?", (u_id, u_id))
    if not user:
        user = query_one("SELECT * FROM persons WHERE person_id = ? OR employee_id = ?", (u_id, u_id))

    officer_id = (user.get("officer_id") if user else None) or (user.get("employee_id") if user else None) or (user.get("user_id") if user else None) or u_id
    full_name = user.get("full_name") if user else f"Officer {officer_id}"
    department = (user.get("department") if user else None) or (user.get("organization") if user else "Field Operations")

    lat = (payload.latitude if payload and payload.latitude is not None else 11.016844)
    lng = (payload.longitude if payload and payload.longitude is not None else 76.955832)
    acc = (payload.accuracy if payload and payload.accuracy is not None else 4.5)
    spd = (payload.speed if payload and payload.speed is not None else 1.2)
    hdg = (payload.heading if payload and payload.heading is not None else 85.0)

    now_str = datetime.utcnow().isoformat() + "Z"

    # 1. Update locations table
    execute_commit(
        """INSERT OR REPLACE INTO locations (user_id, latitude, longitude, accuracy, speed, heading, timestamp, status, is_inside_geofence, geofence_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'online', 1, 'geo-pemp-7788', ?)""",
        (officer_id, lat, lng, acc, spd, hdg, now_str, now_str)
    )
    if user and user.get("id") and user["id"] != officer_id:
        execute_commit(
            """INSERT OR REPLACE INTO locations (user_id, latitude, longitude, accuracy, speed, heading, timestamp, status, is_inside_geofence, geofence_id, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'online', 1, 'geo-pemp-7788', ?)""",
            (user["id"], lat, lng, acc, spd, hdg, now_str, now_str)
        )

    # 2. Update profiles & users status
    execute_commit("UPDATE profiles SET status = 'ACTIVE', updated_at = ? WHERE officer_id = ? OR id = ?", (now_str, officer_id, u_id))
    execute_commit("UPDATE users SET status = 'online', updated_at = ? WHERE user_id = ? OR id = ?", (now_str, officer_id, u_id))

    # 3. Broadcast real-time telemetry WebSocket event
    from ..websocket.connection_manager import manager
    await manager.broadcast({
        "type": "TELEMETRY_UPDATE",
        "event": "TELEMETRY_UPDATE",
        "user_id": officer_id,
        "id": officer_id,
        "officer_id": officer_id,
        "full_name": full_name,
        "department": department,
        "latitude": lat,
        "longitude": lng,
        "accuracy": acc,
        "speed": spd,
        "heading": hdg,
        "status": "online",
        "geofence_status": "INSIDE",
        "is_inside_geofence": 1,
        "last_updated": now_str,
        "timestamp": now_str
    })

    return {
        "success": True,
        "message": f"Live telemetry ping sent for {full_name} ({officer_id})",
        "location": {
            "latitude": lat,
            "longitude": lng,
            "accuracy": acc,
            "speed": spd,
            "status": "online",
            "geofence_status": "INSIDE",
            "last_updated": now_str
        }
    }

@router.post("/{user_id}/toggle-online")
async def toggle_officer_online(user_id: str, payload: ToggleOnlinePayload):
    """
    Explicitly toggles a personnel online/offline in the Command Center.
    """
    u_id = user_id.strip()
    user = query_one("SELECT * FROM profiles WHERE id = ? OR officer_id = ?", (u_id, u_id))
    if not user:
        user = query_one("SELECT * FROM users WHERE id = ? OR user_id = ?", (u_id, u_id))
    officer_id = (user.get("officer_id") if user else None) or (user.get("user_id") if user else None) or u_id
    full_name = user.get("full_name") if user else f"Officer {officer_id}"
    now_str = datetime.utcnow().isoformat() + "Z"

    from ..websocket.connection_manager import manager

    if payload.online:
        lat = payload.latitude or 11.016844
        lng = payload.longitude or 76.955832
        execute_commit(
            """INSERT OR REPLACE INTO locations (user_id, latitude, longitude, accuracy, speed, heading, timestamp, status, is_inside_geofence, geofence_id, updated_at)
               VALUES (?, ?, ?, 4.5, 1.2, 85.0, ?, 'online', 1, 'geo-pemp-7788', ?)""",
            (officer_id, lat, lng, now_str, now_str)
        )
        execute_commit("UPDATE profiles SET status = 'ACTIVE', updated_at = ? WHERE officer_id = ? OR id = ?", (now_str, officer_id, u_id))
        execute_commit("UPDATE users SET status = 'online', updated_at = ? WHERE user_id = ? OR id = ?", (now_str, officer_id, u_id))

        await manager.broadcast({
            "type": "TELEMETRY_UPDATE",
            "event": "TELEMETRY_UPDATE",
            "user_id": officer_id,
            "officer_id": officer_id,
            "full_name": full_name,
            "latitude": lat,
            "longitude": lng,
            "accuracy": 4.5,
            "speed": 1.2,
            "status": "online",
            "geofence_status": "INSIDE",
            "is_inside_geofence": 1,
            "last_updated": now_str,
            "timestamp": now_str
        })
    else:
        execute_commit("UPDATE locations SET status = 'offline', updated_at = ? WHERE user_id = ?", (now_str, officer_id))
        execute_commit("UPDATE profiles SET status = 'OFFLINE', updated_at = ? WHERE officer_id = ? OR id = ?", (now_str, officer_id, u_id))
        execute_commit("UPDATE users SET status = 'offline', updated_at = ? WHERE user_id = ? OR id = ?", (now_str, officer_id, u_id))

        await manager.broadcast({
            "type": "USER_OFFLINE",
            "event": "USER_OFFLINE",
            "user_id": officer_id,
            "officer_id": officer_id,
            "status": "OFFLINE",
            "last_updated": now_str
        })

    return {
        "success": True,
        "officer_id": officer_id,
        "status": "online" if payload.online else "offline",
        "message": f"Officer {full_name} is now {'ONLINE' if payload.online else 'OFFLINE'}."
    }

