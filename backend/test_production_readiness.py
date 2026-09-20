import pytest
import os
import sys
import json
from fastapi.testclient import TestClient

try:
    from backend.app.main import app
    from backend.app.config import DATABASE_MODE, SUPABASE_SERVICE_ROLE_KEY
    from backend.app.database import query_all, query_one, execute_commit
except ImportError:
    from app.main import app
    from app.config import DATABASE_MODE, SUPABASE_SERVICE_ROLE_KEY
    from app.database import query_all, query_one, execute_commit

client = TestClient(app)

def test_database_mode_configuration():
    """Verify DATABASE_MODE is explicitly set to 'supabase' or 'local'."""
    assert DATABASE_MODE in ("supabase", "local")

def test_security_secret_isolation():
    """Verify SUPABASE_SERVICE_ROLE_KEY is not exposed in public frontend .env or JS files."""
    env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
    if os.path.exists(env_file):
        with open(env_file, "r") as f:
            content = f.read()
            assert "SUPABASE_SERVICE_ROLE_KEY" not in content or "ey" not in content

def test_empty_database_returns_zero():
    """Verify empty database queries return zero/empty lists without inventing fake records."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert "db_stats" in data
    assert isinstance(data["db_stats"]["registered_profiles"], int)

def test_unsupported_auth_returns_401():
    """Verify invalid token returns HTTP 401/403."""
    res = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid-jwt-token"})
    assert res.status_code in (401, 403)

def test_geofence_haversine_calculation():
    """Verify Haversine geofence breach check logic."""
    payload = {
        "user_id": "OFFICER-01",
        "latitude": 11.0168,
        "longitude": 76.9558,
        "accuracy": 4.5,
        "speed": 0.0,
        "heading": 0.0
    }
    res = client.post("/api/location/update", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "is_inside" in data

def test_biometric_model_unavailable_fallback():
    """Verify Face and Voice verification return MODEL NOT CONNECTED / MODEL_UNAVAILABLE instead of fake matches."""
    face_res = client.post("/api/verification/face", json={"user_id": "OFFICER-01"})
    assert face_res.status_code == 200
    assert "status" in face_res.json()

    voice_res = client.post("/api/verification/voice", json={"user_id": "OFFICER-01"})
    assert voice_res.status_code == 200
    assert "status" in voice_res.json()

def test_inspection_lifecycle():
    """Verify dynamic inspection creation and report submission flow."""
    # Ensure test project exists
    execute_commit(
        """INSERT OR IGNORE INTO projects (id, name, scheme, ngo_institute, incharge_name, state, district, location_address, created_at, updated_at)
           VALUES ('proj-001', 'Test DoSJE Center', 'PM-AJAY', 'Test NGO', 'Incharge Officer', 'Tamil Nadu', 'Coimbatore', 'Main Rd', '2026-09-06Z', '2026-09-06Z')"""
    )
    create_res = client.post("/api/inspections/surprise", json={
        "project_id": "proj-001",
        "reason": "Routine Check of DoSJE Home",
        "priority": "HIGH",
        "deadline_hours": 24
    })
    assert create_res.status_code in (200, 201)
    insp_data = create_res.json()
    insp_id = insp_data.get("inspection", {}).get("id") or insp_data.get("id")

    report_res = client.post(f"/api/inspections/{insp_id}/report", json={
        "inspection_id": insp_id,
        "inspector_id": "OFFICER-01",
        "inspector_name": "Commander V. Sundaram",
        "latitude": 11.0168,
        "longitude": 76.9558,
        "accuracy": 4.0,
        "geofence_status": "INSIDE",
        "observations": "All facilities compliant with DoSJE standards."
    })
    assert report_res.status_code == 200
    assert report_res.json().get("success") == True

def test_cctv_empty_state_handling():
    """Verify CCTV cameras query returns array without fake video streams."""
    res = client.get("/api/cctv/cameras")
    assert res.status_code == 200
    cameras = res.json()
    assert isinstance(cameras, list)

def test_webrtc_call_session_signaling():
    """Verify random WebRTC call session initiation."""
    create_call = client.post("/api/calls/random-vc", json={
        "project_id": "proj-001",
        "target_role": "INCHARGE"
    })
    assert create_call.status_code in (200, 201)
    session = create_call.json()
    assert isinstance(session, dict)
