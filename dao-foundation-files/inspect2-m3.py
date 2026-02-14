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
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=6000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SESSION}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return clean

script = r'''import sqlite3
dbpath = r"C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db"
db = sqlite3.connect(dbpath)

# Just the top tables I missed
for t in ['daos','user_profiles','dao_members','council_members','proposals']:
    cols = db.execute(f"PRAGMA table_info({t})").fetchall()
    col_names = [c[1] for c in cols]
    count = db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"\n{t} ({count} rows): {col_names}")
    if count > 0:
        rows = db.execute(f"SELECT * FROM {t} LIMIT 3").fetchall()
        for r in rows:
            vals = []
            for i, v in enumerate(r):
                s = str(v) if v is not None else "NULL"
                if len(s) > 60: s = s[:60] + "..."
                vals.append(f"{col_names[i]}={s}")
            print(f"  {', '.join(vals)}")

print("\nDONE2")
db.close()
'''

b64 = base64.b64encode(script.encode()).decode()
ps = "[IO.File]::WriteAllBytes('C:\\Users\\User\\i2.py',[Convert]::FromBase64String('" + b64 + "'));echo 'OK'"
print(send_cmd(ps))
time.sleep(2)
print(send_cmd("python C:\\Users\\User\\i2.py"))
time.sleep(6)
print(read_buffer())
