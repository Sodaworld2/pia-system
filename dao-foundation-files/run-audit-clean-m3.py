import urllib.request, json, time, re, base64

M3_PIA = "http://100.102.217.69:3000"

# Create new clean session
data = json.dumps({"machine_id": "yFJxIOpcFcQEVl4CL9x0c", "shell": "powershell", "title": "audit"}).encode()
req = urllib.request.Request(f"{M3_PIA}/api/sessions", data=data, headers={"Content-Type": "application/json"}, method="POST")
resp = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
SID = resp["id"]
print(f"Audit session: {SID}")
time.sleep(3)

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=12000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# The audit script was already transferred earlier, just run it
send_cmd("python C:\\Users\\User\\audit_db.py")
time.sleep(10)
output = read_buffer(12000)
print(output)
