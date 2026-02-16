import urllib.request, json, time, re

M3_PIA = "http://100.102.217.69:3000"
SID = "8Tt609LYFkJ5KRWOgrBZH"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=6000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# Check what processes are running on ports 5174 and 5003
send_cmd("netstat -ano | findstr ':5174'")
time.sleep(2)
print("=== PORT 5174 (Vite) ===")
print(read_buffer(2000))

send_cmd("netstat -ano | findstr ':5003'")
time.sleep(2)
print("\n=== PORT 5003 (Backend) ===")
print(read_buffer(2000))

# Check the Vite config to see if it's bound to 0.0.0.0 or just localhost
send_cmd(r"type C:\Users\User\Documents\GitHub\DAOV1\vite.config.ts")
time.sleep(3)
print("\n=== VITE CONFIG ===")
print(read_buffer(4000))

# Try to access the frontend from Machine #3 itself
send_cmd("Invoke-WebRequest -Uri http://localhost:5174/dashboard/overview -UseBasicParsing | Select-Object -ExpandProperty StatusCode")
time.sleep(5)
print("\n=== FRONTEND STATUS ===")
print(read_buffer(2000))
