@echo off
TITLE Create and Push MoSJE Nirikshan to GitHub
cd /d "%~dp0"

echo ==============================================================================
echo  Creating and Pushing MoSJE Nirikshan to GitHub (rajeshadhi2006-man)
echo ==============================================================================
echo.

python create_github_repo_and_push.py sih-nirikshan

echo.
pause
