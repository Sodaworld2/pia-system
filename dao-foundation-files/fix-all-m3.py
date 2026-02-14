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

def read_buffer(chars=5000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SESSION}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return clean

script = r'''import sqlite3, json, os

dbpath = r"C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db"
db = sqlite3.connect(dbpath)

# ============================================
# 1. FIX DAO NAME
# ============================================
print("=== 1. FIX DAO NAME ===")
db.execute("UPDATE daos SET daoName=?, description=? WHERE id=1",
           ("SodaWorld DAO", "A decentralized autonomous organization for the SodaWorld community"))
db.commit()
row = db.execute("SELECT daoName FROM daos WHERE id=1").fetchone()
print(f"  DAO name now: {row[0]}")

# ============================================
# 2. SEED KNOWLEDGE ITEMS
# ============================================
print("\n=== 2. SEED KNOWLEDGE ITEMS ===")
count = db.execute("SELECT COUNT(*) FROM knowledge_items").fetchone()[0]
if count == 0:
    items = [
        ("ki-1", "1", "governance", "governance", "Voting Process Guide", "All governance proposals require a 50% quorum of token-weighted votes. Voting periods last 7 days.", "system", 0.95, "governance,voting"),
        ("ki-2", "1", "governance", "policy", "Treasury Spending Policy", "All treasury withdrawals over 10,000 SODA require multi-sig approval from at least 2 of 3 signers.", "system", 0.95, "treasury,policy"),
        ("ki-3", "1", "legal", "terms", "Token Vesting Schedule", "Founder tokens vest over 48 months with a 12-month cliff. Advisor tokens vest over 24 months.", "system", 0.9, "tokens,vesting"),
        ("ki-4", "1", "governance", "procedure", "Proposal Submission Process", "Any token holder can submit a proposal. It enters a 48-hour review period before voting opens.", "system", 0.9, "governance,proposals"),
        ("ki-5", "1", "governance", "policy", "Council Election Rules", "Council seats are filled by token-weighted vote every 6 months. Minimum 100,000 SODA to run.", "system", 0.85, "council,elections"),
        ("ki-6", "1", "legal", "contract", "Operating Agreement Summary", "SodaWorld DAO operates as a Wyoming DAO LLC. Members have limited liability.", "system", 0.95, "legal,structure"),
        ("ki-7", "1", "governance", "decision", "Token Distribution Rationale", "25% founders, 25% advisors, 25% community, 25% public sale — balanced stakeholder model.", "system", 0.9, "tokens,distribution"),
        ("ki-8", "1", "community", "resource", "Community Guidelines", "Respectful discourse, no spam, constructive criticism. Violations may result in reputation penalties.", "system", 0.85, "community,rules"),
        ("ki-9", "1", "governance", "metric", "Quorum Requirements", "Standard proposals: 50% quorum. Constitutional amendments: 75% quorum. Emergency proposals: 33% quorum.", "system", 0.9, "governance,quorum"),
        ("ki-10", "1", "governance", "goal", "Q1 2026 Objectives", "Launch marketplace, onboard 50 new members, deploy governance v2, establish 3 community partnerships.", "system", 0.8, "goals,roadmap"),
    ]
    for item in items:
        db.execute("INSERT INTO knowledge_items (id, dao_id, module_id, category, title, content, source, confidence, tags) VALUES (?,?,?,?,?,?,?,?,?)", item)
    db.commit()
    print(f"  Seeded {len(items)} knowledge items")
else:
    print(f"  Already has {count} items")

# ============================================
# 3. SEED BOUNTIES
# ============================================
print("\n=== 3. SEED BOUNTIES ===")
count = db.execute("SELECT COUNT(*) FROM bounties").fetchone()[0]
if count == 0:
    bounties = [
        ("b-1", "1", "Build Token Staking Dashboard", "Create a React component showing staking rewards and APY calculations", 5000, "SODA", "open", "system", None, "2026-04-01", "React component,API integration,unit tests", "frontend,staking"),
        ("b-2", "1", "Write Security Audit Report", "Comprehensive security audit of all API endpoints and authentication flows", 8000, "SODA", "open", "system", None, "2026-03-15", "Audit report,vulnerability list,fix recommendations", "security,audit"),
        ("b-3", "1", "Design DAO Marketing Materials", "Create social media templates, pitch deck, and brand guidelines", 3000, "SODA", "in_progress", "system", None, "2026-03-01", "Social templates,pitch deck,brand guide", "design,marketing"),
        ("b-4", "1", "Implement Multi-language Support", "Add i18n to the frontend with English, Spanish, and Portuguese", 4000, "SODA", "open", "system", None, "2026-05-01", "i18n config,3 language files,locale switcher", "frontend,i18n"),
    ]
    for b in bounties:
        db.execute("INSERT INTO bounties (id, dao_id, title, description, reward_amount, reward_token, status, created_by, claimed_by, deadline, deliverables, tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", b)
    db.commit()
    print(f"  Seeded {len(bounties)} bounties")
else:
    print(f"  Already has {count} bounties")

# ============================================
# 4. ADD ANTHROPIC API KEY TO .env
# ============================================
print("\n=== 4. ADD API KEY ===")
envpath = r"C:\Users\User\Documents\GitHub\DAOV1\backend\.env"
with open(envpath, "r") as f:
    content = f.read()

if "ANTHROPIC_API_KEY" not in content:
    with open(envpath, "a") as f:
        f.write("\n# Claude AI Integration\nANTHROPIC_API_KEY=REDACTED_KEY\n")
    print("  Added ANTHROPIC_API_KEY to backend/.env")
else:
    print("  ANTHROPIC_API_KEY already present")

# ============================================
# 5. FINAL DATA COUNTS
# ============================================
print("\n=== FINAL DATA COUNTS ===")
for t in ['daos','council_members','proposals','agreements','milestones','marketplace_items','knowledge_items','bounties','agreement_signatures','votes']:
    try:
        c = db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t}: {c}")
    except:
        print(f"  {t}: TABLE_MISSING")

print("\nALL_FIXES_DONE")
db.close()
'''

b64 = base64.b64encode(script.encode()).decode()
ps = "[IO.File]::WriteAllBytes('C:\\Users\\User\\fix-all.py',[Convert]::FromBase64String('" + b64 + "'));echo 'OK'"
print("Writing fix script...")
print(send_cmd(ps))
time.sleep(2)
print("Running fixes...")
print(send_cmd("python C:\\Users\\User\\fix-all.py"))
time.sleep(8)
print("\n=== RESULT ===")
print(read_buffer())
