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

def read_buffer(chars=3000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SESSION}")
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return clean

# The fix script
script = r'''import sqlite3, json

dbpath = r"C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db"
db = sqlite3.connect(dbpath)
db.row_factory = sqlite3.Row

# 1. Fix DAO name
print("=== FIX DAO NAME ===")
daos = db.execute("SELECT * FROM daos").fetchall()
for d in daos:
    print(f"  Before: id={d['id']}, name={d['name']}")
db.execute("UPDATE daos SET name=?, description=? WHERE 1=1", ("SodaWorld DAO", "A decentralized autonomous organization for the SodaWorld community"))
db.commit()
daos = db.execute("SELECT * FROM daos").fetchall()
for d in daos:
    print(f"  After:  id={d['id']}, name={d['name']}")

# 2. Show current data counts
print("\n=== CURRENT DATA ===")
for t in ['daos','users','user_profiles','dao_members','proposals','votes','proposal_votes','agreements','agreement_signatures','council_members','milestones','marketplace_items','knowledge_items','bounties','bubbles','treasury_signers','treasury_transactions','generated_contracts']:
    try:
        count = db.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
        print(f"  {t}: {count}")
    except:
        print(f"  {t}: TABLE_MISSING")

# 3. Show sample data
print("\n=== COUNCIL MEMBERS ===")
try:
    members = db.execute("SELECT * FROM council_members LIMIT 5").fetchall()
    for m in members:
        d = dict(m)
        for k,v in d.items():
            if isinstance(v, str) and len(v) > 80:
                d[k] = v[:80] + "..."
        print(f"  {d}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== DAO MEMBERS ===")
try:
    members = db.execute("SELECT * FROM dao_members LIMIT 5").fetchall()
    for m in members:
        d = dict(m)
        for k,v in d.items():
            if isinstance(v, str) and len(v) > 80:
                d[k] = v[:80] + "..."
        print(f"  {d}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== USER PROFILES ===")
try:
    users = db.execute("SELECT * FROM user_profiles LIMIT 5").fetchall()
    for u in users:
        d = dict(u)
        for k,v in d.items():
            if isinstance(v, str) and len(v) > 80:
                d[k] = v[:80] + "..."
        print(f"  {d}")
except Exception as e:
    print(f"  Error: {e}")

print("\nFIX_M3_DONE")
db.close()
'''

b64 = base64.b64encode(script.encode()).decode()
ps_write = "[IO.File]::WriteAllBytes('C:\\Users\\User\\fix-m3.py',[Convert]::FromBase64String('" + b64 + "'));echo 'WRITTEN'"
print("Writing fix script...")
print(send_cmd(ps_write))
time.sleep(2)

print("Running fix script...")
print(send_cmd("python C:\\Users\\User\\fix-m3.py"))
time.sleep(8)

print("\n=== OUTPUT ===")
print(read_buffer(4000))
