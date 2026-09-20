# ==============================================================================
# MoSJE Nirikshan - Permanent Services Runner (Auto-Restart Daemon)
# Runs FastAPI Backend (0.0.0.0:8000) & Vite Web Frontend (0.0.0.0:5173)
# ==============================================================================
$ErrorActionPreference = "Continue"

$webDir = $PSScriptRoot
$logDir = Join-Path $webDir "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " MoSJE Nirikshan - Permanent Service Supervisor Active" -ForegroundColor Green
Write-Host " Working Directory: $webDir" -ForegroundColor Yellow
Write-Host " Available via any network IP on port 5173 (e.g. /users)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# Function to launch & monitor FastAPI backend
$backendScript = {
    param($dir, $log)
    Set-Location $dir
    while ($true) {
        Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting FastAPI Backend on 0.0.0.0:8000..." | Tee-Object -FilePath $log -Append
        python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 2>&1 | Tee-Object -FilePath $log -Append
        Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backend stopped or crashed. Restarting in 3 seconds..." | Tee-Object -FilePath $log -Append
        Start-Sleep -Seconds 3
    }
}

# Function to launch & monitor Vite frontend
$frontendScript = {
    param($dir, $log)
    Set-Location $dir
    while ($true) {
        Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting Vite Web Dashboard on 0.0.0.0:5173..." | Tee-Object -FilePath $log -Append
        npm run dev -- --host 0.0.0.0 --port 5173 2>&1 | Tee-Object -FilePath $log -Append
        Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Frontend stopped or crashed. Restarting in 3 seconds..." | Tee-Object -FilePath $log -Append
        Start-Sleep -Seconds 3
    }
}

# Function to launch & monitor Cloudflare tunnel
$tunnelScript = {
    param($dir, $log, $urlFile)
    Set-Location $dir
    $cloudflaredBin = Join-Path $dir "cloudflared.exe"
    if (-not (Test-Path $cloudflaredBin)) {
        Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] cloudflared.exe not found at $cloudflaredBin" | Tee-Object -FilePath $log -Append
        return
    }

    while ($true) {
        Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting Cloudflare Tunnel to http://localhost:5173..." | Tee-Object -FilePath $log -Append
        
        $procInfo = New-Object System.Diagnostics.ProcessStartInfo
        $procInfo.FileName = $cloudflaredBin
        $procInfo.Arguments = "tunnel --url http://localhost:5173"
        $procInfo.RedirectStandardError = $true
        $procInfo.RedirectStandardOutput = $true
        $procInfo.UseShellExecute = $false
        $procInfo.CreateNoWindow = $true

        $proc = New-Object System.Diagnostics.Process
        $proc.StartInfo = $procInfo
        $proc.Start() | Out-Null

        $urlFound = $false
        while (-not $proc.HasExited) {
            $line = $proc.StandardError.ReadLine()
            if ($line) {
                Add-Content -Path $log -Value $line
                if (-not $urlFound -and $line -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)") {
                    $publicUrl = $matches[1]
                    $urlFound = $true
                    Set-Content -Path $urlFile -Value $publicUrl
                    Write-Output ">>> [ONLINE] Public Tunnel URL: $publicUrl <<<" | Tee-Object -FilePath $log -Append
                }
            }
        }

        Write-Output "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Tunnel disconnected. Restarting in 3 seconds..." | Tee-Object -FilePath $log -Append
        Start-Sleep -Seconds 3
    }
}

$backendLog = Join-Path $logDir "backend.log"
$frontendLog = Join-Path $logDir "frontend.log"
$tunnelLog = Join-Path $logDir "tunnel.log"
$urlFile = Join-Path $webDir "ACTIVE_TUNNEL_URL.txt"

$backendJob = Start-Job -ScriptBlock $backendScript -ArgumentList $webDir, $backendLog
$frontendJob = Start-Job -ScriptBlock $frontendScript -ArgumentList $webDir, $frontendLog
$tunnelJob = Start-Job -ScriptBlock $tunnelScript -ArgumentList $webDir, $tunnelLog, $urlFile

Write-Host "[OK] Backend Job ID: $($backendJob.Id) (logging to $backendLog)" -ForegroundColor Green
Write-Host "[OK] Frontend Job ID: $($frontendJob.Id) (logging to $frontendLog)" -ForegroundColor Green
Write-Host "[OK] Cloudflare Tunnel Job ID: $($tunnelJob.Id) (logging to $tunnelLog)" -ForegroundColor Green
Write-Host "Services are running permanently in the background with auto-restart." -ForegroundColor Green
Write-Host "Detecting public tunnel URL..." -ForegroundColor Cyan

# Wait up to 15 seconds to grab and display the public URL
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $urlFile) {
        $activeUrl = (Get-Content $urlFile -Raw).Trim()
        if ($activeUrl) {
            Write-Host "`n==========================================================" -ForegroundColor Green
            Write-Host " [PUBLIC ONLINE URL]: $activeUrl/dashboard" -ForegroundColor Yellow -BackgroundColor Black
            Write-Host " Saved to: $urlFile" -ForegroundColor Cyan
            Write-Host "==========================================================`n" -ForegroundColor Green
            break
        }
    }
}

Write-Host "Press Ctrl+C to stop all services if running in interactive terminal." -ForegroundColor DarkGray

try {
    while ($true) {
        Start-Sleep -Seconds 10
    }
} finally {
    Stop-Job $backendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob -ErrorAction SilentlyContinue
    Stop-Job $frontendJob -ErrorAction SilentlyContinue
    Remove-Job $frontendJob -ErrorAction SilentlyContinue
    Stop-Job $tunnelJob -ErrorAction SilentlyContinue
    Remove-Job $tunnelJob -ErrorAction SilentlyContinue
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
