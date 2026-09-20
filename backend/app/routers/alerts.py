import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException
from ..models.schemas import AlertCreateRequest, AlertResolveRequest
from ..database import query_all, query_one, execute_commit
from ..websocket.connection_manager import manager
from ..services.supabase_service import execute_supabase_upsert

router = APIRouter(prefix="/api/alerts", tags=["Incident & Alert Management"])

@router.get("")
def get_alerts(status: Optional[str] = None):
    """Returns alerts with optional status filter (ACTIVE | RESOLVED)."""
    if status:
        return query_all("SELECT * FROM alerts WHERE status = ? ORDER BY created_at DESC", (status.upper(),))
    return query_all("SELECT * FROM alerts ORDER BY created_at DESC")

@router.post("")
async def create_alert(req: AlertCreateRequest):
    """Creates a new incident alert and broadcasts ALERT_NEW over WebSocket."""
    now_str = datetime.utcnow().isoformat() + "Z"
    alert_id = str(uuid.uuid4())

    execute_commit(
        """INSERT INTO alerts (id, user_id, user_name, officer_id, severity, alert_type, title, description, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)""",
        (alert_id, req.user_id, f"Officer {req.user_id}", req.user_id, req.severity.upper(),
         req.alert_type.upper(), req.title, req.description, now_str)
    )

    try:
        execute_supabase_upsert("alerts", {
            "id": alert_id,
            "user_id": req.user_id,
            "user_name": f"Officer {req.user_id}",
            "officer_id": req.user_id,
            "severity": req.severity.upper(),
            "alert_type": req.alert_type.upper(),
            "title": req.title,
            "description": req.description,
            "status": "ACTIVE"
        })
        print(f"[DATABASE] alert saved to Supabase: {alert_id}")
    except Exception as e:
        print(f"Error persisting alert to Supabase: {e}")

    alert_obj = query_one("SELECT * FROM alerts WHERE id = ?", (alert_id,))

    await manager.broadcast({
        "type": "ALERT_NEW",
        "event": "ALERT_NEW",
        "data": dict(alert_obj)
    })

    return {"success": True, "alert": dict(alert_obj)}

@router.put("/{alert_id}/resolve")
async def resolve_alert(alert_id: str, req: Optional[AlertResolveRequest] = None):
    """Resolves an active incident alert."""
    existing = query_one("SELECT * FROM alerts WHERE id = ?", (alert_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="Alert not found.")

    execute_commit("UPDATE alerts SET status = 'RESOLVED' WHERE id = ?", (alert_id,))
    updated = query_one("SELECT * FROM alerts WHERE id = ?", (alert_id,))

    await manager.broadcast({
        "type": "ALERT_RESOLVED",
        "event": "ALERT_RESOLVED",
        "data": dict(updated)
    })

    return {"success": True, "alert": dict(updated)}

@router.delete("")
@router.delete("/all")
async def delete_all_alerts(status: Optional[str] = None):
    """Deletes all alerts, or all alerts matching a status filter (ACTIVE | RESOLVED)."""
    now_str = datetime.utcnow().isoformat() + "Z"
    if status and status.upper() != 'ALL':
        execute_commit("DELETE FROM alerts WHERE status = ?", (status.upper(),))
        msg = f"All {status.upper()} alerts deleted."
    else:
        execute_commit("DELETE FROM alerts")
        msg = "All incident alerts deleted."

    # Audit log
    execute_commit(
        """INSERT INTO audit_logs (id, officer_id, officer_name, action, target, result, details, ip_address, created_at)
           VALUES (?, 'SYS-COMMAND', 'Command Center Officer', 'ALERTS_CLEARED', 'Alerts Ledger', 'SUCCESS', ?, '127.0.0.1', ?)""",
        (f"log-clr-{uuid.uuid4().hex[:8]}", msg, now_str)
    )

    # Supabase best-effort purge
    try:
        from ..services.supabase_service import get_supabase_client
        client = get_supabase_client()
        if client:
            if status and status.upper() != 'ALL':
                client.table("alerts").delete().eq("status", status.upper()).execute()
            else:
                client.table("alerts").delete().neq("id", "none").execute()
    except Exception as e:
        print(f"[Supabase Alerts Delete Sync Notice]: {e}")

    # Broadcast WebSocket event
    await manager.broadcast({
        "type": "ALERTS_CLEARED",
        "event": "ALERTS_CLEARED",
        "data": {
            "status": status or "ALL",
            "message": msg,
            "timestamp": now_str
        }
    })

    return {"success": True, "message": msg}

@router.delete("/{alert_id}")
async def delete_alert(alert_id: str):
    """Deletes an alert record."""
    execute_commit("DELETE FROM alerts WHERE id = ?", (alert_id,))

    # Supabase sync
    try:
        from ..services.supabase_service import get_supabase_client
        client = get_supabase_client()
        if client:
            client.table("alerts").delete().eq("id", alert_id).execute()
    except Exception as e:
        pass

    await manager.broadcast({
        "type": "ALERT_DELETED",
        "event": "ALERT_DELETED",
        "data": {"alert_id": alert_id}
    })

    return {"success": True, "message": f"Alert {alert_id} deleted."}

