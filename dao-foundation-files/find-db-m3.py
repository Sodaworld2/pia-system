import json, base64, urllib.request, time, re

M3_PIA = "http://100.102.217.69:3000"
SESSION = "l-2KVfMrHVDzLJqwn91tT"

def send_cmd(cmd):
    payload = json.dumps({"data": cmd + "\r\n"})
    req = urllib.request.Request(
        f"{M3_PIA}/api/sessions/{SESSION}/input",
        data=payload.encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    resp = urllib.request.urlopen(req, timeout=10)
    return resp.read().decode()

def read_buffer(chars=2000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SESSION}")
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return clean

script = r'''import os, glob, sqlite3

# Find ALL .db files in DAOV1
base = r"C:\Users\User\Documents\GitHub\DAOV1"
print("=== ALL .db FILES ===")
for root, dirs, files in os.walk(base):
    # Skip node_modules
    if "node_modules" in root:
        continue
    for f in files:
        if f.endswith('.db') or f.endswith('.sqlite') or f.endswith('.sqlite3'):
            fp = os.path.join(root, f)
            sz = os.path.getsize(fp)
            print(f"  {fp} ({sz} bytes)")
            try:
                db = sqlite3.connect(fp)
                tables = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
                print(f"    Tables: {[t[0] for t in tables]}")
                db.close()
            except Exception as e:
                print(f"    Error: {e}")

# Also check the backend .env for DB path config
print("\n=== BACKEND .env ===")
envpath = os.path.join(base, "backend", ".env")
if os.path.exists(envpath):
    with open(envpath) as f:
        print(f.read())
else:
    print("  No backend/.env found")

# Check backend package.json for DB config
print("\n=== BACKEND DATABASE CONFIG ===")
for f in ["backend/src/database.ts", "backend/src/db.ts", "backend/src/config.ts"]:
    fp = os.path.join(base, f)
    if os.path.exists(fp):
        with open(fp) as fh:
            content = fh.read()
            # Find DB path references
            for line in content.split('\n'):
                if 'filename' in line.lower() or 'database' in line.lower() or '.db' in line.lower() or 'sqlite' in line.lower():
                    print(f"  {f}: {line.strip()}")

print("\nFIND_DB_DONE")
'''

b64 = base64.b64encode(script.encode()).decode()
ps_write = "[IO.File]::WriteAllBytes('C:\\Users\\User\\find-db.py',[Convert]::FromBase64String('" + b64 + "'));echo 'WRITTEN'"
print("Writing script...")
print(send_cmd(ps_write))
time.sleep(2)

print("Running script...")
print(send_cmd("python C:\\Users\\User\\find-db.py"))
time.sleep(8)

print("\n=== OUTPUT ===")
print(read_buffer(3000))
