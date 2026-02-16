import urllib.request, json, time, re, base64

M3_PIA = "http://100.102.217.69:3000"
SID = "8Tt609LYFkJ5KRWOgrBZH"

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

audit_script = r"""
import sqlite3, json

db = sqlite3.connect(r"C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db")
db.row_factory = sqlite3.Row

print("=" * 60)
print("SODAWORLD DAO - FULL DATABASE AUDIT")
print("=" * 60)

# 1. Integrity check
print("\n--- 1. INTEGRITY ---")
ic = db.execute("PRAGMA integrity_check").fetchone()[0]
print(f"  Integrity: {ic}")
fk = db.execute("PRAGMA foreign_key_check").fetchall()
print(f"  FK violations: {len(fk)}")
jm = db.execute("PRAGMA journal_mode").fetchone()[0]
print(f"  Journal mode: {jm}")
import os
db_path = r"C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db"
size = os.path.getsize(db_path)
print(f"  File size: {size / 1024:.1f} KB")

# 2. All tables with row counts
print("\n--- 2. TABLE INVENTORY ---")
tables = db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
print(f"  Total tables: {len(tables)}")
empty_tables = []
populated_tables = []
for t in tables:
    name = t[0]
    if name.startswith('sqlite_') or name.startswith('knex_'):
        continue
    count = db.execute(f"SELECT COUNT(*) FROM [{name}]").fetchone()[0]
    status = "OK" if count > 0 else "EMPTY"
    if count == 0:
        empty_tables.append(name)
    else:
        populated_tables.append((name, count))
    print(f"  {name:40s} {count:6d} rows  [{status}]")

print(f"\n  Populated: {len(populated_tables)}, Empty: {len(empty_tables)}")
if empty_tables:
    print(f"  Empty tables: {', '.join(empty_tables)}")

# 3. Schema analysis - check for missing columns, indexes
print("\n--- 3. INDEX COVERAGE ---")
indexes = db.execute("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").fetchall()
print(f"  Total indexes: {len(indexes)}")
for idx in indexes:
    print(f"    {idx[0]:40s} on {idx[1]}")

# 4. Foreign key relationships
print("\n--- 4. FOREIGN KEY MAP ---")
for t in populated_tables:
    name = t[0]
    fks = db.execute(f"PRAGMA foreign_key_list([{name}])").fetchall()
    if fks:
        for fk in fks:
            print(f"    {name}.{fk[3]} -> {fk[2]}.{fk[4]}")

# 5. Data quality checks
print("\n--- 5. DATA QUALITY ---")

# Check proposals have valid statuses
statuses = db.execute("SELECT status, COUNT(*) FROM proposals GROUP BY status").fetchall()
print(f"  Proposal statuses: {dict(statuses)}")

# Check agreements have valid parties
agr = db.execute("SELECT id, title, party FROM agreements").fetchall()
for a in agr:
    try:
        p = json.loads(a[2]) if a[2] else None
        valid = isinstance(p, dict) and 'name' in p
        if not valid:
            print(f"  WARNING: Agreement {a[0]} ({a[1]}) has invalid party JSON")
    except:
        print(f"  WARNING: Agreement {a[0]} ({a[1]}) has unparseable party")

# Check council members have required fields
members = db.execute("SELECT id, name, surname, email, role_type, wallet_address, token_allocation_total FROM council_members").fetchall()
for m in members:
    issues = []
    if not m[1]: issues.append("no name")
    if not m[2]: issues.append("no surname")
    if not m[3]: issues.append("no email")
    if not m[4]: issues.append("no role_type")
    if not m[5]: issues.append("no wallet")
    if not m[6] or m[6] == 0: issues.append("no tokens")
    if issues:
        print(f"  WARNING: Member {m[0]} ({m[1]} {m[2]}): {', '.join(issues)}")
    else:
        print(f"  OK: {m[1]} {m[2]} ({m[4]}) - wallet: {str(m[5])[:12]}... tokens: {m[6]:,.0f}")

# Check treasury balance consistency
print("\n  Treasury transactions:")
tx = db.execute("SELECT type, SUM(amount) FROM treasury_transactions GROUP BY type").fetchall()
for t in tx:
    print(f"    {t[0]}: {t[1]:,.0f}")

# Check for orphaned records
print("\n--- 6. ORPHAN CHECK ---")
# Milestones referencing non-existent agreements
orphan_ms = db.execute("""
    SELECT m.id, m.agreement_id FROM milestones m
    LEFT JOIN agreements a ON m.agreement_id = a.id
    WHERE a.id IS NULL AND m.agreement_id IS NOT NULL
