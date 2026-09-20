# 🚀 24/7 Cloud Deployment Guide: Vercel (Frontend) + Render (Backend)

This setup keeps your **MoSJE Nirikshan National Command Center** always online 24/7, even when your computer is completely turned off.

---

## Architecture Overview

```
             ┌─────────────────────────┐
             │       🌐 USER BROWSER    │
             └────────────┬────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
  ┌───────────────┐               ┌───────────────┐
  │   ▲ VERCEL    │  API / WSS    │   ☁️ RENDER    │
  │ React + Vite  ├──────────────►│ FastAPI Backend│
  │ Web Dashboard │               │ (Docker + YOLO)│
  └───────────────┘               └───────┬───────┘
                                          │
                                  ┌───────┴───────┐
                                  ▼               ▼
                          ┌───────────────┐ ┌───────────────┐
                          │   🛡️ SUPABASE  │ │  ⚡ YOLO11 AI  │
                          │ PostgreSQL DB │ │ Object Detect │
                          └───────────────┘ └───────────────┘
```

---

## Step 1: Deploy Backend to Render (100% Free)

Render runs your FastAPI + YOLO11 Python telemetry engine inside an optimized Docker container.

### 1.1 Push Code to GitHub
If you haven't pushed this project to GitHub yet:
1. Open your terminal in `d:\ALL PROJECT\SIH WEB`.
2. Run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit with Render and Vercel cloud deployment config"
   ```
3. Create a new repository on [github.com/new](https://github.com/new) (e.g. `sih-nirikshan`).
4. Link and push your repository:
   ```bash
   git remote add origin https://github.com/snsraj2006-hub/sih-nirikshan.git
   git branch -M main
   git push -u origin main
   ```

### 1.2 Create Web Service on Render
1. Go to [dashboard.render.com](https://dashboard.render.com) and sign in.
2. Click **New +** $\rightarrow$ **Web Service**.
3. Connect your GitHub repository (`sih-nirikshan`).
4. Render will automatically detect the settings from [`render.yaml`](file:///d:/ALL%20PROJECT/SIH%20WEB/render.yaml):
   - **Language / Runtime**: `Docker`
   - **Dockerfile Path**: `./backend/Dockerfile`
   - **Docker Build Context**: `.`
   - **Plan**: `Free`
5. Click **Deploy Web Service**.
6. Render will build the container and deploy it.
7. Once deployed, Render provides your public backend URL (e.g., `https://sih-command-backend.onrender.com`).
   *Test it by opening: `https://your-service.onrender.com/health` (should return `{"status": "ok"}`).*

---

## Step 2: Deploy Frontend to Vercel (100% Free)

Because you are already logged in to Vercel as `rajeshadhi2006-man`, deployment takes less than 60 seconds!

### Option A: One-Click Script
Double-click:
```
deploy_frontend_vercel.bat
```
*(Paste your Render backend URL when prompted, and it will build and deploy automatically).*

### Option B: Terminal Command
Run directly in your project root:
```bash
vercel --prod -e VITE_API_BASE_URL="https://your-service.onrender.com"
```

---

## Step 3: Verify Your Live System

1. Open your Vercel URL in your browser (e.g. `https://sih-web.vercel.app/dashboard`).
2. Navigate between `/dashboard`, `/users`, `/cctv`, and `/geofences` — all routes work seamlessly without 404s thanks to [`vercel.json`](file:///d:/ALL%20PROJECT/SIH%20WEB/vercel.json).
3. The dashboard connects to your Render backend API and Supabase Cloud database automatically.
