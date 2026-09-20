# SIH 2026 National Command Center — Production Backend Deployment Guide

This guide details the complete deployment architecture, environment configuration, containerization, and Cloudflare Pages integration for the **National Command Center Telemetry Engine** (FastAPI + YOLO11 + WebSockets + Supabase).

---

## 1. System Architecture

```text
                    🌍 PUBLIC INTERNET
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
   ☁️ Cloudflare Pages       ☁️ Cloudflare Edge / DNS
 (React + TS Web Dashboard)     (Reverse Proxy & SSL)
               │                         │
               │ HTTPS (REST API)        │ WSS (WebSockets)
               └────────────┬────────────┘
                            ▼
               ⚙️ FastAPI Production Engine
                    (Python 3.11 / Uvicorn)
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
⚡ YOLO11 AI Engine     🛡️ Supabase PostgreSQL 📡 Real-Time Hub
 (Object Tracking /     (Shared Cloud Auth,    (/ws/live, /ws/cctv,
  CCTV Stream Server)    Evidence & Profiles)   /ws/location/{id})
```

---

## 2. Infrastructure & Hosting Recommendations

> [!IMPORTANT]
> **Why Cloudflare Workers is Incompatible for Backend Execution**:
> Ultralytics YOLO11, PyTorch, OpenCV, and ONNX Runtime require a full CPython runtime, shared libraries (`libgl1`), and persistent background worker threads for continuous 30 FPS video decoding. Cloudflare Workers (V8 JavaScript isolates) cannot run native Python AI frameworks.
>
> **Recommended Production Pattern**:
> 1. **Web Dashboard**: Hosted globally on **Cloudflare Pages** (Static / Edge CDN).
> 2. **FastAPI + YOLO11 Backend**: Hosted on a container or VM platform (Google Cloud Run, AWS EC2 / ECS, DigitalOcean App Platform, Railway, or a Dedicated GPU/CPU Server).
> 3. **Public Edge**: Point a Cloudflare DNS record (`api.your-domain.com`) with Proxied status (`Orange Cloud`) or Cloudflare Tunnel (`cloudflared`) to your backend server.

---

## 3. Environment Variables Specification

Configure the following variables in your hosting environment (or in a `.env` file):

| Variable | Type | Default / Example | Purpose | Secret? |
| :--- | :--- | :--- | :--- | :--- |
| `HOST` | String | `0.0.0.0` | IP interface to bind Uvicorn | No |
| `PORT` | Integer | `8000` | Port provided by platform (`$PORT`) | No |
| `DEBUG` | Boolean | `false` | Disable debug logs in production | No |
| `FRONTEND_URL` | String | `https://sih-command.pages.dev` | Production Cloudflare Pages URL | No |
| `PUBLIC_API_URL` | String | `https://api.your-domain.com` | Publicly reachable backend URL | No |
| `CORS_ORIGINS` | CSV | `https://sih-command.pages.dev` | Allowed CORS origins | No |
| `CORS_ORIGIN_REGEX` | Regex | `https://.*\.pages\.dev` | Allows all Cloudflare Pages previews | No |
| `DATABASE_MODE` | String | `local` | `local` (SQLite) or `supabase` | No |
| `DATABASE_URL` | String | `sqlite:///./backend/sih_database.db` | Connection string | No |
| `SUPABASE_URL` | String | `https://xyz.supabase.co` | Supabase Cloud API URL | No |
| `SUPABASE_KEY` | String | `eyJ...` | Supabase Anonymous Key | No |
| `SUPABASE_SERVICE_ROLE_KEY` | String | *(Secret)* | Privileged backend key (NEVER in frontend) | **YES** |
| `JWT_SECRET` | String | *(Secret)* | Secret key for token signing | **YES** |
| `YOLO_MODEL_PATH` | Path | `yolo11n.pt` | Path to YOLO11 weights | No |
| `YOLO_CONFIDENCE` | Float | `0.35` | Object detection confidence | No |
| `ARCFACE_MODEL_PATH` | Path | `backend/models/w600k_mbf.onnx`| Path to ArcFace ONNX model | No |
| `CCTV_SOURCE_URL` | String | `0` | RTSP / HTTP URL or `0` for fallback | No |

---

## 4. Docker Deployment Instructions

