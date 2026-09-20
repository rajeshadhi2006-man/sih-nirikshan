@echo off
TITLE Stop MoSJE Nirikshan Services
echo Stopping all running backend, frontend, and tunnel processes...

taskkill /F /IM cloudflared.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo [OK] All services stopped.
pause
