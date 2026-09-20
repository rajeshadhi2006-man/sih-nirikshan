import uuid
import time
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..database import query_all, query_one, execute_commit
from ..websocket.connection_manager import manager
from ..services.supabase_service import execute_supabase_upsert

router = APIRouter(prefix="/api/persons", tags=["Unified Person Enrollment"])

class PersonEnrollRequest(BaseModel):
    full_name: str = Field(..., example="Rajesh Kumar")
    employee_id: str = Field(..., example="P00125")
    mobile: Optional[str] = Field(None, example="+91 9876543210")
    email: Optional[str] = Field(None, example="rajesh@field.gov.in")
    role: Optional[str] = Field("OFFICER", example="OFFICER")
    organization: Optional[str] = Field(
        "Department of Social Justice and Empowerment",
        example="Department of Social Justice and Empowerment"
    )
    assigned_area: Optional[str] = Field("Field Operations Base", example="Field Operations Base")
    profile_photo_url: Optional[str] = None
    face_embedding: Optional[str] = None
    voice_embedding: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius: Optional[float] = 150.0
    person_id: Optional[str] = None

@router.post("/enroll")
async def enroll_person(req: PersonEnrollRequest):
    """
    Unified Person Enrollment + Geo-Fence Creation Workflow:
    ONE PERSON = ONE person_id = ENROLLMENT + FACE + VOICE + GEO-FENCE + ATTENDANCE + VERIFICATION
    Enrolls person into Supabase & SQLite, generates person_id, and links assigned working area geofence.
    """
    now_str = datetime.utcnow().isoformat() + "Z"

    # Clean and validate employee_id & person_id
    clean_emp_id = req.employee_id.strip().upper()
    if not clean_emp_id:
        raise HTTPException(status_code=400, detail="Employee/Staff ID is mandatory.")
    
    clean_name = req.full_name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Full Name is mandatory.")

    # Determine unique person_id
    if req.person_id and req.person_id.strip():
        person_id = req.person_id.strip().upper()
    else:
        # Generate standardized person_id based on employee_id
        person_id = clean_emp_id if clean_emp_id.startswith("P") else f"P{clean_emp_id}"

    # Check for duplicate person_id or employee_id in persons
    existing_person = query_one(
        "SELECT * FROM persons WHERE person_id = ? OR employee_id = ?",
        (person_id, clean_emp_id)
    )
    if existing_person:
        # Update existing enrolled person rather than failing, allowing re-enrollment / profile update
        execute_commit(
            """UPDATE persons SET
               full_name = ?, mobile = ?, email = ?, role = ?, organization = ?,
               assigned_area = ?, profile_photo_url = COALESCE(?, profile_photo_url),
               face_embedding = COALESCE(?, face_embedding), voice_embedding = COALESCE(?, voice_embedding),
               status = 'ACTIVE', updated_at = ?
               WHERE person_id = ?""",
            (clean_name, req.mobile or "", req.email or f"{person_id.lower()}@field.gov.in",
             req.role or "OFFICER", req.organization or "Department of Social Justice and Empowerment",
             req.assigned_area or "Field Operations", req.profile_photo_url, req.face_embedding,
             req.voice_embedding, now_str, person_id)
        )
    else:
        # Insert new person
        execute_commit(
            """INSERT INTO persons 
               (person_id, full_name, employee_id, mobile, email, role, organization, assigned_area, profile_photo_url, face_embedding, voice_embedding, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)""",
            (person_id, clean_name, clean_emp_id, req.mobile or "",
             req.email or f"{person_id.lower()}@field.gov.in", req.role or "OFFICER",
             req.organization or "Department of Social Justice and Empowerment",
             req.assigned_area or "Field Operations", req.profile_photo_url or "",
             req.face_embedding or "", req.voice_embedding or "", now_str, now_str)
        )

    email_val = req.email.strip() if (req.email and req.email.strip()) else f"{person_id.lower()}@field.gov.in"

    # Clean up any legacy conflict by id or email before insertion
    execute_commit("DELETE FROM users WHERE user_id = ? OR id = ? OR email = ?", (person_id, person_id, email_val))
    execute_commit("DELETE FROM profiles WHERE officer_id = ? OR id = ? OR email = ?", (person_id, person_id, email_val))

    # Synchronize with legacy users & profiles for complete backward compatibility
    execute_commit(
        """INSERT INTO users (id, user_id, full_name, email, phone, department, designation, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, ?)""",
        (person_id, person_id, clean_name, email_val, req.mobile or "",
         req.organization or "Department of Social Justice and Empowerment",
         req.role or "Field Personnel", req.role or "OFFICER", now_str, now_str)
    )

    execute_commit(
        """INSERT INTO profiles (id, officer_id, full_name, email, phone, department, designation, role, status, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)""",
        (person_id, person_id, clean_name, email_val, req.mobile or "",
         req.organization or "Department of Social Justice and Empowerment",
         req.role or "Field Personnel", req.role or "OFFICER", now_str, now_str)
    )

    # Cloud mirror to Supabase PostgreSQL
    try:
        execute_supabase_upsert("persons", {
            "person_id": person_id,
            "full_name": clean_name,
            "employee_id": clean_emp_id,
            "mobile": req.mobile or "",
            "email": email_val,
            "role": req.role or "OFFICER",
            "organization": req.organization or "Department of Social Justice and Empowerment",
            "assigned_area": req.assigned_area or "Field Operations",
            "profile_photo_url": req.profile_photo_url or "",
            "face_embedding": req.face_embedding or "",
            "voice_embedding": req.voice_embedding or "",
            "status": "ACTIVE",
            "created_at": now_str,
            "updated_at": now_str
        })
        execute_supabase_upsert("profiles", {
            "officer_id": person_id,
            "full_name": clean_name,
            "email": email_val,
            "phone": req.mobile or "",
            "department": req.organization or "Department of Social Justice and Empowerment",
            "designation": req.role or "Field Personnel",
            "role": req.role or "OFFICER",
            "is_active": True,
            "created_at": now_str,
            "updated_at": now_str
        })
    except Exception as e:
        print(f"[Supabase Sync Notice - Person Enroll]: {e}")

    # GEOFENCE CREATION (if GPS coordinates provided)
    geofence_record = None
    if req.latitude is not None and req.longitude is not None:
        geo_id = f"geo-{person_id.lower()}"
        area_name = req.assigned_area or f"{clean_name}'s Working Perimeter"
        radius_m = float(req.radius or 150.0)

        existing_geo = query_one("SELECT * FROM geofences WHERE person_id = ? OR id = ?", (person_id, geo_id))
        if existing_geo:
            geo_id = existing_geo["id"]
            execute_commit(
                """UPDATE geofences SET
                   person_id = ?, name = ?, area_name = ?, department = ?,
                   center_latitude = ?, center_longitude = ?, radius_meters = ?,
                   is_active = 1, status = 'ACTIVE'
                   WHERE id = ?""",
                (person_id, area_name, area_name, req.organization or "Command Operations",
                 req.latitude, req.longitude, radius_m, geo_id)
            )
        else:
            execute_commit(
                """INSERT INTO geofences 
                   (id, person_id, name, area_name, department, description, center_latitude, center_longitude, radius_meters, is_active, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE', ?)""",
                (geo_id, person_id, area_name, area_name, req.organization or "Command Operations",
                 f"Assigned perimeter for {clean_name} ({person_id})", req.latitude, req.longitude,
                 radius_m, now_str)
            )

        # Geofence assignment linking person_id -> geofence_id
        assign_id = f"asgn-{person_id.lower()}"
        execute_commit(
            """INSERT INTO geofence_assignments (id, user_id, officer_id, geofence_id, assignment_name, assigned_by, assigned_at, active, status, created_at)
               VALUES (?, ?, ?, ?, ?, 'Command Officer', ?, 1, 'ACTIVE', ?)
               ON CONFLICT(id) DO UPDATE SET geofence_id=excluded.geofence_id, active=1, status='ACTIVE', assigned_at=excluded.assigned_at""",
            (assign_id, person_id, person_id, geo_id, area_name, now_str, now_str)
        )

        # Compatibility mirror for enrolled_attendance_users
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
            (person_id, clean_name, area_name, geo_id, req.latitude, req.longitude, radius_m, now_str, now_str)
        )

        # Mirror geofence to Supabase
        try:
            execute_supabase_upsert("geofences", {
                "id": geo_id,
                "person_id": person_id,
                "name": area_name,
                "area_name": area_name,
                "department": req.organization or "Command Operations",
                "center_latitude": req.latitude,
                "center_longitude": req.longitude,
                "radius_meters": radius_m,
                "is_active": True,
                "status": "ACTIVE",
                "created_at": now_str
            })
            execute_supabase_upsert("geofence_assignments", {
                "id": assign_id,
                "officer_id": person_id,
                "user_id": person_id,
                "geofence_id": geo_id,
                "assignment_name": area_name,
                "status": "ACTIVE",
                "active": True,
                "start_time": now_str
            })
        except Exception as e:
            print(f"[Supabase Sync Notice - Geofence Enroll]: {e}")

        geofence_record = query_one("SELECT * FROM geofences WHERE id = ?", (geo_id,))
        if geofence_record:
            geofence_record = dict(geofence_record)
            geofence_record["geofence_id"] = geofence_record.get("id")
            geofence_record["latitude"] = geofence_record.get("center_latitude")
            geofence_record["longitude"] = geofence_record.get("center_longitude")
            geofence_record["radius"] = geofence_record.get("radius_meters")

        # Initial location fixation in locations table
        execute_commit(
            """INSERT INTO locations (user_id, latitude, longitude, accuracy, speed, heading, timestamp, status, is_inside_geofence, geofence_id, updated_at)
               VALUES (?, ?, ?, 10.0, 0.0, 0.0, ?, 'online', 1, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET
                 latitude=excluded.latitude,
                 longitude=excluded.longitude,
                 accuracy=excluded.accuracy,
                 status='online',
                 is_inside_geofence=1,
                 geofence_id=excluded.geofence_id,
                 updated_at=excluded.updated_at""",
            (person_id, req.latitude, req.longitude, now_str, geo_id, now_str)
        )
        execute_commit(
            """INSERT INTO location_history (user_id, latitude, longitude, accuracy, speed, heading, timestamp, is_inside_geofence, geofence_id, created_at)
               VALUES (?, ?, ?, 10.0, 0.0, 0.0, ?, 1, ?, ?)""",
            (person_id, req.latitude, req.longitude, now_str, geo_id, now_str)
        )

    person_record = query_one("SELECT * FROM persons WHERE person_id = ?", (person_id,))
    res_person = dict(person_record) if person_record else {}

    # Broadcast WebSocket Event
    await manager.broadcast({
        "type": "PERSON_ENROLLED",
        "event": "PERSON_ENROLLED",
        "data": {
            "person": res_person,
            "geofence": geofence_record
        }
    })

    if geofence_record:
        await manager.broadcast({
            "type": "GEOFENCE_CREATED",
            "event": "GEOFENCE_CREATED",
            "data": geofence_record
        })
        await manager.broadcast_location_update(
            user_id=person_id,
            lat=float(req.latitude),
            lng=float(req.longitude),
            status="inside",
            accuracy=10.0,
            full_payload={
                "user_id": person_id,
                "officer_id": person_id,
                "full_name": clean_name,
                "department": req.organization or "Command Operations",
                "latitude": float(req.latitude),
                "longitude": float(req.longitude),
                "accuracy": 10.0,
                "speed": 0.0,
                "heading": 0.0,
                "timestamp": now_str,
                "status": "online",
                "is_inside_geofence": 1,
                "geofence_status": "INSIDE",
                "attendance_status": "PRESENT",
                "geofence_id": geo_id,
                "last_updated": now_str,
            }
        )

    return {
        "success": True,
        "person_id": person_id,
        "person": res_person,
        "geofence": geofence_record,
        "message": f"Person '{clean_name}' successfully enrolled and linked to ID {person_id}."
    }

