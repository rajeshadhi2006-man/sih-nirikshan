' MoSJE Nirikshan - Silent Background Launcher
' Starts Backend (8000), Frontend (5173), and Cloudflare Tunnel invisibly in the background.

Set WshShell = CreateObject("WScript.Shell")
strPath = WshShell.CurrentDirectory
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & strPath & "\run_services_permanently.ps1""", 0, False
Set WshShell = Nothing
