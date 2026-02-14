import json, base64, urllib.request, sys, time

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

def read_buffer():
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SESSION}")
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read().decode())
    import re
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-1500:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return clean

# Step 1: Write the check script
script = r'''import sqlite3, os, json, glob

# Find the database
dbpath = r"C:\Users\User\Documents\GitHub\DAOV1\mentor_chats.db"
print(f"DB exists: {os.path.exists(dbpath)}")
print(f"DB size: {os.path.getsize(dbpath)} bytes")

db = sqlite3.connect(dbpath)
db.row_factory = sqlite3.Row

print("\n=== TABLES ===")
tables = db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
for t in tables:
    count = db.execute(f"SELECT COUNT(*) FROM [{t[0]}]").fetchone()[0]
    print(f"  {t[0]}: {count} rows")

print("\n=== DAO-LIKE TABLES ===")
for t in tables:
    name = t[0]
    if any(k in name.lower() for k in ['dao', 'config', 'setting', 'user', 'agreement', 'proposal', 'council']):
        cols = [d[0] for d in db.execute(f"SELECT * FROM [{name}] LIMIT 1").description]
        count = db.execute(f"SELECT COUNT(*) FROM [{name}]").fetchone()[0]
        print(f"\n  {name} ({count} rows): {cols}")
        if count > 0 and count < 20:
            for r in db.execute(f"SELECT * FROM [{name}] LIMIT 5").fetchall():
                d = dict(r)
                # Truncate long values
                for k,v in d.items():
                    if isinstance(v, str) and len(v) > 100:
                        d[k] = v[:100] + "..."
                print(f"    {d}")

print("\n=== ENV FILE ===")
for p in [r"C:\Users\User\Documents\GitHub\DAOV1\.env", r"C:\Users\User\Documents\GitHub\DAOV1\backend\.env"]:
    if os.path.exists(p):
        with open(p) as f:
            print(f"  {p}:")
            for line in f:
                if 'KEY' in line or 'key' in line or 'API' in line:
                    print(f"    {line.strip()}")

print("\nDONE_CHECK")
db.close()
'''

b64 = base64.b64encode(script.encode()).decode()

# Send the write command
ps_write = "[IO.File]::WriteAllBytes('C:" + "\\Users\\User\\check-dao.py',[Convert]::FromBase64String('" + b64 + "'));echo 'FILE_WRITTEN'"
print("Sending write command...")
print(send_cmd(ps_write))

time.sleep(3)

# Run the script
print("Running script...")
print(send_cmd("python C:" + "\\Users\\User\\check-dao.py"))

time.sleep(6)

# Read output
print("\n=== OUTPUT ===")
print(read_buffer())