@router.get("")
def get_all_persons():
    """
    Returns all enrolled persons joined with their active geofence,
    current telemetry location, geofence status, and attendance status.
    """
    persons = query_all("SELECT * FROM persons ORDER BY created_at DESC")
    
    # Also fetch existing profiles/users if persons is empty
    if not persons:
        profiles = query_all("SELECT * FROM profiles ORDER BY created_at DESC")
        for p in profiles:
            p_id = p.get("officer_id") or p.get("id")
            persons.append({
                "person_id": p_id,
                "full_name": p.get("full_name"),
                "employee_id": p_id,
                "mobile": p.get("phone", ""),
                "email": p.get("email", ""),
                "role": p.get("role", "OFFICER"),
                "organization": p.get("department", "Field Operations"),
                "assigned_area": p.get("designation", "Field Operations Base"),
                "profile_photo_url": "",
                "status": "ACTIVE",
                "created_at": p.get("created_at", ""),
                "updated_at": p.get("updated_at", "")
            })

    # Fetch latest location and geofences
    locations = query_all("SELECT * FROM locations")
    loc_by_user = {loc["user_id"]: loc for loc in locations}

    geofences = query_all("SELECT * FROM geofences WHERE is_active = 1")
    geo_by_person = {g["person_id"]: g for g in geofences if g.get("person_id")}

    assignments = query_all("SELECT * FROM geofence_assignments WHERE active = 1")
    asgn_by_user = {a["user_id"]: a["geofence_id"] for a in assignments}

    result = []
    for p in persons:
        pid = p["person_id"]
        loc = loc_by_user.get(pid)
        
        # Link geofence: direct match or via assignment
        geo = geo_by_person.get(pid)
        if not geo and pid in asgn_by_user:
            geo_id = asgn_by_user[pid]
            geo = query_one("SELECT * FROM geofences WHERE id = ?", (geo_id,))
            if geo:
                geo = dict(geo)

        is_inside = bool(loc.get("is_inside_geofence", 0)) if loc else False
        geofence_status = "INSIDE" if is_inside else ("OUTSIDE" if loc else "UNKNOWN")

        # Latest attendance
        att = query_one("SELECT * FROM attendance WHERE (user_id = ? OR person_id = ?) ORDER BY created_at DESC", (pid, pid))
        att_status = att["status"] if att else ("PRESENT" if is_inside else "OUTSIDE")

        # Latest verification
        vlog = query_one("SELECT * FROM verification_logs WHERE person_id = ? ORDER BY timestamp DESC", (pid,))

        curr_loc = None
        if loc:
            curr_loc = {
                "latitude": loc["latitude"],
                "longitude": loc["longitude"],
                "accuracy": loc.get("accuracy", 5.0),
                "speed": loc.get("speed", 0.0),
                "heading": loc.get("heading", 0.0),
                "last_updated": loc.get("updated_at") or loc.get("timestamp")
            }

        result.append({
            **p,
            "id": pid,
            "officer_id": pid,
            "geofence": dict(geo) if geo else None,
            "geofence_status": geofence_status,
            "attendance_status": att_status,
            "current_location": curr_loc,
            "has_face_enrolled": bool(p.get("face_embedding")),
            "has_voice_enrolled": bool(p.get("voice_embedding")),
            "face_status": vlog["face_result"] if vlog else ("MATCH" if is_inside else "PENDING"),
            "voice_status": vlog["voice_result"] if vlog else ("NOT_ENABLED" if not p.get("voice_embedding") else "PENDING"),
            "verification_status": vlog["final_result"] if vlog else ("VERIFIED" if is_inside else "PENDING")
        })

    return result

