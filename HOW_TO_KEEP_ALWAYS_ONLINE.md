# How to Keep Your MoSJE Nirikshan Web Dashboard Always Online

---

## 1. Why Did You See "Error 1033"?

- **The Tunnel Closed**: The URL shown in your screenshot (`affiliated-pig-genre-improvement.trycloudflare.com`) was a temporary **Cloudflare Quick Tunnel**.
- When the terminal was closed, the PC slept, or the process stopped, Cloudflare could no longer reach your computer, returning **Error 1033**.
- **Ephemeral URLs**: Every time a quick tunnel is started without a Cloudflare account, Cloudflare assigns a **new random subdomain**. The old URL (`affiliated-pig-...`) cannot be reused once closed.

---

## 2. Quickest Fix: Run the Permanent Supervisor

We have integrated **Backend (port 8000)**, **Frontend (port 5173)**, and **Cloudflare Tunnel** into a single auto-restarting supervisor.

### How to Run:
Double-click:
```
run_services_permanently.bat
```
*(Located in `d:\ALL PROJECT\SIH WEB\run_services_permanently.bat`)*

### What it does:
1. Starts FastAPI Backend on `http://0.0.0.0:8000`
2. Starts Vite Web Frontend on `http://0.0.0.0:5173`
3. Starts `cloudflared.exe` tunnel routing public traffic to `http://localhost:5173`
4. Automatically detects your active public tunnel URL and saves it to:
   `d:\ALL PROJECT\SIH WEB\ACTIVE_TUNNEL_URL.txt`
5. **Auto-Restarts**: If any service crashes or disconnects, it restarts immediately in 3 seconds.

---

## 3. How to Make It Always Online (Choose Your Mode)

### Option A: Auto-Start When Windows Boots (Free, Local)
If you want the dashboard and tunnel to start automatically every time you turn on your PC or log in:
1. Press `Win + R`, type `shell:startup`, and hit Enter.
2. Right-click in the folder -> **New > Shortcut**.
3. Browse and select `d:\ALL PROJECT\SIH WEB\run_services_permanently.bat`.
4. Click Next -> Finish.
Now whenever your computer starts, your servers and public tunnel run automatically!

---

### Option B: Permanent Fixed Domain (Never Changes, 100% Free)
Quick tunnels generate a different random URL every time. If you want a **permanent URL** (e.g., `nirikshan.yourdomain.com`) that **never changes**:

1. Sign up for a free Cloudflare account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Zero Trust** -> **Networks** -> **Tunnels** -> **Create a tunnel**.
3. Choose **Cloudflared**. Name it (e.g., `sih-nirikshan`).
4. Select **Windows**. Cloudflare will give you an install command like:
   ```cmd
   .\cloudflared.exe service install <YOUR_TUNNEL_TOKEN>
   ```
5. In the tunnel settings on Cloudflare dashboard:
   - Service: `HTTP`
   - URL: `localhost:5173`
   - Public Hostname: `dashboard.yourdomain.com`
6. **Result**: It installs as a native **Windows Service** that runs silently in the background 24/7. Even if you restart your PC or close all terminals, your domain is always live.

---

### Option C: 24/7 Cloud Hosting (Runs Even When PC Is Off)
If you want the dashboard available when your laptop is turned off:
- **Frontend**: Deploy to [Vercel](https://vercel.com) or [Cloudflare Pages](https://pages.cloudflare.com) (100% Free).
- **Database**: Already using Supabase PostgreSQL in the cloud (`ctmkpwwbdexwkakuqpat.supabase.co`).
- **Backend**: Deploy the Docker container or FastAPI backend to [Render.com](https://render.com) or [Railway.app](https://railway.app) (Free / low-cost tier).
