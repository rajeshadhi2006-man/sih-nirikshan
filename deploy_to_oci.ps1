<#
.SYNOPSIS
    Deploys the SIH Nirikshan National Command Center to an Oracle Cloud Infrastructure (OCI) Compute Instance.
.PARAMETER OracleVmIp
    The Public IPv4 Address of your Oracle Cloud Compute VM.
.PARAMETER SshKeyPath
    The absolute path to your SSH private key (.key or .pem) downloaded from Oracle Cloud.
.PARAMETER SshUser
    The SSH username. Default is 'ubuntu' (for Ubuntu images) or 'opc' (for Oracle Linux images).
#>

param (
    [Parameter(Mandatory=$false)]
    [string]$OracleVmIp = "",

    [Parameter(Mandatory=$false)]
    [string]$SshKeyPath = "",

    [Parameter(Mandatory=$false)]
    [string]$SshUser = ""
)

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "   ORACLE CLOUD INFRASTRUCTURE (OCI) COMPLETE DEPLOYER                " -ForegroundColor Green
Write-Host "   National Command Center - MoSJE Nirikshan                          " -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Prompt for VM IP if not provided
if (-not $OracleVmIp) {
    $OracleVmIp = Read-Host -Prompt "Enter your Oracle Cloud VM Public IP"
    if ($OracleVmIp) {
        $OracleVmIp = $OracleVmIp.Trim()
    }
}

if (-not $OracleVmIp) {
    Write-Error "VM Public IP is required. Exiting."
    exit 1
}

# 2. Prompt for SSH Key Path if not provided
if (-not $SshKeyPath) {
    $defaultKeyCandidates = @(
        "$HOME\.ssh\id_rsa",
        "$HOME\.ssh\id_ed25519",
        "$HOME\Downloads\ssh-key*.key",
        "$HOME\Downloads\*.pem"
    )
    
    $foundKey = $null
    foreach ($candidate in $defaultKeyCandidates) {
        $matches = Get-ChildItem -Path $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($matches) {
            $foundKey = $matches.FullName
            break
        }
    }

    if ($foundKey) {
        Write-Host "Auto-detected SSH key candidate: $foundKey" -ForegroundColor DarkGray
        $useFound = Read-Host -Prompt "Use this key? [Y/N, default Y]"
        if (-not $useFound -or $useFound.ToUpper() -eq "Y") {
            $SshKeyPath = $foundKey
        }
    }

    if (-not $SshKeyPath) {
        $SshKeyPath = Read-Host -Prompt "Enter full path to your Oracle SSH private key"
        if ($SshKeyPath) {
            $SshKeyPath = $SshKeyPath.Trim('"')
        }
    }
}

if (-not (Test-Path -Path $SshKeyPath)) {
    Write-Error "SSH Key file not found at: $SshKeyPath"
    exit 1
}

# 3. Detect / Select SSH Username (ubuntu or opc)
if (-not $SshUser) {
    Write-Host ""
    Write-Host "Testing SSH connection to $OracleVmIp..." -ForegroundColor Cyan
    # Try ubuntu first
    $testUbuntu = ssh -i "$SshKeyPath" -o StrictHostKeyChecking=no -o ConnectTimeout=5 -q "ubuntu@$OracleVmIp" "echo ok" 2>$null
    if ($testUbuntu -match "ok") {
        $SshUser = "ubuntu"
        Write-Host "Detected Ubuntu image (user: ubuntu)" -ForegroundColor Green
    } else {
        # Try opc (Oracle Linux standard)
        $testOpc = ssh -i "$SshKeyPath" -o StrictHostKeyChecking=no -o ConnectTimeout=5 -q "opc@$OracleVmIp" "echo ok" 2>$null
        if ($testOpc -match "ok") {
            $SshUser = "opc"
            Write-Host "Detected Oracle Linux image (user: opc)" -ForegroundColor Green
        } else {
            Write-Host "Could not determine user automatically. Defaulting to 'ubuntu'." -ForegroundColor Yellow
            $SshUser = "ubuntu"
        }
    }
}

Write-Host "Connecting as: $SshUser@$OracleVmIp" -ForegroundColor Cyan

# 4. Sync latest local git changes to GitHub so the remote VM pulls the latest files
Write-Host ""
Write-Host "Syncing latest local changes with GitHub..." -ForegroundColor Cyan
git add .
$changes = git status --porcelain
if ($changes) {
    git commit -m "OCI Cloud Deployment manifests and automated configuration"
    git push origin main
    Write-Host "Pushed latest changes to GitHub repository." -ForegroundColor Green
} else {
    Write-Host "Repository is up-to-date." -ForegroundColor Green
}

# 5. Execute Remote Deployment Script
Write-Host ""
Write-Host "Executing deployment on Oracle Cloud VM..." -ForegroundColor Cyan

$cmd = "curl -fsSL https://raw.githubusercontent.com/rajeshadhi2006-man/sih-nirikshan/main/deploy/oracle/deploy_oracle_cloud.sh | sudo bash"
ssh -i "$SshKeyPath" -o StrictHostKeyChecking=no "$SshUser@$OracleVmIp" $cmd

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "Oracle Cloud Deployment command finished!" -ForegroundColor Green
Write-Host "Access your web application at: http://$OracleVmIp" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Green