@router.get("/{person_id}")
def get_person_details(person_id: str):
    """Returns detailed single person record with assigned geofence and history."""
    clean_id = person_id.strip()
    person = query_one("SELECT * FROM persons WHERE person_id = ? OR employee_id = ?", (clean_id, clean_id))
    if not person:
        # Fallback to users/profiles
        user = query_one("SELECT * FROM users WHERE user_id = ? OR id = ?", (clean_id, clean_id))
        if not user:
            raise HTTPException(status_code=404, detail=f"Person ID '{clean_id}' not found.")
        person = {
            "person_id": user["user_id"],
            "full_name": user["full_name"],
            "employee_id": user["user_id"],
            "mobile": user.get("phone", ""),
            "email": user.get("email", ""),
            "role": user.get("role", "OFFICER"),
            "organization": user.get("department", "Field Operations"),
            "assigned_area": "Field Operations Base",
            "profile_photo_url": "",
            "face_embedding": "",
            "voice_embedding": "",
            "status": "ACTIVE",
            "created_at": user.get("created_at", ""),
            "updated_at": user.get("updated_at", "")
        }

    pid = person["person_id"]
    geo = query_one("SELECT * FROM geofences WHERE person_id = ? AND is_active = 1", (pid,))
    if not geo:
        asgn = query_one("SELECT geofence_id FROM geofence_assignments WHERE user_id = ? AND active = 1", (pid,))
        if asgn:
            geo = query_one("SELECT * FROM geofences WHERE id = ?", (asgn["geofence_id"],))

    g_dict = None
    if geo:
        g_dict = dict(geo)
        g_dict["geofence_id"] = g_dict.get("id")
        g_dict["latitude"] = g_dict.get("center_latitude")
        g_dict["longitude"] = g_dict.get("center_longitude")
        g_dict["radius"] = g_dict.get("radius_meters")

    loc = query_one("SELECT * FROM locations WHERE user_id = ?", (pid,))
    att_history = query_all("SELECT * FROM attendance WHERE user_id = ? OR person_id = ? ORDER BY created_at DESC LIMIT 20", (pid, pid))
    vlogs = query_all("SELECT * FROM verification_logs WHERE person_id = ? ORDER BY timestamp DESC LIMIT 20", (pid,))

    res = dict(person)
    res["person"] = dict(person)
    res["geofence"] = g_dict
    res["current_location"] = dict(loc) if loc else None
    res["attendance_history"] = att_history
    res["verification_logs"] = vlogs
    return res

