import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query
from ..models.schemas import GeofenceCreateRequest, GeofenceUpdateRequest, GeofenceCheckRequest
from ..database import query_all, query_one, execute_commit
from ..websocket.connection_manager import manager
from ..services.geofence_service import (
    check_geofence,
    check_polygon_geofence,
    check_multiple_geofences
)

router = APIRouter(prefix="", tags=["Geofence Containment Management"])

@router.get("/api/geofences")
def get_geofences():
    """Returns all configured operational geofences with linked enrolled person info."""
    geos = query_all("""
        SELECT 
            g.*,
            COALESCE(g.area_name, g.name) as area_name,
            COALESCE(g.latitude, g.center_latitude) as latitude,
            COALESCE(g.longitude, g.center_longitude) as longitude,
            COALESCE(g.radius, g.radius_meters) as radius,
            COALESCE(g.center_latitude, g.latitude) as center_latitude,
            COALESCE(g.center_longitude, g.longitude) as center_longitude,
            COALESCE(g.radius_meters, g.radius) as radius_meters,
            p.full_name as person_name,
            p.employee_id as employee_id,
            p.role as person_role,
            p.organization as person_org
        FROM geofences g
        LEFT JOIN persons p ON g.person_id = p.person_id OR g.person_id = p.employee_id
        ORDER BY g.created_at DESC
    """)
    return geos

