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

def read_buffer(chars=3000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SESSION}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return clean

script = r'''import sqlite3
dbpath = r"C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db"
db = sqlite3.connect(dbpath)

# DAO name already fixed. Now seed remaining data.

# 1. Knowledge Items (with created_by)
print("=== SEED KNOWLEDGE ===")
count = db.execute("SELECT COUNT(*) FROM knowledge_items").fetchone()[0]
if count == 0:
    items = [
        ("ki-1","1","governance","governance","Voting Process Guide","All governance proposals require 50% quorum. Voting periods last 7 days.","system",0.95,"governance,voting","system"),
        ("ki-2","1","governance","policy","Treasury Spending Policy","Treasury withdrawals over 10,000 SODA require multi-sig approval from 2 of 3 signers.","system",0.95,"treasury,policy","system"),
        ("ki-3","1","legal","terms","Token Vesting Schedule","Founder tokens vest over 48 months with 12-month cliff. Advisor tokens vest over 24 months.","system",0.9,"tokens,vesting","system"),
        ("ki-4","1","governance","procedure","Proposal Submission","Any token holder can submit a proposal. 48-hour review period before voting.","system",0.9,"governance,proposals","system"),
        ("ki-5","1","governance","policy","Council Election Rules","Council seats filled by token-weighted vote every 6 months. Min 100K SODA to run.","system",0.85,"council,elections","system"),
        ("ki-6","1","legal","contract","Operating Agreement","SodaWorld DAO operates as a Wyoming DAO LLC. Members have limited liability.","system",0.95,"legal,structure","system"),
        ("ki-7","1","governance","decision","Token Distribution","25% founders, 25% advisors, 25% community, 25% public sale.","system",0.9,"tokens,distribution","system"),
        ("ki-8","1","community","resource","Community Guidelines","Respectful discourse, no spam, constructive criticism.","system",0.85,"community,rules","system"),
        ("ki-9","1","governance","metric","Quorum Requirements","Standard: 50%, Constitutional: 75%, Emergency: 33%.","system",0.9,"governance,quorum","system"),
        ("ki-10","1","governance","goal","Q1 2026 Objectives","Launch marketplace, onboard 50 members, deploy governance v2, 3 partnerships.","system",0.8,"goals,roadmap","system"),
    ]
    for i in items:
        db.execute("INSERT INTO knowledge_items (id,dao_id,module_id,category,title,content,source,confidence,tags,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)", i)
    db.commit()
    print(f"  Seeded {len(items)} items")
else:
    print(f"  Already {count}")

# 2. Bounties
print("=== SEED BOUNTIES ===")
count = db.execute("SELECT COUNT(*) FROM bounties").fetchone()[0]
if count == 0:
    bs = [
        ("b-1","1","Build Token Staking Dashboard","Create staking rewards component",5000,"SODA","open","system",None,"2026-04-01","Component,API,tests","frontend"),
        ("b-2","1","Security Audit Report","Audit all API endpoints and auth",8000,"SODA","open","system",None,"2026-03-15","Report,fixes","security"),
        ("b-3","1","Marketing Materials","Social templates and pitch deck",3000,"SODA","in_progress","system",None,"2026-03-01","Templates,deck","design"),
        ("b-4","1","Multi-language Support","Add i18n with EN/ES/PT",4000,"SODA","open","system",None,"2026-05-01","i18n config,translations","frontend"),
    ]
    for b in bs:
        db.execute("INSERT INTO bounties (id,dao_id,title,description,reward_amount,reward_token,status,created_by,claimed_by,deadline,deliverables,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", b)
    db.commit()
    print(f"  Seeded {len(bs)} bounties")
else:
    print(f"  Already {count}")

# 3. Add API key
print("=== API KEY ===")
envpath = r"C:\Users\User\Documents\GitHub\DAOV1\backend\.env"
with open(envpath) as f:
    content = f.read()
if "ANTHROPIC_API_KEY" not in content:
    with open(envpath, "a") as f:
        f.write("\nANTHROPIC_API_KEY=REDACTED_KEY\n")
    print("  Added")
else:
    print("  Already set")

# 4. Verify
print("=== FINAL ===")
for t in ['daos','council_members','proposals','agreements','milestones','marketplace_items','knowledge_items','bounties']:
    c = db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"  {t}: {c}")
name = db.execute("SELECT daoName FROM daos LIMIT 1").fetchone()[0]
print(f"  DAO name: {name}")
with open(envpath) as f:
    has_key = "ANTHROPIC_API_KEY" in f.read()
print(f"  API key in .env: {has_key}")

print("\nV2_DONE")
db.close()
'''

b64 = base64.b64encode(script.encode()).decode()
ps = "[IO.File]::WriteAllBytes('C:\\Users\\User\\fix2.py',[Convert]::FromBase64String('" + b64 + "'));echo 'OK'"
print(send_cmd(ps))
time.sleep(2)
print(send_cmd("python C:\\Users\\User\\fix2.py"))
time.sleep(8)
print(read_buffer())
