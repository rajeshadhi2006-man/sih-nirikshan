import subprocess
import time
import os
import sys

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
print(f"[Backend Supervisor] Monitoring FastAPI backend at {DIR} on 0.0.0.0:8000...", flush=True)

while True:
    try:
        proc = subprocess.Popen(
            [sys.executable, "main.py"],
            cwd=DIR
        )
        proc.wait()
        print(f"[Backend Supervisor] Process exited with code {proc.returncode}. Restarting in 2 seconds...", flush=True)
    except Exception as e:
        print(f"[Backend Supervisor] Error: {e}. Restarting in 2 seconds...", flush=True)
    time.sleep(2)
