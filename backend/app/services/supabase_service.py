import os
import logging
from typing import Dict, Any, List, Optional
from ..config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_MODE

logger = logging.getLogger("supabase_service")

_supabase_client = None

def get_supabase_client():
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    
    key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
    if SUPABASE_URL and key:
        try:
            from supabase import create_client
            _supabase_client = create_client(SUPABASE_URL, key)
            logger.info("Supabase PostgreSQL client initialized for FastAPI Backend.")
        except Exception as e:
            logger.error(f"Could not initialize Supabase client: {e}")
            _supabase_client = None
    return _supabase_client

def execute_supabase_upsert(table: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Directly upserts a record to Supabase PostgreSQL cloud table.
    """
    client = get_supabase_client()
    if not client:
        logger.warning(f"Supabase client unavailable for upsert to '{table}'.")
        return data

    try:
        res = client.table(table).upsert(data).execute()
        return res.data[0] if res.data else data
    except Exception as e:
        logger.error(f"Supabase upsert failure on table '{table}': {e}")
        return data

def execute_supabase_select(table: str, query_filter: Optional[Dict[str, Any]] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Directly queries records from Supabase PostgreSQL cloud table.
    """
    client = get_supabase_client()
    if not client:
        return []
    try:
        query = client.table(table).select("*")
        if query_filter:
            for k, v in query_filter.items():
                query = query.eq(k, v)
        if limit:
            query = query.limit(limit)
        res = query.execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Supabase query failure on table '{table}': {e}")
        return []

def execute_supabase_delete(table: str, match: Dict[str, Any]) -> bool:
    """
    Deletes records matching criteria from Supabase table.
    """
    client = get_supabase_client()
    if not client:
        return False
    try:
        query = client.table(table).delete()
        for k, v in match.items():
            query = query.eq(k, v)
        query.execute()
        return True
    except Exception as e:
        logger.error(f"Supabase delete failure on table '{table}': {e}")
        return False

def sync_supabase_to_sqlite():
    """
    Synchronizes authoritative Supabase tables into local SQLite cache on startup.
    This guarantees SQLite has the exact real profiles and geofences for local relational joins.
    """
    from ..database import execute_commit, query_one
    if DATABASE_MODE == "local":
        logger.info("DATABASE_MODE is set to 'local'. Skipping Supabase remote sync.")
        return

    client = get_supabase_client()
    if not client:
        logger.warning("Skipping Supabase-to-SQLite sync: Supabase client unconfigured.")
        return

    logger.info("Beginning authoritative sync from Supabase PostgreSQL to local SQLite mirror...")

    # 0. Sync Enrolled Persons
    try:
        persons = client.table("persons").select("*").execute().data or []
        for per in persons:
            p_id = per.get("person_id")
            emp_id = per.get("employee_id") or p_id
            f_name = per.get("full_name", "Enrolled Person")
            mob = per.get("mobile", "")
            em = per.get("email", "")
            rl = per.get("role", "OFFICER")
            org = per.get("organization", "Department of Social Justice and Empowerment")
            area = per.get("assigned_area", "Field Operations")
            photo = per.get("profile_photo_url", "")
            f_emb = per.get("face_embedding", "")
            v_emb = per.get("voice_embedding", "")
            st = per.get("status", "ACTIVE")
            c_at = per.get("created_at", "")
            u_at = per.get("updated_at", "")

            execute_commit(
                """INSERT INTO persons (person_id, full_name, employee_id, mobile, email, role, organization, assigned_area, profile_photo_url, face_embedding, voice_embedding, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(person_id) DO UPDATE SET
                       full_name=excluded.full_name,
                       employee_id=excluded.employee_id,
                       mobile=excluded.mobile,
                       email=excluded.email,
                       role=excluded.role,
                       organization=excluded.organization,
                       assigned_area=excluded.assigned_area,
                       profile_photo_url=excluded.profile_photo_url,
                       face_embedding=excluded.face_embedding,
                       voice_embedding=excluded.voice_embedding,
                       status=excluded.status,
                       updated_at=excluded.updated_at""",
                (p_id, f_name, emp_id, mob, em, rl, org, area, photo, f_emb, v_emb, st, c_at, u_at)
            )

            # Mirror to users and profiles for seamless backward compatibility
            execute_commit(
                """INSERT INTO users (id, user_id, full_name, email, phone, department, designation, role, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET
                       full_name=excluded.full_name,
                       email=excluded.email,
                       department=excluded.department,
                       designation=excluded.designation,
                       role=excluded.role""",
                (p_id, p_id, f_name, em or f"{p_id.lower()}@field.gov.in", mob, org, area, rl, c_at, u_at)
            )
            execute_commit(
                """INSERT INTO profiles (id, officer_id, full_name, email, phone, department, designation, role, status, is_active, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                       officer_id=excluded.officer_id,
                       full_name=excluded.full_name,
                       email=excluded.email,
                       department=excluded.department,
                       designation=excluded.designation,
                       role=excluded.role""",
                (p_id, p_id, f_name, em or f"{p_id.lower()}@field.gov.in", mob, org, area, rl, c_at, u_at)
            )
        if persons:
            logger.info(f"Authoritative sync: {len(persons)} persons synced from Supabase.")
    except Exception as e:
        logger.debug(f"Persons table not present or sync notice: {e}")

    # 1. Sync Profiles
    try:
        profiles = client.table("profiles").select("*").execute().data or []
        for p in profiles:
            p_id = p.get("id")
            off_id = p.get("officer_id") or p_id
            name = p.get("full_name", "Officer")
            email = p.get("email", "")
            phone = p.get("phone", "")
            dept = p.get("department", "Field Operations")
            desig = p.get("designation", "Field Officer")
            role = p.get("role", "OFFICER")
            created_at = p.get("created_at", "")
            updated_at = p.get("updated_at", "")

            try:
                # Mirror to profiles
                execute_commit(
                    """INSERT INTO profiles (id, officer_id, full_name, email, phone, department, designation, role, status, is_active, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)
                       ON CONFLICT(id) DO UPDATE SET 
                           officer_id=excluded.officer_id,
                           full_name=excluded.full_name,
                           email=excluded.email,
                           department=excluded.department,
                           designation=excluded.designation,
                           role=excluded.role""",
                    (p_id, off_id, name, email, phone, dept, desig, role, created_at, updated_at)
                )

                # Mirror to users
                execute_commit(
                    """INSERT INTO users (id, user_id, full_name, email, phone, department, designation, role, status, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online', ?, ?)
                       ON CONFLICT(user_id) DO UPDATE SET
                           full_name=excluded.full_name,
                           email=excluded.email,
                           department=excluded.department,
                           designation=excluded.designation,
                           role=excluded.role""",
                    (p_id, off_id, name, email, phone, dept, desig, role, created_at, updated_at)
                )
            except Exception as pe:
                logger.debug(f"Profile skip {p_id}: {pe}")
        logger.info(f"Authoritative sync: {len(profiles)} profiles synced from Supabase.")
    except Exception as e:
        logger.error(f"Error syncing profiles from Supabase: {e}")

    # 2. Sync Geofences
    try:
        geofences = client.table("geofences").select("*").execute().data or []
        for g in geofences:
            g_id = g.get("id")
            p_id = g.get("person_id")
            name = g.get("name", "Geofence")
            area_name = g.get("area_name") or name
            dept = g.get("department", "Command Center")
            desc = g.get("description", "")
            lat = float(g.get("center_latitude", 0.0))
            lng = float(g.get("center_longitude", 0.0))
            radius = float(g.get("radius_meters", 200.0))
            active = 1 if g.get("is_active", True) else 0
            st_time = g.get("start_time")
            end_time = g.get("end_time")
            created_at = g.get("created_at", "")

            execute_commit(
                """INSERT INTO geofences (id, person_id, name, area_name, department, description, center_latitude, center_longitude, radius_meters, is_active, start_time, end_time, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
                   ON CONFLICT(id) DO UPDATE SET
                       person_id=COALESCE(excluded.person_id, geofences.person_id),
                       name=excluded.name,
                       area_name=excluded.area_name,
                       department=excluded.department,
                       description=excluded.description,
                       center_latitude=excluded.center_latitude,
                       center_longitude=excluded.center_longitude,
                       radius_meters=excluded.radius_meters,
                       is_active=excluded.is_active,
                       start_time=excluded.start_time,
                       end_time=excluded.end_time""",
                (g_id, p_id, name, area_name, dept, desc, lat, lng, radius, active, st_time, end_time, created_at)
            )
        logger.info(f"Authoritative sync: {len(geofences)} geofences synced from Supabase.")
    except Exception as e:
        logger.error(f"Error syncing geofences from Supabase: {e}")

    # 3. Sync Geofence Assignments
    try:
        assignments = client.table("geofence_assignments").select("*").execute().data or []
        for a in assignments:
            a_id = a.get("id")
            u_id = a.get("user_id") or a.get("officer_id")
            g_id = a.get("geofence_id")
            by = a.get("assigned_by", "Command Officer")
            at = a.get("start_time") or a.get("created_at", "")
            active = 1 if a.get("active", True) else 0

            execute_commit(
                """INSERT INTO geofence_assignments (id, user_id, geofence_id, assigned_by, assigned_at, active)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                       user_id=excluded.user_id,
                       geofence_id=excluded.geofence_id,
                       assigned_by=excluded.assigned_by,
                       assigned_at=excluded.assigned_at,
                       active=excluded.active""",
                (a_id, u_id, g_id, by, at, active)
            )
        logger.info(f"Authoritative sync: {len(assignments)} assignments synced from Supabase.")
    except Exception as e:
        logger.error(f"Error syncing assignments from Supabase: {e}")
