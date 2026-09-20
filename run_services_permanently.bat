@echo off
TITLE MoSJE Nirikshan - Permanent Services (Backend + Frontend)
cd /d "%~dp0"

echo ==========================================================
echo  MoSJE Nirikshan Permanent Server Launcher
echo  Host: 0.0.0.0
echo  Frontend: http://localhost:5173/dashboard
echo  Backend:  http://localhost:8000/api
echo  Tunnel:   Cloudflare Quick Tunnel (Public Internet)
echo ==========================================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_services_permanently.ps1"
pause
