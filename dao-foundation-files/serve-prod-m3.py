import urllib.request, json, time, re

M3_PIA = "http://100.102.217.69:3000"

# Kill the Vite dev server session and start preview
VITE_SID = "GKJ4T88_PbNmn32kWbFiA"

def send_cmd(sid, cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{sid}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(sid, chars=4000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{sid}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# Stop the dev server (Ctrl+C)
send_cmd(VITE_SID, "\x03")
time.sleep(2)

# Start production preview server
send_cmd(VITE_SID, r"cd C:\Users\User\Documents\GitHub\DAOV1; npx vite preview --host --port 5173")
time.sleep(8)
print("=== PREVIEW SERVER ===")
print(read_buffer(VITE_SID, 3000))
