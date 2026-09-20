@echo off
TITLE Deploy MoSJE Nirikshan to Vercel
cd /d "%~dp0"

echo ==============================================================================
echo   Deploying MoSJE Nirikshan Frontend to Vercel (Production)
echo ==============================================================================
echo.

set /p BACKEND_URL="Enter your Render Backend URL (or leave empty to configure later): "

if not "%BACKEND_URL%"=="" (
    echo Setting VITE_API_BASE_URL to %BACKEND_URL%
    set "VITE_API_BASE_URL=%BACKEND_URL%"
)

echo Building production bundle...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. Please check errors above.
    pause
    exit /b %errorlevel%
)

echo.
echo Deploying to Vercel...
vercel --prod

echo.
echo ==============================================================================
echo  Deployment complete! Check your Vercel URL printed above.
echo ==============================================================================
pause
