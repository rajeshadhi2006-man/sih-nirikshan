import sqlite3
import os
import threading
from typing import List, Dict, Any, Optional
from .config import DATABASE_PATH

DB_PATH = DATABASE_PATH
_db_lock = threading.Lock()

def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=60.0, check_same_thread=False)
    conn.execute("PRAGMA busy_timeout=60000;")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with _db_lock:
        conn = get_connection()
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
        except Exception:
            pass
        cursor = conn.cursor()

    cursor.executescript("""
    -- 0. Unified Persons Enrollment (Master Enrolled Person Table)
    CREATE TABLE IF NOT EXISTS persons (
        person_id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        employee_id TEXT UNIQUE NOT NULL,
        mobile TEXT,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'OFFICER',
        organization TEXT NOT NULL DEFAULT 'Department of Social Justice and Empowerment',
        assigned_area TEXT,
        profile_photo_url TEXT,
        face_embedding TEXT,
        voice_embedding TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    -- 1. Standard Government Users & Field Officers
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE,
        phone TEXT,
        department TEXT NOT NULL DEFAULT 'Field Operations',
        designation TEXT DEFAULT 'Field Personnel',
        role TEXT NOT NULL DEFAULT 'OFFICER', -- ADMIN | OFFICER | SUPERVISOR
        status TEXT NOT NULL DEFAULT 'offline', -- online | offline | active
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        officer_id TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        department TEXT NOT NULL,
        designation TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'OFFICER',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    -- 2. Government Officers (Command Credentials & Key Hierarchy)
    CREATE TABLE IF NOT EXISTS government_officers (
        id TEXT PRIMARY KEY,
        officer_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        badge_number TEXT,
        rank TEXT,
        department TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'OFFICER',
        is_super_admin INTEGER DEFAULT 0,
        phone TEXT,
        email TEXT,
        created_at TEXT NOT NULL
    );

    -- 3. Live Geolocation Telemetry
    CREATE TABLE IF NOT EXISTS locations (
        user_id TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL DEFAULT 5.0,
        speed REAL DEFAULT 0.0,
        heading REAL DEFAULT 0.0,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'online',
        is_inside_geofence INTEGER DEFAULT 1,
        geofence_id TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(user_id)
    );

    -- 4. Location History & Breadcrumb Trails
    CREATE TABLE IF NOT EXISTS location_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL DEFAULT 5.0,
        speed REAL DEFAULT 0.0,
        heading REAL DEFAULT 0.0,
        timestamp TEXT NOT NULL,
        is_inside_geofence INTEGER DEFAULT 1,
        geofence_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(user_id)
    );

    -- 5. Geofences & Containment Perimeters
    CREATE TABLE IF NOT EXISTS geofences (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL DEFAULT 'Command Center',
        description TEXT,
        center_latitude REAL NOT NULL,
        center_longitude REAL NOT NULL,
        radius_meters REAL NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS geofence_assignments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        geofence_id TEXT NOT NULL,
        assigned_by TEXT DEFAULT 'Command Officer',
        assigned_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(user_id) REFERENCES users(user_id),
        FOREIGN KEY(geofence_id) REFERENCES geofences(id)
    );

    CREATE TABLE IF NOT EXISTS geofence_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        geofence_id TEXT,
        event_type TEXT NOT NULL, -- ENTRY | EXIT
        latitude REAL,
        longitude REAL,
        timestamp TEXT NOT NULL
    );

    -- 6. Muster Roll & Automatic Attendance
    CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        officer_id TEXT,
        date TEXT NOT NULL,
        check_in_time TEXT NOT NULL,
        check_out_time TEXT,
        entry_lat REAL,
        entry_lng REAL,
        exit_lat REAL,
        exit_lng REAL,
        status TEXT NOT NULL DEFAULT 'PRESENT', -- PRESENT | ABSENT | OUTSIDE | LEAVE
        geofence_verified INTEGER DEFAULT 1,
        face_verified INTEGER DEFAULT 1,
        voice_verified INTEGER DEFAULT 1,
        duration_seconds INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'ENTRY', -- ENTRY | EXIT | VERIFY
        latitude REAL,
        longitude REAL,
        gps_verified INTEGER DEFAULT 1,
        geofence_verified INTEGER DEFAULT 1,
        face_verified INTEGER DEFAULT 0,
        voice_verified INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PRESENT',
        timestamp TEXT NOT NULL,
        details TEXT
    );

    CREATE TABLE IF NOT EXISTS enrolled_attendance_users (
        user_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        authorized_location TEXT NOT NULL,
        geofence_id TEXT,
        geofence_center_lat REAL NOT NULL,
        geofence_center_lng REAL NOT NULL,
        geofence_radius REAL NOT NULL DEFAULT 200.0,
        enrollment_status TEXT NOT NULL DEFAULT 'ENROLLED',
        current_attendance_status TEXT NOT NULL DEFAULT 'OUTSIDE',
        last_gps_status TEXT DEFAULT 'ONLINE',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
        attendance_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        geofence_id TEXT,
        entry_time TEXT NOT NULL,
        entry_latitude REAL NOT NULL,
        entry_longitude REAL NOT NULL,
        entry_accuracy REAL NOT NULL,
        exit_time TEXT,
        exit_latitude REAL,
        exit_longitude REAL,
        exit_accuracy REAL,
        status TEXT NOT NULL DEFAULT 'PRESENT',
        duration_seconds INTEGER DEFAULT 0,
        duration_formatted TEXT DEFAULT '0m',
        date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    -- 7. Multi-Factor Biometric Verification Results
    CREATE TABLE IF NOT EXISTS verification_results (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        geofence_id TEXT,
        officer_id TEXT,
        face_result TEXT DEFAULT 'MODEL NOT CONNECTED',
        face_confidence REAL DEFAULT 0.0,
        voice_result TEXT DEFAULT 'MODEL NOT CONNECTED',
        voice_confidence REAL DEFAULT 0.0,
        gps_result TEXT DEFAULT 'VERIFIED',
        final_result TEXT NOT NULL DEFAULT 'PENDING', -- VERIFIED | SUSPICIOUS | FAILED | PENDING
        result TEXT NOT NULL DEFAULT 'PENDING',
        engine_mode TEXT DEFAULT 'PRODUCTION_AI',
        timestamp TEXT NOT NULL,
        metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS verification_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        verification_type TEXT NOT NULL,
        status TEXT NOT NULL,
        confidence_score REAL,
        details TEXT,
        verified_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verification_logs (
        verification_id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        geofence_id TEXT,
        gps_result TEXT NOT NULL, -- INSIDE | OUTSIDE | UNAVAILABLE
        face_result TEXT NOT NULL, -- MATCH | MISMATCH | NOT_CONFIGURED
        voice_result TEXT NOT NULL DEFAULT 'NOT_ENABLED', -- MATCH | MISMATCH | NOT_ENABLED
        final_result TEXT NOT NULL, -- VERIFIED | FAILED
        confidence_score REAL DEFAULT 0.0,
        timestamp TEXT NOT NULL,
        FOREIGN KEY(person_id) REFERENCES persons(person_id),
        FOREIGN KEY(geofence_id) REFERENCES geofences(id)
    );

    -- 8. Command Incidents & Alerts
    CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        officer_id TEXT NOT NULL,
        severity TEXT NOT NULL, -- LOW | MEDIUM | HIGH | CRITICAL
        alert_type TEXT NOT NULL, -- GEOFENCE_BREACH | VERIFICATION_FAILURE | FACE_MISMATCH | VOICE_MISMATCH | GPS_UNAVAILABLE | DEVICE_OFFLINE | SUSPICIOUS_MOVEMENT | REPEATED_FAILURE
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | RESOLVED | ACKNOWLEDGED
        created_at TEXT NOT NULL
    );

    -- 9. Mobile & IoT Hardware Devices
    CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        device_id TEXT UNIQUE NOT NULL,
        user_id TEXT,
        device_type TEXT NOT NULL, -- FLUTTER_GOV_APP | FLUTTER_USER_APP | GPS_WATCH | COMMAND_DESK
        os_version TEXT,
        app_version TEXT,
        battery_level INTEGER DEFAULT 100,
        last_heartbeat TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
    );

    -- 10. Immutable Security Audit Ledger
    CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        officer_id TEXT,
        officer_name TEXT,
        action TEXT NOT NULL,
        target TEXT,
        result TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL
    );

    -- 11. DoSJE Projects & Institutions
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        scheme TEXT NOT NULL,
        ngo_institute TEXT NOT NULL,
        incharge_name TEXT NOT NULL,
        incharge_phone TEXT,
        state TEXT NOT NULL,
        district TEXT NOT NULL,
        location_address TEXT NOT NULL,
        latitude REAL DEFAULT 0.0,
        longitude REAL DEFAULT 0.0,
        registered_beneficiaries INTEGER DEFAULT 0,
        staff_count INTEGER DEFAULT 0,
        compliance_status TEXT NOT NULL DEFAULT 'COMPLIANT',
        risk_score REAL DEFAULT 0.0,
        geofence_id TEXT,
        cctv_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS institutions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'NGO', -- NGO | INSTITUTE | DEPARTMENT_PROMOTED
        code TEXT UNIQUE NOT NULL,
        state TEXT NOT NULL,
        district TEXT NOT NULL,
        address TEXT NOT NULL,
        contact_person TEXT NOT NULL,
        contact_phone TEXT,
        email TEXT,
        created_at TEXT NOT NULL
    );

    -- 12. Live CCTV Cameras
    CREATE TABLE IF NOT EXISTS cctv_cameras (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        camera_name TEXT NOT NULL,
        location_description TEXT,
        stream_url TEXT,
        status TEXT NOT NULL DEFAULT 'OFFLINE', -- ONLINE | OFFLINE | UNCONFIGURED
        last_heartbeat TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    -- 13. Inspection Teams & Assignments
    CREATE TABLE IF NOT EXISTS inspection_teams (
        id TEXT PRIMARY KEY,
        team_name TEXT NOT NULL,
        lead_officer_name TEXT NOT NULL,
        members_json TEXT DEFAULT '[]',
        state TEXT NOT NULL,
        district TEXT NOT NULL,
        availability_status TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE | BUSY | ON_INSPECTION
        current_workload INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        inspection_code TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        ngo_institute TEXT NOT NULL,
        inspection_type TEXT NOT NULL DEFAULT 'SURPRISE', -- SURPRISE | SCHEDULED | RANDOM_AI
        reason TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
        deadline TEXT,
        team_id TEXT,
        team_name TEXT,
        inspector_id TEXT,
        inspector_name TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | ASSIGNED | ACCEPTED | IN_PROGRESS | COMPLETED | FAILED | CANCELLED
        start_time TEXT,
        completion_time TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspection_reports (
        id TEXT PRIMARY KEY,
        inspection_id TEXT UNIQUE NOT NULL,
        project_id TEXT NOT NULL,
        inspector_id TEXT NOT NULL,
        inspector_name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL DEFAULT 5.0,
        geofence_status TEXT DEFAULT 'INSIDE',
        observations TEXT NOT NULL,
        compliance_findings TEXT,
        violations TEXT,
        beneficiary_verification_summary TEXT,
        staff_verification_summary TEXT,
        remarks TEXT,
        final_status TEXT NOT NULL DEFAULT 'COMPLETED',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inspection_evidence (
        id TEXT PRIMARY KEY,
        inspection_id TEXT NOT NULL,
        evidence_type TEXT NOT NULL, -- PHOTO | VIDEO | DOCUMENT
        file_url TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        timestamp TEXT NOT NULL,
        inspector_id TEXT,
        description TEXT,
        created_at TEXT NOT NULL
    );

    -- 14. AI Anomaly Detection Engine
    CREATE TABLE IF NOT EXISTS anomalies (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL, -- PROJECT | USER | INSPECTION | CCTV
        entity_id TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        risk_level TEXT NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
        reason TEXT NOT NULL,
        evidence_summary TEXT,
        recommended_action TEXT,
        status TEXT NOT NULL DEFAULT 'DETECTED', -- DETECTED | INVESTIGATING | RESOLVED
        created_at TEXT NOT NULL
    );

    -- 15. Compliance Records
    CREATE TABLE IF NOT EXISTS compliance_records (
        id TEXT PRIMARY KEY,
        project_id TEXT UNIQUE NOT NULL,
        project_name TEXT NOT NULL,
        compliance_score REAL DEFAULT 100.0,
        last_inspection_date TEXT,
        violations_count INTEGER DEFAULT 0,
        pending_actions_count INTEGER DEFAULT 0,
        cctv_availability_pct REAL DEFAULT 100.0,
        attendance_rate_pct REAL DEFAULT 100.0,
        anomaly_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    -- 16. Random VC / Surprise Call Sessions
    CREATE TABLE IF NOT EXISTS vc_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        target_person_id TEXT NOT NULL,
        target_person_name TEXT NOT NULL,
        target_role TEXT NOT NULL, -- INCHARGE | STAFF | BENEFICIARY
        initiator_id TEXT DEFAULT 'COMMAND-OFFICER',
        status TEXT NOT NULL DEFAULT 'REQUESTED', -- REQUESTED | CONNECTED | REJECTED | COMPLETED
        call_type TEXT DEFAULT 'RANDOM_SURPRISE_VC',
        started_at TEXT,
        ended_at TEXT,
        audit_notes TEXT,
        created_at TEXT NOT NULL
    );

    -- 17. AI Random Verification Sessions (Multi-Factor: Call + Voice + Face + Location + Geofence)
    CREATE TABLE IF NOT EXISTS random_verification_sessions (
        verification_id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        person_name TEXT,
        person_phone TEXT,
        initiated_by TEXT DEFAULT 'COMMAND-OFFICER',
        status TEXT NOT NULL DEFAULT 'INITIATED',
            -- INITIATED | CALL_PLACED | CALL_FAILED | APP_NOTIFIED | VERIFYING | COMPLETED | TIMED_OUT
        call_status TEXT NOT NULL DEFAULT 'PENDING',
            -- PENDING | CALLING | CONNECTED | NO_ANSWER | FAILED | NOT_CONFIGURED
        voice_status TEXT NOT NULL DEFAULT 'PENDING',
            -- PENDING | VERIFYING | VERIFIED | MISMATCH | NOT_ENABLED
        face_status TEXT NOT NULL DEFAULT 'PENDING',
            -- PENDING | VERIFYING | VERIFIED | MISMATCH
        location_status TEXT NOT NULL DEFAULT 'PENDING',
            -- PENDING | INSIDE | OUTSIDE
        geofence_status TEXT NOT NULL DEFAULT 'PENDING',
            -- PENDING | INSIDE | OUTSIDE
        final_result TEXT NOT NULL DEFAULT 'PENDING',
            -- PENDING | VERIFIED | FAILED
        face_score REAL,
        voice_score REAL,
        latitude REAL,
        longitude REAL,
        telephony_call_sid TEXT,
        telephony_provider TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY(person_id) REFERENCES persons(person_id)
    );
    """)

    # Column migrations for existing tables
    cursor.execute("PRAGMA table_info(users)")
    user_cols = [row[1] for row in cursor.fetchall()]
    if "email" not in user_cols:
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN email TEXT")
        except Exception:
            pass
    if "phone" not in user_cols:
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN phone TEXT")
        except Exception:
            pass
    if "designation" not in user_cols:
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN designation TEXT DEFAULT 'Field Personnel'")
        except Exception:
            pass

    cursor.execute("PRAGMA table_info(geofence_assignments)")
    ga_cols = [row[1] for row in cursor.fetchall()]
    for col in ["officer_id", "assignment_name", "status", "created_at"]:
        if col not in ga_cols:
            try:
                cursor.execute(f"ALTER TABLE geofence_assignments ADD COLUMN {col} TEXT")
            except Exception:
                pass

    cursor.execute("PRAGMA table_info(geofences)")
    geo_cols = [row[1] for row in cursor.fetchall()]
    for col, col_type in [
        ("person_id", "TEXT"),
        ("area_name", "TEXT"),
        ("latitude", "REAL"),
        ("longitude", "REAL"),
        ("radius", "REAL"),
        ("start_time", "TEXT"),
        ("end_time", "TEXT"),
        ("status", "TEXT DEFAULT 'ACTIVE'"),
    ]:
        if col not in geo_cols:
            try:
                cursor.execute(f"ALTER TABLE geofences ADD COLUMN {col} {col_type}")
            except Exception:
                pass

    cursor.execute("PRAGMA table_info(attendance)")
    att_cols = [row[1] for row in cursor.fetchall()]
    for col, col_type in [
        ("person_id", "TEXT"),
        ("geofence_id", "TEXT"),
        ("entry_time", "TEXT"),
        ("exit_time", "TEXT"),
        ("current_latitude", "REAL"),
        ("current_longitude", "REAL"),
        ("gps_status", "TEXT DEFAULT 'INSIDE'"),
        ("face_status", "TEXT DEFAULT 'PENDING'"),
        ("voice_status", "TEXT DEFAULT 'NOT_ENABLED'"),
        ("verification_status", "TEXT DEFAULT 'PENDING'"),
    ]:
        if col not in att_cols:
            try:
                cursor.execute(f"ALTER TABLE attendance ADD COLUMN {col} {col_type}")
            except Exception:
                pass

    cursor.execute("PRAGMA table_info(verification_results)")
    vr_cols = [row[1] for row in cursor.fetchall()]
    if "geofence_id" not in vr_cols:
        try:
            cursor.execute("ALTER TABLE verification_results ADD COLUMN geofence_id TEXT")
        except Exception:
            pass

    conn.commit()
    conn.close()

def query_all(query: str, params: tuple = ()) -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def query_one(query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(query, params)
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def execute_commit(query: str, params: tuple = ()):
    with _db_lock:
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()
        finally:
            conn.close()

