import requests

BASE_URL = "http://127.0.0.1:8000"

def test_delete_flow():
    print("=" * 60)
    print("TESTING DELETE PERSON & LINKED GEOFENCE CLEANUP")
    print("=" * 60)

    # 1. Enroll temporary person
    payload = {
        "full_name": "Temporary Cadet Arjun",
        "employee_id": "CADET-DEL-777",
        "mobile": "+91 9988776655",
        "email": "cadet.arjun@field.gov.in",
        "role": "OFFICER",
        "organization": "Department of Social Justice and Empowerment",
        "assigned_area": "Temporary Training Sector",
        "latitude": 13.0827,
        "longitude": 80.2707,
        "radius": 100.0
    }
    res = requests.post(f"{BASE_URL}/api/persons/enroll", json=payload)
    assert res.status_code == 200, f"Enroll failed: {res.text}"
    data = res.json()
    person_id = data["person_id"]
    print(f"1. Enrolled person: {person_id}")

    # 2. Verify person exists
    res = requests.get(f"{BASE_URL}/api/persons/{person_id}")
    assert res.status_code == 200, f"Person not found: {res.text}"
    print("2. Verified person exists in database.")

    # 3. Delete the person
    res = requests.delete(f"{BASE_URL}/api/persons/{person_id}")
    assert res.status_code == 200, f"Delete failed: {res.text}"
    del_res = res.json()
    assert del_res["success"] is True
    print(f"3. Deleted person successfully: {del_res['message']}")

    # 4. Verify person is no longer found
    res = requests.get(f"{BASE_URL}/api/persons/{person_id}")
    assert res.status_code == 404, f"Expected 404, got {res.status_code}"
    print("4. Confirmed person returns 404 Not Found.")

    # 5. Verify linked geofence is cleaned up
    res = requests.get(f"{BASE_URL}/api/geofences/person/{person_id}")
    assert res.status_code in [404, 200]
    if res.status_code == 200:
        g = res.json()
        assert g is None or not g.get("id"), "Geofence was not cleaned up"
    print("5. Confirmed linked geofence removed.")

    print("\n" + "=" * 60)
    print("DELETE PERSON TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    test_delete_flow()
