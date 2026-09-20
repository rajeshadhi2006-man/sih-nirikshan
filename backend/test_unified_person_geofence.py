import requests
import json
import math
import sys

BASE_URL = "http://127.0.0.1:8000"

def test_unified_system():
    print("=" * 70)
    print("TESTING UNIFIED PERSON ENROLLMENT + GEOFENCE + ATTENDANCE + VERIFICATION")
    print("=" * 70)

    # 1. PERSON ENROLLMENT (Section 1)
    face_vector = [0.55 + 0.1 * math.sin(i * 0.3) for i in range(128)]
    voice_vector = [0.4 + 0.2 * math.cos(i * 0.4) for i in range(64)]
    
    enroll_payload = {
        "full_name": "Major Vikram Rathore",
        "employee_id": "GOV-DEF-909",
        "mobile": "+91 9876543210",
        "email": "vikram.rathore@field.gov.in",
        "role": "FIELD_COMMANDER",
        "organization": "National Disaster Response Force",
        "assigned_area": "Chennai Central Tactical Sector",
        "profile_photo_url": "data:image/jpeg;base64,dummyphoto",
        "face_embedding": json.dumps(face_vector),
        "voice_embedding": json.dumps(voice_vector),
        "latitude": 13.082700,
        "longitude": 80.270700,
        "radius": 150
    }

    print("\n[STEP 1] Enrolling Person with Demographics + Biometrics + Real GPS Area...")
    res = requests.post(f"{BASE_URL}/api/persons/enroll", json=enroll_payload)
    print(f"Status Code: {res.status_code}")
    assert res.status_code == 200, f"Enrollment failed: {res.text}"
    data = res.json()
    assert data["success"] is True
    person = data["person"]
    person_id = person["person_id"]
    geofence = data["geofence"]
    geofence_id = geofence["geofence_id"]

    print(f"  -> Generated person_id: {person_id}")
    print(f"  -> Linked geofence_id: {geofence_id}")
    print(f"  -> Geofence person_id matches enrolled person: {geofence['person_id'] == person_id}")
    assert geofence["person_id"] == person_id, "Geofence person_id must match enrolled person_id!"
    assert geofence["radius"] == 150
    assert abs(geofence["latitude"] - 13.082700) < 0.0001
    assert abs(geofence["longitude"] - 80.270700) < 0.0001

    # 2. VERIFY PERSON RETRIEVAL (Section 2 & 16)
    print("\n[STEP 2] Fetching Enrolled Person & Linked Geofence...")
    res = requests.get(f"{BASE_URL}/api/persons/{person_id}")
    assert res.status_code == 200
    p_fetched = res.json()
    assert p_fetched["person_id"] == person_id
    assert p_fetched["geofence"] is not None
    print(f"  -> Fetched Person: {p_fetched['full_name']} ({p_fetched['employee_id']})")
    print(f"  -> Linked Geofence Area: {p_fetched['geofence']['name']} (Radius: {p_fetched['geofence']['radius']}m)")

    # 3. GPS ENTRY CHECK (Section 6 & 7)
    # Coordinates inside 150m radius (e.g. within 20m of center: 13.0828, 80.2707)
    print("\n[STEP 3] Mobile App Transmitting GPS INSIDE Geofence Perimeter...")
    loc_inside_payload = {
        "user_id": person_id,
        "latitude": 13.082800,
        "longitude": 80.270700,
        "accuracy": 4.5,
        "speed": 1.2,
        "heading": 90.0,
        "full_name": "Major Vikram Rathore"
    }
    res = requests.post(f"{BASE_URL}/api/location/update", json=loc_inside_payload)
    assert res.status_code == 200
    loc_res = res.json()
    print(f"  -> Geofence Status: {loc_res['geofence_status']}")
    print(f"  -> Inside: {loc_res['is_inside']}")
    print(f"  -> Distance: {loc_res.get('distance_meters')}m (Radius: 150m)")
    assert loc_res["geofence_status"] == "INSIDE", f"Expected INSIDE, got {loc_res['geofence_status']}"
    assert loc_res["is_inside"] is True

    # Check Attendance status
    res = requests.get(f"{BASE_URL}/api/attendance/{person_id}")
    assert res.status_code == 200
    att_data = res.json()
    att_record = att_data[0] if isinstance(att_data, list) and len(att_data) > 0 else (att_data if isinstance(att_data, dict) else {})
    att_status = att_record.get('status') or att_record.get('attendance_status') or loc_res.get('attendance_status')
    entry_time = att_record.get('entry_time') or att_record.get('check_in_time')
    print(f"  -> Attendance Status: {att_status}")
    print(f"  -> Entry Time Recorded: {entry_time}")
    assert att_status in ["PRESENT", "INSIDE"], f"Expected PRESENT, got {att_status}"

    # 4. BIOMETRIC FACE VERIFICATION (Section 9 & 11)
    print("\n[STEP 4] Biometric Face Verification with Matching Embedding...")
    matching_face_payload = {
        "person_id": person_id,
        "face_embedding": json.dumps(face_vector)
    }
    res = requests.post(f"{BASE_URL}/api/verification/face", json=matching_face_payload)
    assert res.status_code == 200
    face_res = res.json()
    print(f"  -> Face Verification Match: {face_res['match']}")
    print(f"  -> Face Confidence Score: {face_res['confidence_score']}%")
    print(f"  -> Face Status: {face_res['face_status']}")
    assert face_res["match"] is True
    assert face_res["face_status"] == "MATCH"

    # Test Mismatched Face
    print("\n[STEP 4b] Biometric Face Verification with MISMATCHED Embedding...")
    mismatch_face_vector = [-0.55 - 0.1 * math.sin(i * 0.3) for i in range(128)]
    mismatch_payload = {
        "person_id": person_id,
        "face_embedding": json.dumps(mismatch_face_vector)
    }
    res = requests.post(f"{BASE_URL}/api/verification/face", json=mismatch_payload)
    assert res.status_code == 200
    face_res_mismatch = res.json()
    print(f"  -> Mismatch Result: {face_res_mismatch['face_status']} (Score: {face_res_mismatch['confidence_score']}%)")
    assert face_res_mismatch["face_status"] == "MISMATCH"

    # Re-verify matching face for final test
    requests.post(f"{BASE_URL}/api/verification/face", json=matching_face_payload)

    # 5. VOICE VERIFICATION (Section 10)
    print("\n[STEP 5] Optional Voice Verification...")
    voice_payload = {
        "person_id": person_id,
        "voice_embedding": json.dumps(voice_vector)
    }
    res = requests.post(f"{BASE_URL}/api/verification/voice", json=voice_payload)
    assert res.status_code == 200
    voice_res = res.json()
    print(f"  -> Voice Verification Match: {voice_res['match']}")
    print(f"  -> Voice Status: {voice_res['voice_status']}")
    assert voice_res["match"] is True

    # 6. MULTI-FACTOR FINAL VERIFICATION (Section 11)
    print("\n[STEP 6] Executing Multi-Factor Fusion Verification (GPS + Face + Voice)...")
    res = requests.post(f"{BASE_URL}/api/verification/final", json={"person_id": person_id})
    assert res.status_code == 200
    final_res = res.json()
    print(f"  -> GPS Result:   {final_res['gps_result']}")
    print(f"  -> Face Result:  {final_res['face_result']}")
    print(f"  -> Voice Result: {final_res['voice_result']}")
    print(f"  -> Final Result: {final_res['final_result']}")
    print(f"  -> Attendance:   {final_res['attendance_status']}")
    assert final_res["final_result"] == "VERIFIED"
    assert final_res["attendance_status"] == "PRESENT"

    # 7. GPS EXIT CHECK (Section 8)
    # Coordinates outside 150m radius (e.g. 13.0900, 80.2707 is ~810m away)
    print("\n[STEP 7] Mobile App Transmitting GPS OUTSIDE Geofence Perimeter...")
    loc_outside_payload = {
        "user_id": person_id,
        "latitude": 13.090000,
        "longitude": 80.270700,
        "accuracy": 5.0,
        "speed": 4.5,
        "heading": 0.0,
        "full_name": "Major Vikram Rathore"
    }
    res = requests.post(f"{BASE_URL}/api/location/update", json=loc_outside_payload)
    assert res.status_code == 200
    loc_exit_res = res.json()
    print(f"  -> Geofence Status: {loc_exit_res['geofence_status']}")
    print(f"  -> Inside: {loc_exit_res['is_inside']}")
    print(f"  -> Distance: {loc_exit_res.get('distance_meters')}m (Radius: 150m)")
    assert loc_exit_res["geofence_status"] == "OUTSIDE"
    assert loc_exit_res["is_inside"] is False

    # Check updated attendance status
    res = requests.get(f"{BASE_URL}/api/attendance/{person_id}")
    assert res.status_code == 200
    att_exit_data = res.json()
    att_exit_record = att_exit_data[0] if isinstance(att_exit_data, list) and len(att_exit_data) > 0 else (att_exit_data if isinstance(att_exit_data, dict) else {})
    att_exit_status = att_exit_record.get('status') or att_exit_record.get('attendance_status') or loc_exit_res.get('attendance_status')
    exit_time = att_exit_record.get('exit_time') or att_exit_record.get('check_out_time')
    print(f"  -> Updated Attendance Status: {att_exit_status}")
    print(f"  -> Exit Time Recorded: {exit_time}")
    assert att_exit_status in ["EXITED", "OUTSIDE", "DEPARTED"], f"Expected EXITED, got {att_exit_status}"

    print("\n" + "=" * 70)
    print("ALL UNIFIED PERSON ENROLLMENT + GEOFENCE WORKFLOW TESTS PASSED!")
    print("=" * 70)

if __name__ == "__main__":
    test_unified_system()
