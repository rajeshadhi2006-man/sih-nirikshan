import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import query_one, execute_commit

client = TestClient(app)

def test_unified_enrollment_and_geofence_availability():
    # Pre-clean any leftover test records for idempotency
    execute_commit("DELETE FROM persons WHERE person_id IN ('EMP-KAV-101', 'PEMP-KAV-101', 'EMP-ARUN-202') OR employee_id IN ('EMP-KAV-101', 'EMP-ARUN-202')")
    execute_commit("DELETE FROM users WHERE user_id IN ('EMP-KAV-101', 'PEMP-KAV-101', 'EMP-ARUN-202')")
    execute_commit("DELETE FROM profiles WHERE officer_id IN ('EMP-KAV-101', 'PEMP-KAV-101', 'EMP-ARUN-202')")
    execute_commit("DELETE FROM geofences WHERE person_id IN ('EMP-KAV-101', 'PEMP-KAV-101', 'EMP-ARUN-202') OR name LIKE '%Tambaram%'")
    execute_commit("DELETE FROM geofence_assignments WHERE user_id IN ('EMP-KAV-101', 'PEMP-KAV-101', 'EMP-ARUN-202')")
    execute_commit("DELETE FROM enrolled_attendance_users WHERE user_id IN ('EMP-KAV-101', 'PEMP-KAV-101', 'EMP-ARUN-202')")

    # 1. Enroll a person via POST /api/persons/enroll with GPS & Geofence
    enroll_payload = {
        "full_name": "Kavitha Raman",
        "employee_id": "EMP-KAV-101",
        "mobile": "+91 9840123456",
        "email": "kavitha.raman@field.gov.in",
        "role": "INSPECTOR",
        "organization": "Department of Social Justice",
        "assigned_area": "Chennai Sector 4",
        "latitude": 13.0827,
        "longitude": 80.2707,
        "radius": 250.0
    }
    res = client.post("/api/persons/enroll", json=enroll_payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["success"] is True
    pid = data["person_id"]
    assert "Kavitha Raman" in data["person"]["full_name"]

    # 2. Check person is immediately available in GET /api/persons
    p_res = client.get("/api/persons")
    assert p_res.status_code == 200
    persons_list = p_res.json()
    assert any(p["person_id"] == pid for p in persons_list)

    # 3. Check person is immediately available in GET /api/users
    u_res = client.get("/api/users")
    assert u_res.status_code == 200
    users_list = u_res.json()
    assert any(u["id"] == pid or u["officer_id"] == "EMP-KAV-101" for u in users_list)

    # 4. Check person's geofence is immediately available in GET /api/geofences
    g_res = client.get("/api/geofences")
    assert g_res.status_code == 200
    geos_list = g_res.json()
    matched_geo = next((g for g in geos_list if g.get("person_id") == pid), None)
    assert matched_geo is not None
    assert matched_geo["radius_meters"] == 250.0
    assert abs(matched_geo["center_latitude"] - 13.0827) < 0.001
    assert abs(matched_geo["center_longitude"] - 80.2707) < 0.001

    # 5. Create a standalone operational perimeter fence (NO person_id)
    standalone_geo = {
        "name": "Tambaram Operations Perimeter",
        "department": "Regional Command",
        "description": "General operational containment zone",
        "center_latitude": 12.9249,
        "center_longitude": 80.1000,
        "radius_meters": 500.0,
        "person_id": None
    }
    sg_res = client.post("/api/geofences", json=standalone_geo)
    assert sg_res.status_code == 200, sg_res.text
    sg_data = sg_res.json()
    assert sg_data["success"] is True
    assert sg_data["geofence"]["radius_meters"] == 500.0

    # 6. Verify standalone fence is in GET /api/geofences with valid center coords
    g_res2 = client.get("/api/geofences")
    assert g_res2.status_code == 200
    standalone_found = next((g for g in g_res2.json() if "Tambaram" in g.get("name", "")), None)
    assert standalone_found is not None
    assert standalone_found["center_latitude"] is not None
    assert standalone_found["center_longitude"] is not None

    # 7. Enroll user via POST /api/users
    user_payload = {
        "user_id": "EMP-ARUN-202",
        "full_name": "Arun Kumar",
        "department": "National Surveillance",
        "designation": "Field Supervisor",
        "role": "SUPERVISOR",
        "email": "arun.kumar@field.gov.in",
        "phone": "+91 9710987654"
    }
    create_u_res = client.post("/api/users", json=user_payload)
    assert create_u_res.status_code == 200, create_u_res.text
    
    # Verify Arun is also in persons table and in GET /api/persons
    p_res2 = client.get("/api/persons")
    assert any(p["person_id"] == "EMP-ARUN-202" or p["employee_id"] == "EMP-ARUN-202" for p in p_res2.json())

    # 8. Check GET /api/attendance/live does not use dummy coordinates
    att_res = client.get("/api/attendance/live")
    assert att_res.status_code == 200
    att_records = att_res.json()["records"]
    kav_att = next((r for r in att_records if r["user_id"] == pid), None)
    assert kav_att is not None
    assert kav_att["geofence_center_lat"] == 13.0827
    assert kav_att["geofence_center_lng"] == 80.2707

    # 9. Verify DELETE /api/attendance/enrolled/{user_id}
    del_res = client.delete(f"/api/attendance/enrolled/{pid}")
    assert del_res.status_code == 200, del_res.text
    assert del_res.json()["success"] is True
    
    # Confirm user is no longer returned in enrolled attendance directory
    enrolled_after = client.get("/api/attendance/enrolled").json()
    assert not any(u["user_id"] == pid for u in enrolled_after)

    # Clean up test records
    execute_commit("DELETE FROM persons WHERE person_id IN (?, 'EMP-ARUN-202')", (pid,))
    execute_commit("DELETE FROM users WHERE user_id IN (?, 'EMP-ARUN-202')", (pid,))
    execute_commit("DELETE FROM profiles WHERE officer_id IN (?, 'EMP-ARUN-202')", (pid,))
    execute_commit("DELETE FROM geofences WHERE person_id = ? OR name LIKE '%Tambaram%'", (pid,))
    execute_commit("DELETE FROM geofence_assignments WHERE user_id = ?", (pid,))
    execute_commit("DELETE FROM enrolled_attendance_users WHERE user_id IN (?, 'EMP-ARUN-202')", (pid,))

    print("All unified enrollment & geofence availability validations passed successfully!")

if __name__ == "__main__":
    test_unified_enrollment_and_geofence_availability()
