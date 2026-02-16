import urllib.request, json, time, re

M3_PIA = "http://100.102.217.69:3000"

# Try creating a new session for listing
data = json.dumps({"machine_id": "yFJxIOpcFcQEVl4CL9x0c", "shell": "powershell", "title": "list-dirs"}).encode()
req = urllib.request.Request(f"{M3_PIA}/api/sessions", data=data, headers={"Content-Type": "application/json"}, method="POST")
resp = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
SID = resp["id"]
print(f"New session: {SID}")
time.sleep(3)

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=3000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

send_cmd("ls C:\\Users\\User\\Documents\\GitHub\\DAOV1\\ | Select-Object Name")
time.sleep(4)
print("\n=== DAOV1 contents ===")
print(read_buffer())

send_cmd("ls C:\\Users\\User\\Documents\\GitHub\\ | Select-Object Name")
time.sleep(4)
print("\n=== GitHub folder ===")
print(read_buffer(2000))
