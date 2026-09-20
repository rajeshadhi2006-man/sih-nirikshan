import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from ..database import query_all, query_one, execute_commit

router = APIRouter(prefix="/api/devices", tags=["Hardware & Mobile Devices"])

class DeviceRegisterRequest(BaseModel):
    device_id: str = Field(..., example="DEV-FLUTTER-01")
    user_id: Optional[str] = Field(None, example="U001")
    device_type: str = Field("FLUTTER_USER_APP", example="FLUTTER_USER_APP")
    os_version: Optional[str] = Field("Android 14", example="Android 14")
    app_version: Optional[str] = Field("1.0.0", example="1.0.0")

@router.get("")
def get_devices():
    """Fetch registered devices & heartbeats."""
    return query_all("SELECT * FROM devices ORDER BY last_heartbeat DESC")

@router.post("")
def register_device(req: DeviceRegisterRequest):
    """Register or heartbeat a device."""
    now_str = datetime.utcnow().isoformat() + "Z"
    existing = query_one("SELECT * FROM devices WHERE device_id = ?", (req.device_id,))

    if existing:
        execute_commit(
            """UPDATE devices SET user_id = ?, device_type = ?, os_version = ?, app_version = ?, last_heartbeat = ?
               WHERE device_id = ?""",
            (req.user_id, req.device_type, req.os_version, req.app_version, now_str, req.device_id)
        )
        dev_id = existing["id"]
    else:
        dev_id = f"dev-{uuid.uuid4().hex[:8]}"
        execute_commit(
            """INSERT INTO devices (id, device_id, user_id, device_type, os_version, app_version, last_heartbeat, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (dev_id, req.device_id, req.user_id, req.device_type, req.os_version, req.app_version, now_str, now_str)
        )

    return {"success": True, "device": query_one("SELECT * FROM devices WHERE id = ?", (dev_id,))}
