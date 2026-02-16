import urllib.request, json, time, re

M3_PIA = "http://100.102.217.69:3000"

# Create a new session specifically for the Vite dev server
data = json.dumps({"machine_id": "yFJxIOpcFcQEVl4CL9x0c", "shell": "powershell", "title": "vite-frontend"}).encode()
req = urllib.request.Request(f"{M3_PIA}/api/sessions", data=data, headers={"Content-Type": "application/json"}, method="POST")
resp = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
SID = resp["id"]
print(f"New Vite session: {SID}")
time.sleep(3)

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=4000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# Navigate to DAOV1 and start Vite with --host to expose on network
send_cmd(r"cd C:\Users\User\Documents\GitHub\DAOV1; npx vite --host")
print("Starting Vite dev server...")
time.sleep(15)
print("=== VITE OUTPUT ===")
print(read_buffer(4000))

# Verify it's listening
send_cmd("")
time.sleep(2)