def _resolve_geofence(target_id: Optional[str] = None):
    """Internal helper to resolve assigned geofence for any target identifier."""
    target = (target_id or "").strip()
    if not target:
        first_geo = query_one("SELECT * FROM geofences WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1")
        if first_geo:
            return dict(first_geo)
        return {
            "id": "geo-default",
            "name": "Command Center Operational Zone",
            "area_name": "Command Center Operational Zone",
            "latitude": 11.016844,
            "longitude": 76.955832,
            "center_latitude": 11.016844,
            "center_longitude": 76.955832,
            "radius": 150.0,
            "radius_meters": 150.0,
            "department": "Field Operations",
            "is_active": 1,
            "status": "ACTIVE"
        }

    # 1. Resolve all linked identifiers for this person (email, employee_id, officer_id, id)
    candidate_ids = [target, target.lower(), target.upper()]
    user_lookup = query_one(
        "SELECT id, officer_id, email, full_name FROM profiles WHERE LOWER(email) = ? OR LOWER(officer_id) = ? OR LOWER(id) = ?",
        (target.lower(), target.lower(), target.lower())
    )
    if not user_lookup:
        user_lookup = query_one(
            "SELECT person_id as id, person_id as officer_id, employee_id, email, full_name FROM persons WHERE LOWER(email) = ? OR LOWER(person_id) = ? OR LOWER(employee_id) = ?",
            (target.lower(), target.lower(), target.lower())
        )
    if not user_lookup:
        user_lookup = query_one(
            "SELECT user_id as officer_id, id, email, full_name FROM users WHERE LOWER(email) = ? OR LOWER(user_id) = ? OR LOWER(id) = ?",
            (target.lower(), target.lower(), target.lower())
        )

    if user_lookup:
        for k in ["officer_id", "employee_id", "id", "email"]:
            val = user_lookup.get(k)
            if val:
                s_val = str(val).strip()
                if s_val not in candidate_ids:
                    candidate_ids.append(s_val)
                if s_val.lower() not in candidate_ids:
                    candidate_ids.append(s_val.lower())
                if s_val.upper() not in candidate_ids:
                    candidate_ids.append(s_val.upper())

    # 2. Check direct geofence match by person_id in candidate_ids
    placeholders = ",".join(["?"] * len(candidate_ids))
    geo = query_one(
        f"SELECT * FROM geofences WHERE person_id IN ({placeholders}) AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
        tuple(candidate_ids)
    )

    # 3. Check active assignment in geofence_assignments table
    if not geo:
        asgn = query_one(
            f"""SELECT * FROM geofence_assignments 
               WHERE (user_id IN ({placeholders}) OR officer_id IN ({placeholders})) AND active = 1 
               ORDER BY assigned_at DESC LIMIT 1""",
            tuple(candidate_ids + candidate_ids)
        )
        if asgn:
            if asgn.get("geofence_id"):
                geo = query_one("SELECT * FROM geofences WHERE id = ?", (asgn["geofence_id"],))
            if not geo and asgn.get("latitude") and asgn.get("longitude"):
                geo = {
                    "id": asgn.get("geofence_id") or f"geo-{asgn['id']}",
                    "name": asgn.get("target_location") or asgn.get("title") or "Assigned Facility",
                    "area_name": asgn.get("target_location") or asgn.get("title") or "Assigned Facility",
                    "latitude": asgn["latitude"],
                    "longitude": asgn["longitude"],
                    "center_latitude": asgn["latitude"],
                    "center_longitude": asgn["longitude"],
                    "radius": asgn.get("radius_meters", 100.0),
                    "radius_meters": asgn.get("radius_meters", 100.0),
                    "department": "Field Operations",
                    "is_active": 1,
                    "status": "ACTIVE"
                }

    # 4. Check enrolled_attendance_users table
    if not geo:
        att_u = query_one(
            f"SELECT * FROM enrolled_attendance_users WHERE user_id IN ({placeholders}) LIMIT 1",
            tuple(candidate_ids)
        )
        if att_u and att_u.get("geofence_center_lat") and att_u.get("geofence_center_lng"):
            geo = {
                "id": att_u.get("geofence_id") or f"geo-{target.lower()}",
                "name": att_u.get("authorized_location") or "Assigned Duty Perimeter",
                "area_name": att_u.get("authorized_location") or "Assigned Duty Perimeter",
                "latitude": att_u["geofence_center_lat"],
                "longitude": att_u["geofence_center_lng"],
                "center_latitude": att_u["geofence_center_lat"],
                "center_longitude": att_u["geofence_center_lng"],
                "radius": att_u.get("geofence_radius", 150.0),
                "radius_meters": att_u.get("geofence_radius", 150.0),
                "department": "Field Operations",
                "is_active": 1,
                "status": "ACTIVE"
            }

    # 5. Fallback to any active operational geofence
    if not geo:
        first_geo = query_one("SELECT * FROM geofences WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1")
        if first_geo:
            geo = dict(first_geo)

    if not geo:
        geo = {
            "id": f"geo-{target.lower()}",
            "name": "Coimbatore Field Facility",
            "area_name": "Coimbatore Field Facility",
            "latitude": 11.016844,
            "longitude": 76.955832,
            "center_latitude": 11.016844,
            "center_longitude": 76.955832,
            "radius": 150.0,
            "radius_meters": 150.0,
            "department": "Field Operations",
            "is_active": 1,
            "status": "ACTIVE"
        }

    res = dict(geo)
    res["center_latitude"] = res.get("center_latitude") if res.get("center_latitude") is not None else res.get("latitude", 11.0168)
    res["center_longitude"] = res.get("center_longitude") if res.get("center_longitude") is not None else res.get("longitude", 76.9558)
    res["radius_meters"] = res.get("radius_meters") if res.get("radius_meters") is not None else res.get("radius", 150.0)
    res["latitude"] = res["center_latitude"]
    res["longitude"] = res["center_longitude"]
    res["radius"] = res["radius_meters"]
    res["area_name"] = res.get("area_name") or res.get("name") or "Assigned Operational Zone"
    return res

@router.get("/api/geofences/my")
@router.get("/api/user/geofence")
def get_my_geofence(
    person_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    email: Optional[str] = Query(None)
):
    return _resolve_geofence(person_id or user_id or email)

@router.get("/api/geofences/assigned/{person_id}")
@router.get("/api/geofences/person/{person_id}")
@router.get("/api/geofences/officer/{person_id}")
def get_geofence_for_person(person_id: str):
    """Returns the specific active geofence perimeter assigned to an enrolled person or officer."""
    return _resolve_geofence(person_id)

@router.get("/api/geofences/{geofence_id}")
def get_geofence_by_id(geofence_id: str):
    geo = query_one("SELECT * FROM geofences WHERE id = ?", (geofence_id,))
    if not geo:
        raise HTTPException(status_code=404, detail="Geofence not found.")
    return dict(geo)

