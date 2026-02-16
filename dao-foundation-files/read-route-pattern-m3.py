import urllib.request, json, time, re

M3_PIA = "http://100.102.217.69:3000"
SID = "T-AXG0m3zFHP_H7pL5uj9"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=10000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# Read marketplace.ts as a reference for simple CRUD route
send_cmd(r"type C:\Users\User\Documents\GitHub\DAOV1\backend\src\routes\marketplace.ts")
time.sleep(4)
print("=== MARKETPLACE ROUTE ===")
print(read_buffer(10000))
