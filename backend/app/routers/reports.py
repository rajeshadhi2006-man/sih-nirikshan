import csv
import io
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Query, Response
from ..database import query_all

router = APIRouter(prefix="/api/reports", tags=["Official Government Audit Reports"])

@router.get("/attendance")
def get_attendance_report(department: Optional[str] = None):
    """Muster Roll & Attendance Audit Report."""
    if department and department != "ALL":
        return query_all(
            """SELECT a.*, p.full_name, p.department FROM attendance a
               JOIN profiles p ON a.user_id = p.id OR a.officer_id = p.officer_id
               WHERE p.department = ? ORDER BY a.created_at DESC""",
            (department,)
        )
    return query_all("SELECT * FROM attendance ORDER BY created_at DESC LIMIT 100")

@router.get("/violations")
def get_violations_report():
    """Perimeter Breach & Geofence Violation Audit Report."""
    return query_all("SELECT * FROM alerts WHERE alert_type = 'GEOFENCE_BREACH' ORDER BY created_at DESC LIMIT 100")

@router.get("/verifications")
def get_verifications_report():
    """Biometric Multi-Modal Verification Assurance Report."""
    return query_all("SELECT * FROM verification_results ORDER BY timestamp DESC LIMIT 100")

@router.get("/summary")
def get_reports_summary():
    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "available_reports": [
            "attendance",
            "violations",
            "verifications",
            "alerts",
            "activity"
        ],
        "export_formats": ["CSV", "JSON"]
    }

@router.get("/export-csv")
def export_csv(report_type: str = Query("attendance")):
    """Generates server-side streaming RFC-4180 CSV export."""
    if report_type == "attendance":
        data = query_all("SELECT id, user_id, officer_id, date, check_in_time, check_out_time, status, geofence_verified FROM attendance ORDER BY created_at DESC LIMIT 500")
    elif report_type == "violations":
        data = query_all("SELECT id, user_id, user_name, severity, alert_type, title, description, status, created_at FROM alerts WHERE alert_type = 'GEOFENCE_BREACH' LIMIT 500")
    elif report_type == "verifications":
        data = query_all("SELECT id, user_id, face_score, voice_score, gps_valid, geofence_status, final_confidence, result, timestamp FROM verification_results LIMIT 500")
    else:
        data = query_all("SELECT id, officer_name, action, target, result, ip_address, created_at FROM audit_logs LIMIT 500")

    if not data:
        data = [{"message": "No records found"}]

    output = io.StringIO()
    headers = list(data[0].keys())
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    for row in data:
        writer.writerow(row)

    csv_content = output.getvalue()
    filename = f"Govt_Report_{report_type.upper()}_{datetime.utcnow().strftime('%Y%m%d')}.csv"

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
