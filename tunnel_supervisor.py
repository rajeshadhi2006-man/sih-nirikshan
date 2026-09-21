import os
import re
import sys
import time
import subprocess

DIR = os.path.dirname(os.path.abspath(__file__))
CLOUDFLARED = os.path.join(DIR, "cloudflared.exe")
URL_FILE = os.path.join(DIR, "ACTIVE_TUNNEL_URL.txt")

print(f"[Tunnel Supervisor] Monitoring {CLOUDFLARED} -> http://127.0.0.1:5173", flush=True)

while True:
    try:
        proc = subprocess.Popen(
            [CLOUDFLARED, "tunnel", "--url", "http://127.0.0.1:5173"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace"
        )

        url_found = False
        for line in proc.stderr:
            line_str = line.strip()
            if not url_found:
                match = re.search(r"(https://[a-zA-Z0-9-]+\.trycloudflare\.com)", line_str)
                if match:
                    active_url = match.group(1)
                    url_found = True
                    with open(URL_FILE, "w", encoding="utf-8") as f:
                        f.write(active_url + "\n")
                    print(f"\n=======================================================", flush=True)
                    print(f"[ONLINE] Public Tunnel URL: {active_url}", flush=True)
                    print(f"=======================================================\n", flush=True)

        proc.wait()
        print(f"[Tunnel Supervisor] Tunnel closed with code {proc.returncode}. Re-establishing in 2 seconds...", flush=True)
    except Exception as e:
        print(f"[Tunnel Supervisor] Error: {e}. Retrying in 2 seconds...", flush=True)

    time.sleep(2)
