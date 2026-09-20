@echo off
TITLE Add MoSJE Nirikshan to Windows Startup
cd /d "%~dp0"

echo ================================================================
echo  Adding MoSJE Nirikshan Auto-Start to Windows Startup Folder...
echo ================================================================

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_VBS=%TEMP%\CreateShortcut.vbs"

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%SHORTCUT_VBS%"
echo sLinkFile = "%STARTUP_DIR%\MoSJE_Nirikshan_Background.lnk" >> "%SHORTCUT_VBS%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%SHORTCUT_VBS%"
echo oLink.TargetPath = "wscript.exe" >> "%SHORTCUT_VBS%"
echo oLink.Arguments = """%~dp0start_services_background.vbs""" >> "%SHORTCUT_VBS%"
echo oLink.WorkingDirectory = "%~dp0" >> "%SHORTCUT_VBS%"
echo oLink.Description = "MoSJE Nirikshan Always-Online Background Services" >> "%SHORTCUT_VBS%"
echo oLink.Save >> "%SHORTCUT_VBS%"

cscript //nologo "%SHORTCUT_VBS%"
del "%SHORTCUT_VBS%"

echo [SUCCESS] MoSJE Nirikshan has been added to your Windows Startup!
echo Whenever your PC turns on or you log in, your Backend, Frontend,
echo and Cloudflare Tunnel will start automatically in the background.
echo.
pause