@router.post("/api/geofences")
async def create_geofence(req: GeofenceCreateRequest):
    """
    Creates a new circular geofence perimeter and optionally links it to an ENROLLED PERSON.
    If person_id is omitted or unassigned, it is saved as an operational perimeter available for monitoring.
    """
    now_str = datetime.utcnow().isoformat() + "Z"
    
    p_id = None
    p_name = None

    if req.person_id and req.person_id.strip():
        person_id = req.person_id.strip()
        person = query_one("SELECT * FROM persons WHERE person_id = ? OR employee_id = ?", (person_id, person_id))
        if not person:
            person = query_one("SELECT * FROM profiles WHERE officer_id = ? OR id = ?", (person_id, person_id))
            if not person:
                person = query_one("SELECT * FROM users WHERE user_id = ? OR id = ?", (person_id, person_id))

        if person:
            p_id = person.get("person_id") or person.get("officer_id") or person.get("user_id") or person_id
            p_name = person.get("full_name") or "Enrolled Person"

    if p_id:
        geo_id = f"geo-{p_id.lower()}"
    else:
        geo_id = f"geo-{uuid.uuid4().hex[:8]}"

    area_name = req.area_name or req.name.strip() or (f"{p_name}'s Working Area" if p_name else "Operational Perimeter")
    dept = req.department.strip() if req.department else "Command Operations"
    desc = req.description or (f"Assigned perimeter for {p_name} ({p_id})" if p_name else f"Operational boundary for {area_name}")
    lat = float(req.center_latitude)
    lng = float(req.center_longitude)
    radius = float(req.radius_meters)

    # Upsert geofence
    execute_commit(
        """INSERT INTO geofences 
           (id, person_id, name, area_name, department, description, center_latitude, center_longitude, radius_meters, latitude, longitude, radius, is_active, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE', ?)
           ON CONFLICT(id) DO UPDATE SET
               person_id = excluded.person_id,
               name = excluded.name,
               area_name = excluded.area_name,
               department = excluded.department,
               description = excluded.description,
               center_latitude = excluded.center_latitude,
               center_longitude = excluded.center_longitude,
               radius_meters = excluded.radius_meters,
               latitude = excluded.latitude,
               longitude = excluded.longitude,
               radius = excluded.radius,
               is_active = 1,
               status = 'ACTIVE'""",
        (geo_id, p_id, area_name, area_name, dept, desc, lat, lng, radius, lat, lng, radius, now_str)
    )

    if p_id:
        # Upsert assignment linking person_id -> geofence_id
        asgn_id = f"asgn-{p_id.lower()}"
        execute_commit(
            """INSERT INTO geofence_assignments (id, user_id, officer_id, geofence_id, assignment_name, assigned_by, assigned_at, active, status, created_at)
               VALUES (?, ?, ?, ?, ?, 'Command Officer', ?, 1, 'ACTIVE', ?)
               ON CONFLICT(id) DO UPDATE SET
                   geofence_id = excluded.geofence_id,
                   active = 1,
                   status = 'ACTIVE',
                   assigned_at = excluded.assigned_at""",
            (asgn_id, p_id, p_id, geo_id, area_name, now_str, now_str)
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
            (p_id, p_name, area_name, geo_id, lat, lng, radius, now_str, now_str)
        )

    # Cloud write to Supabase
    try:
        from ..services.supabase_service import execute_supabase_upsert
        execute_supabase_upsert("geofences", {
            "id": geo_id,
            "person_id": p_id,
            "name": area_name,
            "area_name": area_name,
            "department": dept,
            "center_latitude": lat,
            "center_longitude": lng,
            "radius_meters": radius,
            "is_active": True,
            "status": "ACTIVE",
            "created_at": now_str
        })
        if p_id:
            execute_supabase_upsert("geofence_assignments", {
                "id": f"asgn-{p_id.lower()}",
                "officer_id": p_id,
                "user_id": p_id,
                "geofence_id": geo_id,
                "assignment_name": area_name,
                "status": "ACTIVE",
                "active": True,
                "start_time": now_str
            })
    except Exception as e:
        print(f"[Supabase Geofence Save Notice]: {e}")

    created = query_one("""
        SELECT 
            g.*,
            COALESCE(g.area_name, g.name) as area_name,
            COALESCE(g.latitude, g.center_latitude) as latitude,
            COALESCE(g.longitude, g.center_longitude) as longitude,
            COALESCE(g.radius, g.radius_meters) as radius,
            COALESCE(g.center_latitude, g.latitude) as center_latitude,
            COALESCE(g.center_longitude, g.longitude) as center_longitude,
            COALESCE(g.radius_meters, g.radius) as radius_meters
        FROM geofences g WHERE id = ?
    """, (geo_id,))
    
    created_dict = dict(created) if created else {}
    await manager.broadcast({
        "type": "GEOFENCE_CREATED",
        "event": "GEOFENCE_CREATED",
        "data": created_dict
    })

    return {"success": True, "geofence": created_dict}