@router.delete("/{person_id}")
async def delete_person(person_id: str):
    """
    Deletes an enrolled person from the system along with their linked geofences,
    biometrics, mobile credentials, and attendance mappings.
    Broadcasts real-time PERSON_DELETED event.
    """
    clean_id = person_id.strip()
    now_str = datetime.utcnow().isoformat() + "Z"

    # Check existence in persons or users/profiles
    person = query_one(
        "SELECT * FROM persons WHERE person_id = ? OR employee_id = ?",
        (clean_id, clean_id)
    )
    user = query_one(
        "SELECT * FROM users WHERE user_id = ? OR id = ?",
        (clean_id, clean_id)
    )
    profile = query_one(
        "SELECT * FROM profiles WHERE officer_id = ? OR id = ?",
        (clean_id, clean_id)
    )

    if not person and not user and not profile:
        raise HTTPException(status_code=404, detail=f"Person '{clean_id}' not found.")

    resolved_pid = (person.get("person_id") if person else None) or (user.get("user_id") if user else None) or (profile.get("officer_id") if profile else None) or clean_id
    full_name = (person.get("full_name") if person else None) or (user.get("full_name") if user else None) or (profile.get("full_name") if profile else None) or clean_id

    # 1. Clean up from persons table
    execute_commit("DELETE FROM persons WHERE person_id = ? OR employee_id = ?", (resolved_pid, resolved_pid))
    if clean_id != resolved_pid:
        execute_commit("DELETE FROM persons WHERE person_id = ? OR employee_id = ?", (clean_id, clean_id))

    # 2. Clean up from legacy users and profiles
    execute_commit("DELETE FROM users WHERE user_id = ? OR id = ?", (resolved_pid, resolved_pid))
    execute_commit("DELETE FROM profiles WHERE officer_id = ? OR id = ?", (resolved_pid, resolved_pid))
    if clean_id != resolved_pid:
        execute_commit("DELETE FROM users WHERE user_id = ? OR id = ?", (clean_id, clean_id))
        execute_commit("DELETE FROM profiles WHERE officer_id = ? OR id = ?", (clean_id, clean_id))

    # 3. Clean up linked geofences and assignments
    execute_commit("DELETE FROM geofence_assignments WHERE user_id = ? OR officer_id = ?", (resolved_pid, resolved_pid))
    execute_commit("DELETE FROM geofences WHERE person_id = ? OR id = ?", (resolved_pid, f"geo-{resolved_pid.lower()}"))
    if clean_id != resolved_pid:
        execute_commit("DELETE FROM geofence_assignments WHERE user_id = ? OR officer_id = ?", (clean_id, clean_id))
        execute_commit("DELETE FROM geofences WHERE person_id = ? OR id = ?", (clean_id, f"geo-{clean_id.lower()}"))

    # 4. Clean up locations, attendance, and verification logs
    execute_commit("DELETE FROM locations WHERE user_id = ?", (resolved_pid,))
    execute_commit("DELETE FROM attendance WHERE user_id = ? OR person_id = ?", (resolved_pid, resolved_pid))
    execute_commit("DELETE FROM verification_logs WHERE person_id = ?", (resolved_pid,))
    execute_commit("DELETE FROM verification_results WHERE user_id = ? OR officer_id = ?", (resolved_pid, resolved_pid))
    if clean_id != resolved_pid:
        execute_commit("DELETE FROM locations WHERE user_id = ?", (clean_id,))
        execute_commit("DELETE FROM attendance WHERE user_id = ? OR person_id = ?", (clean_id, clean_id))
        execute_commit("DELETE FROM verification_logs WHERE person_id = ?", (clean_id,))
        execute_commit("DELETE FROM verification_results WHERE user_id = ? OR officer_id = ?", (clean_id, clean_id))

    # 5. Audit Log
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'SYS-ADMIN', 'Command Officer', 'PERSON_DELETED', ?, 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-del-{uuid.uuid4().hex[:8]}", resolved_pid, f"Deleted person {full_name} ({resolved_pid}) and cleared linked geofences & biometrics", now_str)
    )

    # 6. Supabase Cloud Sync (best effort)
    try:
        from ..services.supabase_service import get_supabase_client
        client = get_supabase_client()
        if client:
            client.table("persons").delete().eq("person_id", resolved_pid).execute()
            client.table("profiles").delete().eq("officer_id", resolved_pid).execute()
            client.table("users").delete().eq("user_id", resolved_pid).execute()
            client.table("geofences").delete().eq("person_id", resolved_pid).execute()
            client.table("geofence_assignments").delete().eq("user_id", resolved_pid).execute()
    except Exception as e:
        print(f"[Supabase Delete Sync Notice]: {e}")

    # 7. Broadcast WebSocket Event
    await manager.broadcast({
        "type": "PERSON_DELETED",
        "event": "PERSON_DELETED",
        "data": {
            "person_id": resolved_pid,
            "full_name": full_name,
            "timestamp": now_str
        }
    })

    return {
        "success": True,
        "message": f"Person '{full_name}' ({resolved_pid}) and linked geofence records deleted successfully.",
        "person_id": resolved_pid
    }
