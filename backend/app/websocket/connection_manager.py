import json
import logging
from typing import List, Dict, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger("websocket")

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_sockets: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: Optional[str] = None):
        await websocket.accept()
        if websocket not in self.active_connections:
            self.active_connections.append(websocket)
        if user_id:
            self.user_sockets[user_id] = websocket
        logger.info(f"WebSocket client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket, user_id: Optional[str] = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if user_id and user_id in self.user_sockets:
            self.user_sockets.pop(user_id, None)
        logger.info(f"WebSocket client disconnected. Total: {len(self.active_connections)}")

    async def send_personal(self, message: Dict[str, Any], websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.warning(f"Failed to send personal message: {e}")
            self.disconnect(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcasts event payload to all connected consoles and mobile transmitters."""
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)
        for dead in dead_connections:
            self.disconnect(dead)

    async def broadcast_location_update(self, user_id: str, lat: float, lng: float, status: str, accuracy: float = 5.0, full_payload: Optional[Dict[str, Any]] = None):
        """Conforms to both the prompt Section 8 schema and the live telemetry schema."""
        # Standard Section 8 event format
        msg_standard = {
            "type": "LOCATION_UPDATE",
            "event": "LOCATION_UPDATE",
            "user_id": user_id,
            "latitude": lat,
            "longitude": lng,
            "status": status.lower(),
            "geofence_status": status.upper(),
            "accuracy": accuracy,
            "data": full_payload or {
                "user_id": user_id,
                "latitude": lat,
                "longitude": lng,
                "accuracy": accuracy,
                "status": status.lower(),
                "geofence_status": status.upper()
            }
        }
        await self.broadcast(msg_standard)

manager = ConnectionManager()
