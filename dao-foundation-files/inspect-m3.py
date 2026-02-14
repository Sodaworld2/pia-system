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

def read_buffer(chars=4000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SESSION}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return clean

script = r'''import sqlite3, json

dbpath = r"C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db"
db = sqlite3.connect(dbpath)

# Show schema for key tables
print("=== TABLE SCHEMAS ===")
for t in ['daos','user_profiles','dao_members','council_members','proposals','agreements','agreement_signatures','votes','proposal_votes','marketplace_items','knowledge_items','bounties','milestones']:
    try:
        cols = db.execute(f"PRAGMA table_info({t})").fetchall()
        col_names = [c[1] for c in cols]
        count = db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"\n{t} ({count} rows): {col_names}")
        if count > 0 and count <= 10:
            rows = db.execute(f"SELECT * FROM {t} LIMIT 3").fetchall()
            for r in rows:
                vals = []
                for i, v in enumerate(r):
                    s = str(v) if v is not None else "NULL"
                    if len(s) > 60:
                        s = s[:60] + "..."
                    vals.append(f"{col_names[i]}={s}")
                print(f"  {', '.join(vals)}")
    except Exception as e:
        print(f"\n{t}: ERROR - {e}")

print("\nINSPECT_DONE")
db.close()
'''

b64 = base64.b64encode(script.encode()).decode()
ps = "[IO.File]::WriteAllBytes('C:\\Users\\User\\inspect.py',[Convert]::FromBase64String('" + b64 + "'));echo 'OK'"
print("Writing...")
print(send_cmd(ps))
time.sleep(2)
print("Running...")
print(send_cmd("python C:\\Users\\User\\inspect.py"))
time.sleep(8)
print(read_buffer(5000))
