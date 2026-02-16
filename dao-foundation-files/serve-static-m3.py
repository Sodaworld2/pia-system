import urllib.request, json, time, re, base64

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

# Check if the backend index.ts already serves static files
send_cmd(r"Select-String -Path C:\Users\User\Documents\GitHub\DAOV1\backend\src\index.ts -Pattern 'static|dist' -SimpleMatch")
time.sleep(3)
print("=== CHECK STATIC SERVING ===")
print(read_buffer(2000))

# Check what the main server file looks like
send_cmd(r"type C:\Users\User\Documents\GitHub\DAOV1\backend\src\index.ts | Select-Object -Last 50")
time.sleep(3)
print("\n=== SERVER INDEX END ===")
print(read_buffer(4000))
