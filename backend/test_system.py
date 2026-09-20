import pytest
import sqlite3
import os
import sys

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.database import init_db, get_connection, execute_commit

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_clean_db():
    init_db()
    # Clean tables before each test
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM geofence_assignments")
    cursor.execute("DELETE FROM geofence_events")
    cursor.execute("DELETE FROM attendance")
    cursor.execute("DELETE FROM attendance_sessions")
    cursor.execute("DELETE FROM locations")
    cursor.execute("DELETE FROM location_history")
    cursor.execute("DELETE FROM alerts")
    cursor.execute("DELETE FROM geofences")
    cursor.execute("DELETE FROM users")
    cursor.execute("DELETE FROM profiles")
    conn.commit()
    conn.close()

def test_full_system_workflow():
    # 1. Register User
    user_res = client.post("/api/users", json={
        "user_id": "U101",
        "full_name": "Rajesh Kumar",
        "department": "Surveillance Team",
        "designation": "Inspector",
        "phone": "+91 9876543210"
    })
    assert user_res.status_code == 200
    assert user_res.json()["user_id"] == "U101"

    # 2. Create Geofence
    geo_res = client.post("/api/geofences", json={
        "name": "District Security HQ",
        "person_id": "U101",
        "department": "Surveillance Team",
        "description": "High Security Perimeter",
        "center_latitude": 11.0168,
        "center_longitude": 76.9558,
        "radius_meters": 300.0
    })
    assert geo_res.status_code == 200
    geo_data = geo_res.json()
    geo_id = geo_data["geofence"]["id"] if "geofence" in geo_data else geo_data["id"]

    # 3. GPS Update OUTSIDE Geofence
    loc_out = client.post("/api/location/update", json={
        "user_id": "U101",
        "latitude": 12.0000,
        "longitude": 77.0000,
        "accuracy": 5.0
    })
    assert loc_out.status_code == 200
    assert loc_out.json()["geofence_status"] == "OUTSIDE"

    # 4. GPS Update INSIDE Geofence WITH Assignment -> Sets PRESENT and records Attendance
    loc_auth = client.post("/api/location/update", json={
        "user_id": "U101",
        "latitude": 11.0168,
        "longitude": 76.9558,
        "accuracy": 5.0
    })
    assert loc_auth.status_code == 200
    assert loc_auth.json()["attendance_status"] == "PRESENT"

    # Verify Attendance record created
    att_res = client.get("/api/attendance/history")
    assert att_res.status_code == 200
    att_records = att_res.json()
    assert len(att_records) > 0
    assert att_records[0]["user_id"] == "U101"
    assert att_records[0]["status"] == "PRESENT"

    # 5. GPS Update OUTSIDE Geofence -> Triggers EXIT Event & Updates Attendance to EXITED
    loc_exit = client.post("/api/location/update", json={
        "user_id": "U101",
        "latitude": 12.0000,
        "longitude": 77.0000,
        "accuracy": 5.0
    })
    assert loc_exit.status_code == 200
    assert loc_exit.json()["geofence_status"] == "OUTSIDE"

    # Verify Attendance record updated to EXITED
    att_updated = client.get("/api/attendance/history")
    assert att_updated.json()[0]["status"] in ("EXITED", "COMPLETED")
    assert att_updated.json()[0]["check_out_time"] is not None

def test_biometric_verification_not_configured():
    face_res = client.post("/api/verification/face", json={"user_id": "U101"})
    assert face_res.status_code == 200
    assert face_res.json()["status"] in ("MODEL NOT CONNECTED", "MISMATCH")

    voice_res = client.post("/api/verification/voice", json={"user_id": "U101"})
    assert voice_res.status_code == 200
    assert voice_res.json()["status"] in ("MODEL NOT CONNECTED", "MISMATCH", "NOT_ENABLED")

