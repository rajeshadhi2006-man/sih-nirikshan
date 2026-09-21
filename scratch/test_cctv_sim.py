import cv2
import numpy as np
import time
import math
from datetime import datetime

def generate_frame(t):
    h, w = 480, 640
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    
    # 1. Background gradient (night surveillance scene)
    for y in range(h):
        # Sky/Wall to ground transition
        if y < 220:
            frame[y, :] = [25 + int(y*0.08), 28 + int(y*0.08), 35 + int(y*0.08)]
        else:
            frame[y, :] = [30 + int((y-220)*0.05), 32 + int((y-220)*0.05), 38 + int((y-220)*0.05)]

    # 2. Facility Architecture lines (Security Gate / Perimeter)
    # Perimeter fence / wall
    cv2.line(frame, (0, 220), (w, 220), (55, 60, 70), 2)
    # Road markings / corridor lines
    cv2.line(frame, (80, 220), (0, 480), (70, 75, 85), 2)
    cv2.line(frame, (560, 220), (640, 480), (70, 75, 85), 2)
    
    # Dash lines along roadway
    for dy in range(240, 460, 40):
        cv2.line(frame, (320, dy), (320, dy + 20), (90, 95, 110), 2)
    
    # Security checkpoint booth on right
    cv2.rectangle(frame, (500, 160), (620, 280), (45, 50, 60), -1)
    cv2.rectangle(frame, (500, 160), (620, 280), (80, 85, 100), 2)
    cv2.rectangle(frame, (520, 180), (600, 220), (120, 140, 160), -1) # Window
    cv2.putText(frame, "GUARD POST #1", (510, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (180, 180, 180), 1)

    # 3. Dynamic Moving Elements
    # Person walking across: cycle every 10 seconds
    speed_p = (t * 45) % (w + 100) - 50
    px = int(speed_p)
    py = 220 + int(math.sin(t * 4) * 4) # slight walking bob
    pw, ph = 48, 120
    
    # Draw stylized person silhouette
    cv2.circle(frame, (px + pw//2, py + 18), 12, (150, 160, 175), -1) # Head
    cv2.rectangle(frame, (px + 10, py + 30), (px + pw - 10, py + 80), (130, 140, 155), -1) # Torso
    cv2.line(frame, (px + 16, py + 80), (px + 12 + int(math.sin(t*8)*10), py + ph), (110, 120, 135), 4) # Leg 1
    cv2.line(frame, (px + pw - 16, py + 80), (px + pw - 12 - int(math.sin(t*8)*10), py + ph), (110, 120, 135), 4) # Leg 2

    # Vehicle passing: cycle every 16 seconds
    speed_v = ((t * 60) + 200) % (w + 200) - 100
    vx = int(w - speed_v)
    vy = 280
    vw, vh = 130, 70
    
    # Draw stylized vehicle silhouette
    cv2.rectangle(frame, (vx, vy + 20), (vx + vw, vy + vh), (80, 95, 110), -1)
    cv2.rectangle(frame, (vx + 20, vy), (vx + vw - 25, vy + 25), (100, 120, 140), -1) # Cabin
    cv2.circle(frame, (vx + 28, vy + vh), 14, (30, 30, 35), -1) # Wheel 1
    cv2.circle(frame, (vx + vw - 28, vy + vh), 14, (30, 30, 35), -1) # Wheel 2
    # Headlights
    cv2.circle(frame, (vx + 6, vy + 35), 5, (200, 240, 255), -1)

    # 4. Tactical CCTV HUD
    # Camera ID & Metadata
    ts_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.%f")[:-4] + " UTC"
    cv2.putText(frame, "CAM-01 [ENTRANCE PERIMETER NORTH]", (16, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 200), 1, cv2.LINE_AA)
    cv2.putText(frame, ts_str, (16, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1, cv2.LINE_AA)
    
    # Blinking REC dot
    if int(t * 2) % 2 == 0:
        cv2.circle(frame, (w - 70, 28), 6, (0, 0, 255), -1)
        cv2.putText(frame, "REC", (w - 55, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1, cv2.LINE_AA)
    
    # Center tactical reticle / crosshair
    cx, cy = w // 2, h // 2
    cv2.line(frame, (cx - 15, cy), (cx + 15, cy), (0, 255, 200), 1)
    cv2.line(frame, (cx, cy - 15), (cx, cy + 15), (0, 255, 200), 1)

    # 5. Detections payload
    detections = []
    if 0 <= px <= w - pw:
        detections.append({
            "class_name": "person",
            "confidence": 0.93,
            "track_id": 101,
            "bbox": [px, py, px + pw, py + ph],
            "center": [px + pw//2, py + ph//2],
            "ppe_compliance": {"helmet": True, "vest": True, "compliant": True}
        })
    if 0 <= vx <= w - vw:
        detections.append({
            "class_name": "car",
            "confidence": 0.88,
            "track_id": 102,
            "bbox": [vx, vy, vx + vw, vy + vh],
            "center": [vx + vw//2, vy + vh//2],
            "ppe_compliance": {"helmet": False, "vest": False, "compliant": True}
        })

    counts = {
        "person": len([d for d in detections if d["class_name"] == "person"]),
        "vehicle": len([d for d in detections if d["class_name"] in ("car", "truck")]),
        "total": len(detections)
    }

    return frame, {"detections": detections, "counts": counts}

# Test generating and saving 1 frame
f, meta = generate_frame(3.5)
cv2.imwrite("scratch/test_cctv_sim.jpg", f)
print("Saved simulated frame! Detections:", meta)
