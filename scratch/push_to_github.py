import os
import subprocess

def get_token():
    cred_file = os.path.expanduser(r"~\.git-credentials")
    if os.path.exists(cred_file):
        with open(cred_file, "r", encoding="utf-8") as f:
            for line in f:
                if "rajeshadhi2006-man" in line and "@github.com" in line:
                    parts = line.strip().split("@github.com")[0].split("://")[-1].split(":")
                    if len(parts) == 2:
                        return parts[0], parts[1]
    return "rajeshadhi2006-man", ""

user, token = get_token()
print(f"Authenticated as {user}")

remote_url = f"https://{user}:{token}@github.com/{user}/sih-nirikshan.git"
subprocess.run(["git", "remote", "set-url", "origin", remote_url], check=True)
res = subprocess.run(["git", "push", "origin", "main"], capture_output=True, text=True)
print("Push output:", res.stdout)
print("Push errors:", res.stderr)
subprocess.run(["git", "remote", "set-url", "origin", f"https://github.com/{user}/sih-nirikshan.git"], check=True)
print("Complete! Exit code:", res.returncode)
