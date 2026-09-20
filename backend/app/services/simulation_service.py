import math
import time
import uuid
import json
from datetime import datetime
from typing import Dict, Any, List
from ..database import query_all, execute_commit
from ..websocket.connection_manager import manager
from .geofence_service import check_geofence
from .verification_fusion import fusion_engine

class SimulationService:
    def __init__(self):
        self.is_running = False
        self.step_index = 0
        self.simulated_units = [
            {"id": "U001", "name": "Inspector Rajesh Sharma", "officer_id": "OFF-IND-01", "base_lat": 11.0168, "base_lng": 76.9558, "pattern": "circle"},
            {"id": "U002", "name": "Sub-Inspector Priya Nair", "officer_id": "OFF-IND-02", "base_lat": 11.0185, "base_lng": 76.9572, "pattern": "patrol"},
            {"id": "U003", "name": "Constable Vikram Singh", "officer_id": "OFF-IND-03", "base_lat": 11.0150, "base_lng": 76.9540, "pattern": "breach"},
        ]

    def status(self) -> Dict[str, Any]:
        return {
            "is_running": self.is_running,
            "step_index": self.step_index,
            "simulated_units_count": len(self.simulated_units),
            "mode": "DEMO_SIMULATION"
        }

    async def step(self) -> List[Dict[str, Any]]:
        self.step_index += 1
        now_str = datetime.utcnow().isoformat() + "Z"
        geofences = query_all("SELECT * FROM geofences WHERE is_active = 1")
        primary_geo = geofences[0] if geofences else {
            "center_latitude": 11.0168,
            "center_longitude": 76.9558,
            "radius_meters": 350.0,
            "name": "SIH Tactical Command Perimeter"
        }

        updates = []
        angle = (self.step_index * 15) % 360
        rad = math.radians(angle)

        for u in self.simulated_units:
            u_id = u["id"]
            pattern = u["pattern"]

            if pattern == "circle":
                # Patrols securely inside perimeter
                offset_lat = 0.0012 * math.cos(rad)
                offset_lng = 0.0012 * math.sin(rad)
                spd = 14.5
            elif pattern == "patrol":
                # Linear back-and-forth route
                offset_lat = 0.0018 * math.sin(rad)
                offset_lng = 0.0009 * math.cos(rad)
                spd = 18.2
            else: # breach
                # Periodically steps outside to demonstrate real-time alerts
                scale = 0.0045 if (self.step_index % 8 >= 4) else 0.0010
                offset_lat = scale * math.cos(rad)
                offset_lng = scale * math.sin(rad)
                spd = 28.0

            curr_lat = u["base_lat"] + offset_lat
            curr_lng = u["base_lng"] + offset_lng

            # Check geofence status
            check = check_geofence(
                curr_lat, curr_lng,
                primary_geo["center_latitude"], primary_geo["center_longitude"],
                primary_geo["radius_meters"]
            )
            is_inside = check["is_inside"]
            status_str = "inside" if is_inside else "outside"

            # Check for breach event
            if not is_inside:
                alert_id = f"alt-sim-{int(time.time() * 1000)}"
                alert_title = "🚨 SIMULATED PERIMETER BREACH"
                alert_desc = f"[DEMO MODE] Officer {u['name']} crossed {primary_geo['name']} boundary by {abs(check['delta_meters'])}m."
                execute_commit(
                    """INSERT INTO alerts (id, user_id, user_name, officer_id, severity, alert_type, title, description, status, created_at)
                       VALUES (?, ?, ?, ?, 'CRITICAL', 'GEOFENCE_BREACH', ?, ?, 'ACTIVE', ?)""",
                    (alert_id, u_id, u["name"], u["officer_id"], alert_title, alert_desc, now_str)
                )
                await manager.broadcast({
                    "type": "ALERT_NEW",
                    "event": "ALERT_NEW",
                    "data": {
                        "id": alert_id,
                        "user_id": u_id,
                        "user_name": u["name"],
                        "officer_id": u["officer_id"],
                        "severity": "CRITICAL",
                        "alert_type": "GEOFENCE_BREACH",
                        "title": alert_title,
                        "description": alert_desc,
                        "status": "ACTIVE",
                        "created_at": now_str,
                        "is_simulated": True
                    }
                })

            # Record location update
            execute_commit(
                """INSERT INTO locations (user_id, latitude, longitude, accuracy, speed, heading, timestamp, status, is_inside_geofence, geofence_id, updated_at)
                   VALUES (?, ?, ?, 4.5, ?, ?, ?, 'online', ?, ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET
                     latitude=excluded.latitude,
                     longitude=excluded.longitude,
                     accuracy=excluded.accuracy,
                     speed=excluded.speed,
                     heading=excluded.heading,
                     timestamp=excluded.timestamp,
                     status=excluded.status,
                     is_inside_geofence=excluded.is_inside_geofence,
                     geofence_id=excluded.geofence_id,
                     updated_at=excluded.updated_at""",
                (u_id, curr_lat, curr_lng, spd, float(angle), now_str, 1 if is_inside else 0, primary_geo.get("id"), now_str)
            )

            # Record breadcrumb history
            execute_commit(
                """INSERT INTO location_history (user_id, latitude, longitude, accuracy, speed, heading, timestamp, is_inside_geofence, geofence_id, created_at)
                   VALUES (?, ?, ?, 4.5, ?, ?, ?, ?, ?, ?)""",
                (u_id, curr_lat, curr_lng, spd, float(angle), now_str, 1 if is_inside else 0, primary_geo.get("id"), now_str)
            )

            # Broadcast via WebSocket matching Section 8 schema
            payload = {
                "user_id": u_id,
                "officer_id": u["officer_id"],
                "full_name": u["name"],
                "latitude": round(curr_lat, 6),
                "longitude": round(curr_lng, 6),
                "accuracy": 4.5,
                "speed": spd,
                "heading": float(angle),
                "timestamp": now_str,
                "status": "online",
                "is_inside_geofence": is_inside,
                "geofence_status": "INSIDE" if is_inside else "OUTSIDE",
                "is_simulated": True
            }

            await manager.broadcast_location_update(
                user_id=u_id,
                lat=curr_lat,
                lng=curr_lng,
                status=status_str,
                accuracy=4.5,
                full_payload=payload
            )

            updates.append(payload)

        return updates

simulator = SimulationService()
