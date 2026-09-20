import base64
import json
import cv2
import numpy as np
import requests

# 1. Start dynamic camera session
start_resp = requests.post(
    "http://localhost:8000/api/cctv/sessions/start",
    json={
        "officer_id": "OFF-101",
        "officer_name": "Vikramaditya Rao",
        "device_model": "Android Physical Camera",
        "resolution": "720p",
        "fps": 30
    }
).json()

cam_id = start_resp.get("camera_id")
print(f"Active Dynamic Camera Session: {cam_id}")

# 2. Generate a real test frame with geometric shapes / test patterns
blank = np.zeros((720, 1280, 3), dtype=np.uint8)
cv2.rectangle(blank, (100, 100), (500, 600), (0, 255, 0), -1) # Person-like vertical block
cv2.putText(blank, "PHYSICAL ANDROID PHONE CAMERA FRAME", (80, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
_, enc = cv2.imencode('.jpg', blank)
b64_img = base64.b64encode(enc.tobytes()).decode('utf-8')

# 3. Ingest frame
upload_resp = requests.post(
    "http://localhost:8000/api/cctv/frame",
    json={
        "camera_id": cam_id,
        "image": f"data:image/jpeg;base64,{b64_img}"
    }
).json()
print("FRAME UPLOAD RESPONSE:", json.dumps(upload_resp, indent=2))

# 4. Check status
status_resp = requests.get(f"http://localhost:8000/api/cctv/{cam_id}/status").json()
print("LIVE TELEMETRY STATUS:", json.dumps(status_resp, indent=2))
