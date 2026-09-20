from typing import Dict, Any, Optional
from ..config import DEFAULT_FACE_THRESHOLD, DEFAULT_VOICE_THRESHOLD, DEFAULT_GPS_TOLERANCE_METERS

class VerificationFusionEngine:
    def __init__(self):
        self.face_threshold = DEFAULT_FACE_THRESHOLD
        self.voice_threshold = DEFAULT_VOICE_THRESHOLD
        self.gps_tolerance_meters = DEFAULT_GPS_TOLERANCE_METERS
        self.engine_mode = "PRODUCTION_AI" # PRODUCTION_AI | DEMO_MOCK

    def update_config(self, face_threshold: Optional[float] = None, voice_threshold: Optional[float] = None, gps_tolerance: Optional[float] = None, engine_mode: Optional[str] = None):
        if face_threshold is not None:
            self.face_threshold = face_threshold
        if voice_threshold is not None:
            self.voice_threshold = voice_threshold
        if gps_tolerance is not None:
            self.gps_tolerance_meters = gps_tolerance
        if engine_mode is not None:
            self.engine_mode = engine_mode

    def get_config(self) -> Dict[str, Any]:
        return {
            "face_threshold": self.face_threshold,
            "voice_threshold": self.voice_threshold,
            "gps_tolerance_meters": self.gps_tolerance_meters,
            "engine_mode": self.engine_mode,
            "description": "Multi-Factor Biometric & GNSS Geofence Fusion Engine"
        }

    def fuse(
        self,
        user_id: str,
        face_score: Optional[float],
        voice_score: Optional[float],
        accuracy_meters: float,
        is_inside_geofence: bool,
        is_spoof: bool = False
    ) -> Dict[str, Any]:
        """
        Fuses GPS validation, face match, voice match, and geofence containment.
        GPS Valid: accuracy <= gps_tolerance_meters
        Face Valid: face_score >= face_threshold
        Voice Valid: voice_score >= voice_threshold
        Geofence Valid: is_inside_geofence is True
        """
        gps_valid = accuracy_meters <= self.gps_tolerance_meters

        # In DEMO_MOCK mode, default to high simulated scores if none provided
        if self.engine_mode == "DEMO_MOCK":
            actual_face = face_score if face_score is not None else (97.8 if not is_spoof else 42.0)
            actual_voice = voice_score if voice_score is not None else (94.6 if not is_spoof else 38.5)
        else:
            # In PRODUCTION_AI mode, requires cryptographic feature vector verification
            actual_face = face_score if face_score is not None else 0.0
            actual_voice = voice_score if voice_score is not None else 0.0

        face_passed = actual_face >= self.face_threshold and not is_spoof
        voice_passed = actual_voice >= self.voice_threshold and not is_spoof

        # Multi-factor decision
        is_verified = gps_valid and is_inside_geofence and face_passed and voice_passed

        # Calculate final weighted confidence score
        confidence = (
            (actual_face * 0.40) +
            (actual_voice * 0.35) +
            (25.0 if (gps_valid and is_inside_geofence) else 0.0)
        )
        final_confidence = round(min(100.0, max(0.0, confidence)), 1)

        result_status = "VERIFIED" if is_verified else "SUSPICIOUS / FAILED"

        reasons = []
        if not gps_valid:
            reasons.append(f"GPS horizontal accuracy degraded ({accuracy_meters}m > {self.gps_tolerance_meters}m tolerance)")
        if not is_inside_geofence:
            reasons.append("Subject is located outside authorized perimeter zone")
        if not face_passed:
            reasons.append(f"Face match score ({actual_face}%) fell below threshold ({self.face_threshold}%)")
        if not voice_passed:
            reasons.append(f"Voice match score ({actual_voice}%) fell below threshold ({self.voice_threshold}%)")
        if is_spoof:
            reasons.append("Biometric liveness failure: Presentation Attack / Spoof Detected")

        return {
            "user_id": user_id,
            "engine_mode": self.engine_mode,
            "face_score": actual_face,
            "face_passed": face_passed,
            "voice_score": actual_voice,
            "voice_passed": voice_passed,
            "gps_valid": gps_valid,
            "geofence_status": "INSIDE" if is_inside_geofence else "OUTSIDE",
            "final_confidence": final_confidence,
            "result": result_status,
            "is_verified": is_verified,
            "reasons": reasons
        }

fusion_engine = VerificationFusionEngine()
