import urllib.request, json, time, re, base64

M3_PIA = "http://100.102.217.69:3000"
SID = "8Tt609LYFkJ5KRWOgrBZH"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=4000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# Create the missing vesting_unlocks table and seed some data
script = r'''
import sqlite3

db_path = r"C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db"
db = sqlite3.connect(db_path)

# Create vesting_unlocks table
db.execute("""
CREATE TABLE IF NOT EXISTS vesting_unlocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER,
    unlock_date TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    unlocked_at TEXT,
    tx_hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (schedule_id) REFERENCES vesting_schedules(id)
)
""")

# Check what vesting_schedules look like
schedules = db.execute("SELECT * FROM vesting_schedules").fetchall()
cols = [d[0] for d in db.execute("PRAGMA table_info(vesting_schedules)").fetchall()]
print("vesting_schedules columns:", [c[1] for c in db.execute("PRAGMA table_info(vesting_schedules)").fetchall()])
print("vesting_schedules rows:", len(schedules))

if len(schedules) == 0:
    # Seed some vesting schedules based on council members
    members = db.execute("SELECT id, name, surname, role_type, token_allocation_total FROM council_members").fetchall()
    print("Council members:", len(members))
    for m in members:
        mid, name, surname, role, tokens = m
        if tokens and tokens > 0:
            # 4-year vesting, quarterly unlocks
            db.execute("""
                INSERT INTO vesting_schedules (user_id, group_id, total_amount, cliff_months, vesting_months, start_date, status)
                VALUES (?, 1, ?, 12, 48, '2024-01-01', 'active')
            """, (mid, tokens))
    db.commit()
    print("Seeded vesting schedules")
    schedules = db.execute("SELECT * FROM vesting_schedules").fetchall()

# Now seed vesting unlocks for existing schedules
existing_unlocks = db.execute("SELECT COUNT(*) FROM vesting_unlocks").fetchone()[0]
if existing_unlocks == 0:
    for s in schedules:
        sid = s[0]
        total = s[3] if len(s) > 3 else 100000  # total_amount
        # Create quarterly unlocks
        for q in range(1, 5):
            month = q * 3
            db.execute("""
                INSERT INTO vesting_unlocks (schedule_id, unlock_date, amount, status)
                VALUES (?, ?, ?, ?)
            """, (sid, f"2025-{month:02d}-01", total / 16, 'completed' if q <= 2 else 'pending'))
    db.commit()
    print("Seeded vesting unlocks")

# Also check token_distribution_groups
groups = db.execute("SELECT * FROM token_distribution_groups").fetchall()
print("token_distribution_groups rows:", len(groups))

if len(groups) == 0:
    db.execute("INSERT INTO token_distribution_groups (groupName, percentage, tokenAmount) VALUES ('Founders', 25, 11000000)")
    db.execute("INSERT INTO token_distribution_groups (groupName, percentage, tokenAmount) VALUES ('Advisors', 15, 3500000)")
    db.execute("INSERT INTO token_distribution_groups (groupName, percentage, tokenAmount) VALUES ('Contributors', 10, 1500000)")
    db.execute("INSERT INTO token_distribution_groups (groupName, percentage, tokenAmount) VALUES ('First Born', 5, 500000)")
    db.execute("INSERT INTO token_distribution_groups (groupName, percentage, tokenAmount) VALUES ('Foundation', 25, 5000000)")
    db.execute("INSERT INTO token_distribution_groups (groupName, percentage, tokenAmount) VALUES ('Community', 20, 4000000)")
    db.commit()
    print("Seeded token distribution groups")

# Verify
print("\nFinal counts:")
print("  vesting_schedules:", db.execute("SELECT COUNT(*) FROM vesting_schedules").fetchone()[0])
print("  vesting_unlocks:", db.execute("SELECT COUNT(*) FROM vesting_unlocks").fetchone()[0])
print("  token_distribution_groups:", db.execute("SELECT COUNT(*) FROM token_distribution_groups").fetchone()[0])
print("\nDONE")
db.close()
'''

b64 = base64.b64encode(script.encode()).decode()
send_cmd("[IO.File]::WriteAllBytes('C:\\Users\\User\\fix_vesting.py',[Convert]::FromBase64String('" + b64 + "'));echo 'WRITTEN'")
time.sleep(2)
send_cmd("python C:\\Users\\User\\fix_vesting.py")
time.sleep(5)
print("=== RESULT ===")
print(read_buffer(4000))
