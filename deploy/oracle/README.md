# 🌐 Oracle Cloud Infrastructure (OCI) 24/7 Deployment Guide

This guide details how to deploy the **MoSJE Nirikshan National Command Center** to **Oracle Cloud Infrastructure (OCI)** using an Always Free Compute VM.

---

## 📋 Prerequisites: Create an OCI Always Free Compute Instance

If you do not already have an Oracle Cloud VM:
1. Log in to your [Oracle Cloud Console](https://cloud.oracle.com).
2. Go to **Compute** $\rightarrow$ **Instances** $\rightarrow$ Click **Create Instance**.
3. **Name**: `sih-command-center`
4. **Image**: Select **Ubuntu 24.04 / 22.04 LTS** (or Oracle Linux 8/9).
5. **Shape**:
   - **Ampere A1 (Arm)**: Select `VM.Standard.A1.Flex` (Up to 4 OCPUs, 24 GB RAM — **100% Always Free!**), OR
   - **AMD (x86)**: Select `VM.Standard.E2.1.Micro` (1 OCPU, 1 GB RAM — Always Free).
6. **Save Private Key**: Click **Download Private Key** (saves as `ssh-key-YYYY-MM-DD.key`).
7. Click **Create**.
8. Once the instance status turns **RUNNING**, note your **Public IP Address** (e.g. `140.238.xx.xx`).

---

## 🛡️ Step 1: Configure OCI Ingress Firewall Rules (Port 80 & 443)

Oracle Cloud blocks inbound traffic at the VCN subnet level by default. You must open Port 80 and 443:
1. In the instance details page, under **Primary VNIC**, click your **Subnet** link.
2. In the Subnet page, click **Default Security List for your VCN**.
3. Click **Add Ingress Rules**:
   - **Source CIDR**: `0.0.0.0/0`
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `80,443,8000`
   - **Description**: `Allow HTTP, HTTPS, and API access`
4. Click **Add Ingress Rules**.

---

## 🚀 Step 2: Run Automated Deployment

### Option A: From your Windows PC (One-Click)

Run the automated script in PowerShell:
```powershell
.\deploy_to_oci.ps1
```
It will prompt for:
- Your Oracle VM Public IP (e.g. `140.238.xx.xx`)
- Path to your downloaded `.key` or `.pem` file

The script will automatically connect via SSH, install Docker, configure the VM firewall, pull the repository, and start the multi-container stack!

---

### Option B: Directly on the VM via SSH

Connect to your Oracle VM:
```bash
ssh -i /path/to/your/ssh-key.key ubuntu@<YOUR_ORACLE_IP>
```
*(Use `opc` instead of `ubuntu` if you chose Oracle Linux).*

Run the automated installer:
```bash
curl -fsSL https://raw.githubusercontent.com/rajeshadhi2006-man/sih-nirikshan/main/deploy/oracle/deploy_oracle_cloud.sh | sudo bash
```

---

## 🔍 Step 3: Verify Your Running Application

Once finished, open your browser:
- **Web Dashboard**: `http://<YOUR_ORACLE_IP>`
- **FastAPI Documentation**: `http://<YOUR_ORACLE_IP>/api/docs`
- **Health Check**: `http://<YOUR_ORACLE_IP>/health`
- **Real-Time CCTV & YOLO11 Stream**: `http://<YOUR_ORACLE_IP>/cctv`

---

## 🔄 Useful Maintenance Commands on the VM

- Check container logs:
  ```bash
  cd /opt/sih-nirikshan
  docker compose logs -f
  ```
- Restart services:
  ```bash
  systemctl restart sih-nirikshan.service
  ```
- Rebuild after code updates:
  ```bash
  cd /opt/sih-nirikshan
  git pull
  docker compose up -d --build
  ```