""").fetchall()
print(f"  Milestones with orphan agreement_id: {len(orphan_ms)}")

# Signatures referencing non-existent agreements
orphan_sig = db.execute("""
    SELECT s.id, s.agreement_id FROM agreement_signatures s
    LEFT JOIN agreements a ON s.agreement_id = a.id
    WHERE a.id IS NULL
""").fetchall()
print(f"  Signatures with orphan agreement_id: {len(orphan_sig)}")

# Votes referencing non-existent proposals
orphan_votes = db.execute("""
    SELECT v.id, v.proposal_id FROM proposal_votes v
    LEFT JOIN proposals p ON v.proposal_id = p.id
    WHERE p.id IS NULL
""").fetchall()
print(f"  Votes with orphan proposal_id: {len(orphan_votes)}")

# 7. Schema columns for key tables
print("\n--- 7. KEY TABLE SCHEMAS ---")
for tname in ['daos', 'council_members', 'proposals', 'agreements', 'treasury_transactions', 'milestones']:
    cols = db.execute(f"PRAGMA table_info([{tname}])").fetchall()
    col_info = [(c[1], c[2], 'NOT NULL' if c[3] else 'nullable', f'default={c[4]}' if c[4] else '') for c in cols]
    print(f"\n  {tname}:")
    for c in col_info:
        print(f"    {c[0]:30s} {c[1]:10s} {c[2]:10s} {c[3]}")

# 8. Missing production features
print("\n--- 8. PRODUCTION GAPS ---")
gaps = []

# Check for password hashing
users = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
if users == 0:
    gaps.append("No user accounts (users table empty) - no authentication")
else:
    u = db.execute("SELECT id, display_name, email FROM users LIMIT 5").fetchall()
    print(f"  Users: {users} rows")
    has_password = False
    cols = [c[1] for c in db.execute("PRAGMA table_info(users)").fetchall()]
    if 'password_hash' in cols or 'password' in cols:
        has_password = True
    if not has_password:
        gaps.append("Users table has no password column - no auth possible")

# Check for sessions/auth tables
auth_tables = ['sessions', 'auth_tokens', 'refresh_tokens']
for at in auth_tables:
    exists = db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", (at,)).fetchone()[0]
    if not exists:
        gaps.append(f"No {at} table")

# Check for audit/logging
if 'admin_logs' in [t[0] for t in tables]:
    log_count = db.execute("SELECT COUNT(*) FROM admin_logs").fetchone()[0]
    print(f"  Admin logs: {log_count} entries")
else:
    gaps.append("No admin_logs table")

# Check for backups
if not os.path.exists(r"C:\Users\User\Documents\GitHub\DAOV1\backend\backups"):
    gaps.append("No backup directory")
else:
    backups = os.listdir(r"C:\Users\User\Documents\GitHub\DAOV1\backend\backups")
    print(f"  Backups: {len(backups)} files")

# Check WAL mode
if jm != 'wal':
    gaps.append(f"Not using WAL mode (currently: {jm}) - worse concurrent performance")

# Check for rate limiting config
# Check for CORS config
# These are code-level, not DB

for i, g in enumerate(gaps):
    print(f"  GAP {i+1}: {g}")

print("\n" + "=" * 60)
print("AUDIT COMPLETE")
print("=" * 60)

db.close()
"""

b64 = base64.b64encode(audit_script.encode()).decode()
send_cmd("[IO.File]::WriteAllBytes('C:\\Users\\User\\audit_db.py',[Convert]::FromBase64String('" + b64 + "'));echo 'WRITTEN'")
time.sleep(2)
send_cmd("python C:\\Users\\User\\audit_db.py")
time.sleep(8)
print(read_buffer(10000))
