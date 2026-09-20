@echo off
TITLE Deploy MoSJE Nirikshan to Cloudflare Pages
cd /d "%~dp0"

echo ==============================================================================
echo   Deploying MoSJE Nirikshan Frontend to Cloudflare Pages (24/7 Edge)
echo ==============================================================================
echo.

echo Building production bundle...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. Please check errors above.
    pause
    exit /b %errorlevel%
)

echo.
echo Deploying to Cloudflare Pages via Wrangler...
echo (If you are not logged in, a browser window will open to authorize Cloudflare)
echo.
npx -y wrangler pages deploy dist --project-name sih-nirikshan

echo.
echo ==============================================================================
echo  Deployment complete! Check your Cloudflare Pages URL printed above.
echo ==============================================================================
pause
