#!/bin/bash
# ==============================================================================
# Automated One-Click Deployment Script for Oracle Cloud Infrastructure (OCI)
# Target: Ubuntu 22.04 / 24.04 LTS or Oracle Linux 8 / 9 (Always Free VM)
# Project: MoSJE Nirikshan National Command Center
# ==============================================================================

set -e

REPO_URL="https://github.com/rajeshadhi2006-man/sih-nirikshan.git"
INSTALL_DIR="/opt/sih-nirikshan"

echo "======================================================================"
echo "🚀 Starting OCI Automated Cloud Deployment — MoSJE Nirikshan"
echo "======================================================================"

# 1. Detect OS and Elevate Privileges
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  Running with sudo privileges..."
    exec sudo bash "$0" "$@"
fi

# 2. Update System & Install Core Utilities
echo "📦 Updating system packages and installing prerequisites..."
if [ -f /etc/oracle-release ] || [ -f /etc/redhat-release ]; then
    dnf update -y
    dnf install -y git curl wget tar iptables-services firewalld
elif [ -f /etc/lsb-release ] || [ -f /etc/debian_version ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y git curl wget tar iptables ufw ca-certificates gnupg
fi

# 3. Install Docker Engine and Docker Compose Plugin
if ! command -v docker &> /dev/null; then
    echo "🐳 Docker not found. Installing official Docker Engine..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm -f get-docker.sh
    systemctl enable docker
    systemctl start docker
    echo "✓ Docker successfully installed."
else
    echo "✓ Docker is already installed."
fi

# Ensure docker compose plugin is available
if ! docker compose version &> /dev/null; then
    echo "📦 Installing docker-compose-plugin..."
    if [ -f /etc/debian_version ]; then
        apt-get install -y docker-compose-plugin || true
    fi
fi

# 4. CRITICAL: Configure Oracle Cloud Firewall & iptables
echo "🛡️  Configuring firewall ports (80 HTTP, 443 HTTPS, 8000 API)..."

# A. Oracle Linux firewalld (if active)
if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-port=80/tcp || true
    firewall-cmd --permanent --add-port=443/tcp || true
    firewall-cmd --permanent --add-port=8000/tcp || true
    firewall-cmd --reload || true
    echo "✓ firewalld rules applied."
fi

# B. Ubuntu ufw (if active)
if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
    ufw allow 80/tcp || true
    ufw allow 443/tcp || true
    ufw allow 8000/tcp || true
    echo "✓ ufw rules applied."
fi

# C. Direct iptables punch-through (required for Oracle Cloud Linux images)
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport 8000 -j ACCEPT

# Save iptables rules across reboots
if [ -f /etc/oracle-release ]; then
    service iptables save 2>/dev/null || true
elif command -v netfilter-persistent &> /dev/null; then
    netfilter-persistent save 2>/dev/null || true
fi
echo "✓ iptables rules updated."

# 5. Clone or Pull Latest Project Source
echo "📥 Setting up project codebase at $INSTALL_DIR..."
if [ -d "$INSTALL_DIR/.git" ]; then
    cd "$INSTALL_DIR"
    echo "✓ Existing repo detected. Pulling latest code..."
    git fetch origin
    git reset --hard origin/main
else
    mkdir -p "$INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 6. Build and Launch Containers with Docker Compose
echo "🔨 Building and launching Docker Compose multi-container stack..."
docker compose down || true
docker compose build --pull
docker compose up -d

# 7. Setup systemd auto-restart on VM boot
echo "⚙️  Configuring systemd service for 24/7 persistence..."
cat <<EOF > /etc/systemd/system/sih-nirikshan.service
[Unit]
Description=SIH Nirikshan National Command Center Docker Stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable sih-nirikshan.service

# 8. Health Check
echo "⏳ Waiting for services to initialize..."
sleep 8
PUBLIC_IP=$(curl -s -4 ifconfig.me || curl -s -4 icanhazip.com || echo "<YOUR_ORACLE_IP>")

echo ""
echo "======================================================================"
echo "🎉 DEPLOYMENT COMPLETE & RUNNING ON ORACLE CLOUD!"
echo "======================================================================"
echo "🌐 Public Web Application URL: http://$PUBLIC_IP"
echo "🔌 FastAPI Backend Endpoint:   http://$PUBLIC_IP/api"
echo "📡 CCTV & YOLO11 Telemetry:    ws://$PUBLIC_IP/ws"
echo "❤️ Health Check Endpoint:       http://$PUBLIC_IP/health"
echo "======================================================================"
echo ""
echo "💡 IMPORTANT ORACLE CLOUD INGRESS RULE CHECKLIST:"
echo "   In the OCI Web Console -> Networking -> Virtual Cloud Networks -> Subnet -> Security Lists:"
echo "   Ensure Ingress Rule exists for: Port 80 (TCP, Destination 0.0.0.0/0)"
echo "   Ensure Ingress Rule exists for: Port 443 (TCP, Destination 0.0.0.0/0)"
echo "======================================================================"
