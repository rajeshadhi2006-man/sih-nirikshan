import json
import requests

url = "http://localhost:8000/api/cctv/sessions/start"
payload = {
    "officer_id": "OFF-101",
    "officer_name": "Vikramaditya Rao",
    "device_model": "Android Physical Camera",
    "resolution": "720p",
    "fps": 30
}

try:
    resp = requests.post(url, json=payload, timeout=5)
    print("SESSION START RESPONSE:", resp.status_code, json.dumps(resp.json(), indent=2))
    
    # Check cameras list
    cams = requests.get("http://localhost:8000/api/cctv/cameras", timeout=5).json()
    print("CAMERAS COUNT:", len(cams))
    for c in cams[-2:]:
        print("  Camera:", c.get("id"), "-", c.get("camera_name"), "| Status:", c.get("status"))

    # Test stop session
    cam_id = resp.json().get("camera_id")
    sess_id = resp.json().get("session_id")
    stop_resp = requests.post("http://localhost:8000/api/cctv/sessions/stop", json={"camera_id": cam_id, "session_id": sess_id})
    print("SESSION STOP RESPONSE:", stop_resp.status_code, stop_resp.json())

except Exception as e:
    print("ERROR:", e)
