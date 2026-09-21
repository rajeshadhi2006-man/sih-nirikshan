import cv2
import numpy as np
import time
import math
from datetime import datetime, timezone
from backend.app.services.yolo_service import yolo_service
from scratch.test_cctv_sim import generate_frame

f, meta = generate_frame(3.5)
annotated = yolo_service.draw_detections_on_frame(f, meta["detections"])
cv2.imwrite("scratch/test_cctv_annotated.jpg", annotated)
print("Saved annotated frame!")