A production-optimized [`backend/Dockerfile`](file:///d:/ALL%20PROJECT/SIH%20WEB/backend/Dockerfile) is provided.

### 4.1 Build Docker Container
```bash
docker build -t sih-telemetry-backend:latest -f backend/Dockerfile .
```

### 4.2 Run Docker Container Locally or on Cloud Host
```bash
docker run -d \
  --name sih-backend \
  -p 8000:8000 \
  -e PORT=8000 \
  -e FRONTEND_URL="https://your-sih-project.pages.dev" \
  -e PUBLIC_API_URL="https://api.your-domain.com" \
  -e SUPABASE_URL="https://ctmkpwwbdexwkakuqpat.supabase.co" \
  -e SUPABASE_KEY="your-anon-key" \
  -e SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
  -e JWT_SECRET="strong-production-random-secret" \
  sih-telemetry-backend:latest
```

---

## 5. Direct Process Startup Commands

If running directly on a Linux or Windows cloud host without Docker:

```bash
# 1. Install dependencies
pip install -r backend/requirements.txt

# 2. Start Uvicorn production server
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

> [!TIP]
> Keep workers at `1` if using in-memory OpenCV video stream workers (`cctv_stream_manager`), or run CCTV worker as an independent microservice if scaling horizontally across multiple uvicorn workers.

---

## 6. Health Check Verification

The backend exposes a public, unauthenticated health check endpoint:

```http
GET /health
```

### Example 200 OK Response:
```json
{
  "status": "ok",
  "service": "SIH Telemetry Backend",
  "timestamp": "2026-09-20T11:13:01.150481Z",
  "checks": {
    "database": "ok",
    "supabase": "connected",
    "yolo11": {
      "loaded": true,
      "device": "cpu",
      "half_precision": false,
      "model": "yolo11n.pt"
    },
    "cctv": "LIVE",
    "active_websockets": 0
  }
}
```

Cloudflare Health Monitors, AWS Route53, or container orchestrators should point to `GET /health` with expected status code `200`.

---

## 7. Cloudflare Pages Frontend Configuration

In your Cloudflare Pages project settings, add the following environment variable to connect the React Dashboard to your public FastAPI server:

```ini
VITE_API_BASE_URL=https://api.your-domain.com
```

- When `VITE_API_BASE_URL` is set, the frontend automatically directs all REST requests to `https://api.your-domain.com/api/...` and all WebSocket connections to `wss://api.your-domain.com/ws/live`.
- In local development (`VITE_API_BASE_URL` empty), the frontend automatically uses the Vite dev proxy.

---

## 8. WebSocket Reverse Proxy Requirements

When deploying behind Cloudflare or NGINX, WebSockets must be allowed:

1. **Cloudflare Dashboard**: Under **Network**, ensure **WebSockets** is toggled **ON** (enabled by default on all Cloudflare zones).
2. **NGINX Configuration (if using NGINX as reverse proxy)**:
   ```nginx
   location /ws/ {
       proxy_pass http://127.0.0.1:8000/ws/;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_read_timeout 86400s;
       proxy_send_timeout 86400s;
   }
   ```

---

## 9. CCTV & Edge AI Hardware Execution

- **YOLO11 Model**: Auto-detects NVIDIA CUDA GPU if drivers and CUDA PyTorch are present, enabling FP16 half-precision inference (~3-8ms latency). On CPU, it automatically optimizes thread concurrency across available CPU cores (~25-45ms latency).
- **CCTV Source**: If the physical CCTV camera is located inside a private LAN behind NAT, configure the mobile transmitter or edge forwarder to stream frames to the public backend using:
  - `POST /api/cctv/frame` (Base64 or binary JPEG)
  - `WS /ws/cctv/{camera_id}` (Binary WebSocket stream)
  This eliminates any need to expose private local IP cameras to the public internet.

---

## 10. Security Checklist

- [x] **No Secrets in Frontend**: `SUPABASE_SERVICE_ROLE_KEY` and `JWT_SECRET` are strictly backend-only.
- [x] **Strict CORS**: `allow_origins` whitelist configured with `allow_origin_regex` for `*.pages.dev` to prevent arbitrary website cross-origin attacks while enabling credentials.
- [x] **Zero Hardcoded Private IPs**: All endpoints use dynamic host headers or `PUBLIC_API_URL`.
- [x] **Cross-Platform Path Resolution**: All model files (`yolo11n.pt`, `w600k_mbf.onnx`) and database paths use OS-agnostic relative resolution.
