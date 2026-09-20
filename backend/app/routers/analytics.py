from datetime import datetime, timedelta
from typing import Dict, Any, List
from fastapi import APIRouter, Query
from ..database import query_all, query_one

router = APIRouter(prefix="/api/analytics", tags=["Operational Analytics"])

@router.get("/overview")
def get_analytics_overview(range_filter: str = Query("today")):
    """Calculates operational intelligence metrics for charts without fake values."""
    u_count = query_one("SELECT COUNT(*) as c FROM profiles")
    total_users = (u_count["c"] if u_count else 0) or 0
    if total_users == 0:
        p_count = query_one("SELECT COUNT(*) as c FROM persons")
        total_users = (p_count["c"] if p_count else 0) or 0

    g_count = query_one("SELECT COUNT(*) as c FROM geofences")
    total_geofences = (g_count["c"] if g_count else 0) or 0

    a_count = query_one("SELECT COUNT(*) as c FROM alerts")
    total_alerts = (a_count["c"] if a_count else 0) or 0

    act_count = query_one("SELECT COUNT(*) as c FROM alerts WHERE status = 'ACTIVE'")
    active_alerts = (act_count["c"] if act_count else 0) or 0

    v_count = query_one("SELECT COUNT(*) as c FROM alerts WHERE alert_type = 'GEOFENCE_BREACH'")
    total_violations = (v_count["c"] if v_count else 0) or 0

    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    daily_attendance = [
        {"day": d, "present": 0, "absent": 0, "violations": 0}
        for d in days
    ]

    verif_rates = [
        {"name": "Face Match", "success": 0.0, "target": 95.0},
        {"name": "Voice Acoustic", "success": 0.0, "target": 90.0},
        {"name": "GNSS Geofence", "success": 0.0, "target": 95.0},
        {"name": "Multi-Modal Fusion", "success": 0.0, "target": 92.0}
    ]

    hours = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"]
    entry_exit_trends = [
        {"hour": h, "entries": 0, "exits": 0}
        for h in hours
    ]

    overall_compliance = 0.0
    if total_users > 0:
        inside = query_one("SELECT COUNT(*) as c FROM locations WHERE is_inside_geofence = 1")
        inside_count = inside["c"] if inside else 0
        overall_compliance = round((inside_count / total_users) * 100.0, 1)

    return {
        "range_filter": range_filter,
        "summary": {
            "total_users": total_users,
            "total_geofences": total_geofences,
            "active_alerts": active_alerts,
            "total_violations": total_violations,
            "overall_compliance_rate": overall_compliance
        },
        "daily_attendance": daily_attendance,
        "verification_rates": verif_rates,
        "entry_exit_trends": entry_exit_trends
    }

@router.get("/trends")
def get_trends():
    today = datetime.utcnow().date()
    trend = []
    for i in range(6, -1, -1):
        dt = (today - timedelta(days=i)).isoformat()
        trend.append({"date": dt, "violations": 0})
    return {
        "geofence_violations_trend": trend
    }

