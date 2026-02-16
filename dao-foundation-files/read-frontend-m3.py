import urllib.request, json, time, re, base64

M3_PIA = "http://100.102.217.69:3000"

# Create a new session for reading files
data = json.dumps({"machine_id": "yFJxIOpcFcQEVl4CL9x0c", "shell": "powershell", "title": "read-files"}).encode()
req = urllib.request.Request(f"{M3_PIA}/api/sessions", data=data, headers={"Content-Type": "application/json"}, method="POST")
resp = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
SID = resp["id"]
print(f"New session: {SID}")
time.sleep(3)

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

# Read routes
send_cmd(r"type C:\Users\User\Documents\GitHub\DAOV1\src\routes\index.tsx")
time.sleep(3)
print("=== ROUTES ===")
print(read_buffer(8000))

# Read App.tsx
send_cmd(r"type C:\Users\User\Documents\GitHub\DAOV1\src\App.tsx")
time.sleep(3)
print("\n=== APP.TSX ===")
print(read_buffer(8000))

# Check what tables exist in the DB
script = r'''
import sqlite3
db = sqlite3.connect(r"C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db")
tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
print("TABLES:", tables)
# Check if vesting tables exist
for t in ['vesting_unlocks', 'vesting_schedules', 'token_distribution_groups']:
    exists = t in tables
    print(f"  {t}: {'EXISTS' if exists else 'MISSING'}")
db.close()
'''
b64 = base64.b64encode(script.encode()).decode()
send_cmd("[IO.File]::WriteAllBytes('C:\\Users\\User\\check_tables.py',[Convert]::FromBase64String('" + b64 + "'));echo 'WRITTEN'")
time.sleep(2)
send_cmd("python C:\\Users\\User\\check_tables.py")
time.sleep(3)
print("\n=== DB TABLES ===")
print(read_buffer(3000))