@router.put("/api/geofences/{geofence_id}")
@router.patch("/api/geofences/{geofence_id}")
async def update_geofence(geofence_id: str, req: GeofenceUpdateRequest):
    """Updates an existing geofence perimeter."""
    existing = query_one("SELECT * FROM geofences WHERE id = ?", (geofence_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Geofence not found.")

    name = req.name if req.name is not None else existing["name"]
    person_id = req.person_id if req.person_id is not None else existing.get("person_id")
    area_name = req.area_name if req.area_name is not None else existing.get("area_name", name)
    dept = req.department if req.department is not None else existing["department"]
    desc = req.description if req.description is not None else existing["description"]
    lat = req.center_latitude if req.center_latitude is not None else existing["center_latitude"]
    lng = req.center_longitude if req.center_longitude is not None else existing["center_longitude"]
    radius = req.radius_meters if req.radius_meters is not None else existing["radius_meters"]
    is_active = 1 if (req.is_active if req.is_active is not None else existing["is_active"]) else 0
    status = req.status if req.status is not None else ("ACTIVE" if is_active else "INACTIVE")

    execute_commit(
        """UPDATE geofences SET
           name = ?, person_id = ?, area_name = ?, department = ?, description = ?,
           center_latitude = ?, center_longitude = ?, radius_meters = ?,
           latitude = ?, longitude = ?, radius = ?, is_active = ?, status = ?
           WHERE id = ?""",
        (name, person_id, area_name, dept, desc, lat, lng, radius, lat, lng, radius, is_active, status, geofence_id)
    )

    updated = query_one("SELECT * FROM geofences WHERE id = ?", (geofence_id,))
    
    await manager.broadcast({
        "type": "GEOFENCE_UPDATED",
        "event": "GEOFENCE_UPDATED",
        "data": dict(updated)
    })

    return {"success": True, "geofence": dict(updated)}

@router.delete("/api/geofences/{geofence_id}")
async def delete_geofence(geofence_id: str):
    """Deletes a geofence and notifies consoles over WebSocket."""
    execute_commit("DELETE FROM geofences WHERE id = ?", (geofence_id,))
    execute_commit("DELETE FROM geofence_assignments WHERE geofence_id = ?", (geofence_id,))
    await manager.broadcast({
        "type": "GEOFENCE_DELETED",
        "event": "GEOFENCE_DELETED",
        "data": {"id": geofence_id}
    })
    return {"success": True, "message": f"Geofence {geofence_id} deleted."}

# Both /api/geofences/check and /api/geofence/check endpoints
@router.post("/api/geofences/check")
@router.post("/api/geofence/check")
async def check_geofence_endpoint(req: GeofenceCheckRequest):
    """
    Evaluates whether a point is inside a geofence.
    Supports either arbitrary polygon coords or circular perimeter checking with Haversine formula.
    """
    if req.polygon_coords:
        poly_check = check_polygon_geofence(req.latitude, req.longitude, req.polygon_coords)
        return {
            "mode": "POLYGON",
            "is_inside": poly_check["is_inside"],
            "status": poly_check["status"],
            "vertex_count": poly_check.get("vertex_count", 0),
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

    if req.geofence_id:
        geo = query_one("SELECT * FROM geofences WHERE id = ?", (req.geofence_id,))
        if not geo:
            raise HTTPException(status_code=404, detail="Specified geofence not found.")
        check = check_geofence(
            req.latitude, req.longitude,
            geo["center_latitude"], geo["center_longitude"],
            geo["radius_meters"],
            req.buffer_meters or 0.0
        )
        return {
            "mode": "CIRCULAR_SINGLE",
            "geofence_id": geo["id"],
            "geofence_name": geo["name"],
            "radius_meters": geo["radius_meters"],
            "timestamp": datetime.utcnow().isoformat() + "Z",
            **check
        }

    # If no geofence_id is specified, evaluate against all active geofences
    geofences = query_all("SELECT * FROM geofences WHERE is_active = 1")
    multi_check = check_multiple_geofences(req.latitude, req.longitude, geofences, req.buffer_meters or 0.0)

    return {
        "mode": "CIRCULAR_MULTI",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        **multi_check
    }
