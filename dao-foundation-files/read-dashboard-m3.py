import urllib.request, json, time, re

M3_PIA = "http://100.102.217.69:3000"
SID = "8Tt609LYFkJ5KRWOgrBZH"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=8000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# Read DashboardLayout
send_cmd(r"type C:\Users\User\Documents\GitHub\DAOV1\src\layouts\DashboardLayout.tsx")
time.sleep(3)
print("=== DASHBOARD LAYOUT ===")
print(read_buffer(8000))
