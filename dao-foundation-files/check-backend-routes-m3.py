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

# List backend route files
send_cmd(r"Get-ChildItem C:\Users\User\Documents\GitHub\DAOV1\backend\src\routes\ -Name -Recurse")
time.sleep(3)
print("=== BACKEND ROUTE FILES ===")
print(read_buffer(3000))

# Check the AI module files
send_cmd(r"Get-ChildItem C:\Users\User\Documents\GitHub\DAOV1\backend\src\ai\ -Name -Recurse 2>$null; if(-not $?) { echo 'NO_AI_DIR'; Get-ChildItem C:\Users\User\Documents\GitHub\DAOV1\backend\src\ -Name }")
time.sleep(3)
print("\n=== BACKEND SRC STRUCTURE ===")
print(read_buffer(4000))

# Check wizard files
send_cmd(r"Get-ChildItem C:\Users\User\Documents\GitHub\DAOV1\src\council\wizards\ -Name -Recurse")
time.sleep(3)
print("\n=== WIZARD FILES ===")
print(read_buffer(3000))
