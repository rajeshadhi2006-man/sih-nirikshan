import sqlite3
import os
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "sih_database.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
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

    -- Standard SIH GPS Tracking Tables
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        department TEXT NOT NULL DEFAULT 'Field Operations',
        role TEXT NOT NULL DEFAULT 'OFFICER',
        status TEXT NOT NULL DEFAULT 'offline',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

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
        status TEXT NOT NULL DEFAULT 'PRESENT', -- PRESENT | LEAVE
        duration_seconds INTEGER DEFAULT 0,
        duration_formatted TEXT DEFAULT '0m',
        date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES enrolled_attendance_users(user_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'CHECK_IN', -- CHECK_IN | CHECK_OUT | VERIFY
        latitude REAL,
        longitude REAL,
        gps_verified INTEGER DEFAULT 1,
        geofence_verified INTEGER DEFAULT 1,
        face_verified INTEGER DEFAULT 0,
        voice_verified INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PRESENT',
        timestamp TEXT NOT NULL,
        details TEXT,
        FOREIGN KEY(user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS location_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL DEFAULT 5.0,
        speed REAL DEFAULT 0.0,
        heading REAL DEFAULT 0.0,
        is_inside_geofence INTEGER DEFAULT 1,
        geofence_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        officer_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        check_in_time TEXT NOT NULL,
        check_out_time TEXT,
        latitude REAL,
        longitude REAL,
        status TEXT NOT NULL DEFAULT 'PRESENT',
        date TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS verification_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        verification_type TEXT NOT NULL,
        status TEXT NOT NULL,
        confidence_score REAL,
        details TEXT,
        verified_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES profiles(id)
    );

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
    """)

    conn.commit()
    conn.close()

def query_all(query: str, params: tuple = ()) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(query, params)
    rows = cursor.fetchall()
    result = [dict(row) for row in rows]
    conn.close()
    return result

def query_one(query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(query, params)
    row = cursor.fetchone()
    result = dict(row) if row else None
    conn.close()
    return result

def execute_commit(query: str, params: tuple = ()):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(query, params)
    conn.commit()
    conn.close()
