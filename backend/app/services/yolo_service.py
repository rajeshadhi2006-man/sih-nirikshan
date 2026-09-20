import os
import time
import logging
import cv2
import torch
import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional
from ultralytics import YOLO
from ..config import YOLO_MODEL_PATH, YOLO_CONFIDENCE, YOLO_IMAGE_SIZE, YOLO_IOU_THRESHOLD

logger = logging.getLogger("yolo11")

class YOLOService:
    def __init__(
        self,
        model_path: str = YOLO_MODEL_PATH,
        confidence: float = YOLO_CONFIDENCE,
        iou: float = YOLO_IOU_THRESHOLD,
        imgsz: int = YOLO_IMAGE_SIZE
    ):
        self.model_path = model_path
        self.confidence = confidence
        self.iou = iou
        self.imgsz = imgsz
        self.model: Optional[YOLO] = None
        self.is_loaded = False
        self.device = "cpu"
        self.use_half = False
        self.last_inference_latency_ms = 0.0
        self.inference_count = 0
        
        # Load and configure YOLO model
        self.load_model()

    def load_model(self):
        """
        Loads the local Ultralytics YOLO11 model strictly ONCE at startup.
        Detects CUDA GPU vs CPU, enables FP16 if supported, and warms up the engine.
        """
        try:
            # 1. Hardware Detection
            if torch.cuda.is_available():
                self.device = "cuda:0"
                self.use_half = True
                gpu_name = torch.cuda.get_device_name(0)
                print(f"[YOLO11] Hardware acceleration enabled: CUDA GPU ({gpu_name}) with FP16 Half-Precision")
            else:
                self.device = "cpu"
                self.use_half = False
                cpu_cores = os.cpu_count() or 4
                optimal_threads = max(1, min(4, cpu_cores))
                torch.set_num_threads(optimal_threads)
                print(f"[YOLO11] Running on CPU with {optimal_threads} PyTorch inference threads")

            # 2. Single Model Instantiation
            print(f"[YOLO11] Loading local model from '{self.model_path}'...")
            self.model = YOLO(self.model_path)
            
            # Send model to target device
            if hasattr(self.model, "to"):
                self.model.to(self.device)

            # 3. Model Warmup (eliminates cold-start latency on first live frame)
            print(f"[YOLO11] Warming up model pipeline at resolution {self.imgsz}x{self.imgsz}...")
            dummy_frame = np.zeros((self.imgsz, self.imgsz, 3), dtype=np.uint8)
            with torch.inference_mode():
                self.model.predict(
                    dummy_frame,
                    conf=self.confidence,
                    iou=self.iou,
                    imgsz=self.imgsz,
                    device=self.device,
                    half=self.use_half,
                    verbose=False
                )

            self.is_loaded = True
            print(f"[YOLO11] Model ready: YOLO11n ({len(self.model.names)} classes) on {self.device.upper()} (FP16={self.use_half})")
        except Exception as e:
            print(f"[YOLO11] Error initializing model '{self.model_path}': {e}")
            logger.error(f"YOLO11 load failure: {e}")
            self.is_loaded = False

    def detect_only(self, frame: np.ndarray) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
        """
        Executes ultra-fast YOLO11 detection and ByteTrack tracking on a frame.
        Uses pre-scaling and torch.inference_mode() with autograd disabled.
        Returns parsed detections list and class counts dictionary scaled to original frame resolution.
        """
        if not self.is_loaded or self.model is None or frame is None or frame.size == 0:
            return [], {"person": 0, "vehicle": 0, "total": 0}

        detections: List[Dict[str, Any]] = []
        counts: Dict[str, int] = {"person": 0, "vehicle": 0, "total": 0}

        t_start = time.perf_counter()
        try:
            orig_h, orig_w = frame.shape[:2]
            
            # Ultra-fast pre-scaling to avoid large CPU array normalization overhead
            if max(orig_h, orig_w) > self.imgsz:
                scale_factor = float(self.imgsz) / float(max(orig_h, orig_w))
                infer_w = int(orig_w * scale_factor)
                infer_h = int(orig_h * scale_factor)
                infer_frame = cv2.resize(frame, (infer_w, infer_h), interpolation=cv2.INTER_LINEAR)
                inv_scale_x = float(orig_w) / float(infer_w)
                inv_scale_y = float(orig_h) / float(infer_h)
            else:
                infer_frame = frame
                inv_scale_x = 1.0
                inv_scale_y = 1.0

            with torch.inference_mode():
                results = self.model.track(
                    infer_frame,
                    persist=True,
                    tracker="bytetrack.yaml",
                    conf=self.confidence,
                    iou=self.iou,
                    imgsz=self.imgsz,
                    device=self.device,
                    half=self.use_half,
                    verbose=False
                )

            if results and len(results) > 0:
                result = results[0]
                boxes = result.boxes

                if boxes is not None and len(boxes) > 0:
                    xyxy_arr = boxes.xyxy.cpu().numpy()
                    conf_arr = boxes.conf.cpu().numpy()
                    cls_arr = boxes.cls.cpu().numpy().astype(int)
                    id_arr = boxes.id.cpu().numpy().astype(int) if boxes.id is not None else None

                    names = self.model.names
                    for i in range(len(boxes)):
                        # Scale coordinates back to original frame space
                        x1 = int(xyxy_arr[i][0] * inv_scale_x)
                        y1 = int(xyxy_arr[i][1] * inv_scale_y)
                        x2 = int(xyxy_arr[i][2] * inv_scale_x)
                        y2 = int(xyxy_arr[i][3] * inv_scale_y)
                        
                        conf = float(conf_arr[i])
                        cls_id = int(cls_arr[i])
                        cls_name = names.get(cls_id, f"class_{cls_id}")
                        track_id = int(id_arr[i]) if id_arr is not None else None

                        counts["total"] += 1
                        if cls_name == "person":
                            counts["person"] += 1
                        elif cls_name in ("car", "motorcycle", "bus", "truck", "bicycle", "vehicle"):
                            counts["vehicle"] += 1

                        if cls_name not in counts:
                            counts[cls_name] = 1
                        elif cls_name not in ("person", "vehicle", "total"):
                            counts[cls_name] += 1

                        detections.append({
                            "track_id": track_id,
                            "class": cls_name,
                            "confidence": round(conf, 2),
                            "bbox": {
                                "x1": max(0, min(orig_w - 1, x1)),
                                "y1": max(0, min(orig_h - 1, y1)),
                                "x2": max(0, min(orig_w - 1, x2)),
                                "y2": max(0, min(orig_h - 1, y2))
                            }
                        })

            self.inference_count += 1
            self.last_inference_latency_ms = round((time.perf_counter() - t_start) * 1000, 1)

        except Exception as e:
            logger.error(f"[YOLO11] Inference error: {e}")

        return detections, counts

    def draw_detections_on_frame(self, frame: np.ndarray, detections: List[Dict[str, Any]], in_place: bool = False) -> np.ndarray:
        """
        Fast tactical HUD overlay rendering (< 0.5ms).
        Draws high-contrast bounding boxes, track badges, and confidence labels.
        """
        if frame is None or frame.size == 0:
            return frame

        annotated = frame if in_place else frame.copy()
        if not detections:
            return annotated

        h, w = annotated.shape[:2]

        for det in detections:
            bbox = det.get("bbox", {})
            x1 = max(0, min(w - 1, bbox.get("x1", 0)))
            y1 = max(0, min(h - 1, bbox.get("y1", 0)))
            x2 = max(0, min(w - 1, bbox.get("x2", 0)))
            y2 = max(0, min(h - 1, bbox.get("y2", 0)))

            if x2 <= x1 or y2 <= y1:
                continue

            cls_name = det.get("class", "object")
            conf = det.get("confidence", 0.0)
            track_id = det.get("track_id")

            # Color scheme (BGR)
            if cls_name == "person":
                color = (0, 235, 120)       # Emerald Green for Persons
            elif cls_name in ("car", "motorcycle", "bus", "truck", "bicycle", "vehicle"):
                color = (255, 200, 0)       # Cyan/Blue for Vehicles
            else:
                color = (0, 165, 255)       # Amber for other objects

            # Main bounding rectangle
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            # Tactical corner bracket accents
            corner_len = min(16, (x2 - x1) // 4, (y2 - y1) // 4)
            if corner_len > 2:
                thickness = 3
                # Top-left
                cv2.line(annotated, (x1, y1), (x1 + corner_len, y1), color, thickness)
                cv2.line(annotated, (x1, y1), (x1, y1 + corner_len), color, thickness)
                # Top-right
                cv2.line(annotated, (x2, y1), (x2 - corner_len, y1), color, thickness)
                cv2.line(annotated, (x2, y1), (x2 - corner_len, y1), color, thickness)
                # Bottom-left
                cv2.line(annotated, (x1, y2), (x1 + corner_len, y2), color, thickness)
                cv2.line(annotated, (x1, y2), (x1, y2 - corner_len), color, thickness)
                # Bottom-right
                cv2.line(annotated, (x2, y2), (x2 - corner_len, y2), color, thickness)
                cv2.line(annotated, (x2, y2), (x2 - corner_len, y2), color, thickness)

            # Label text badge
            tag = f"{cls_name.upper()} {int(conf * 100)}%"
            if track_id is not None:
                tag = f"#{track_id} {tag}"

            font = cv2.FONT_HERSHEY_SIMPLEX
            scale = 0.42
            font_thickness = 1
            (tw, th), _ = cv2.getTextSize(tag, font, scale, font_thickness)

            badge_y1 = max(0, y1 - th - 6)
            badge_y2 = y1
            badge_x2 = min(w, x1 + tw + 8)

            cv2.rectangle(annotated, (x1, badge_y1), (badge_x2, badge_y2), (15, 23, 42), -1)  # Slate-900 fill
            cv2.rectangle(annotated, (x1, badge_y1), (badge_x2, badge_y2), color, 1)

            cv2.putText(
                annotated,
                tag,
                (x1 + 4, badge_y2 - 3),
                font,
                scale,
                (255, 255, 255),
                font_thickness,
                cv2.LINE_AA
            )

        return annotated

    def detect_and_track(self, frame: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Synchronous wrapper for detect + draw."""
        detections, counts = self.detect_only(frame)
        annotated_frame = self.draw_detections_on_frame(frame, detections, in_place=False)
        meta = {
            "detections": detections,
            "counts": counts,
            "latency_ms": self.last_inference_latency_ms,
            "device": self.device,
            "status": "LIVE"
        }
        return annotated_frame, meta

    def get_hardware_info(self) -> Dict[str, Any]:
        """Returns runtime hardware and accelerator details."""
        return {
            "device": self.device,
            "half_precision": self.use_half,
            "is_loaded": self.is_loaded,
            "confidence": self.confidence,
            "iou": self.iou,
            "imgsz": self.imgsz,
            "latency_ms": self.last_inference_latency_ms
        }

# Global YOLO service singleton - Loaded once at startup
yolo_service = YOLOService()
