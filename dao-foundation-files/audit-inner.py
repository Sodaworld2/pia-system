import sqlite3, json, os

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

# 3. Index coverage
print("\n--- 3. INDEX COVERAGE ---")
indexes = db.execute("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").fetchall()
print(f"  Total indexes: {len(indexes)}")
for idx in indexes:
    print(f"    {idx[0]:40s} on {idx[1]}")

# 4. Data quality - council members
print("\n--- 4. COUNCIL MEMBERS ---")
members = db.execute("SELECT id, name, surname, email, role_type, wallet_address, token_allocation_total FROM council_members").fetchall()
for m in members:
    issues = []
    if not m[1]: issues.append("no name")
    if not m[3]: issues.append("no email")
    if not m[5]: issues.append("no wallet")
    if not m[6] or m[6] == 0: issues.append("no tokens")
    if issues:
        print(f"  WARN: {m[0]} ({m[1]} {m[2]}): {', '.join(issues)}")
    else:
        print(f"  OK: {m[1]} {m[2]} ({m[4]}) wallet:{str(m[5])[:12]}... tokens:{m[6]:,.0f}")

# 5. Proposals
print("\n--- 5. PROPOSALS ---")
statuses = db.execute("SELECT status, COUNT(*) FROM proposals GROUP BY status").fetchall()
print(f"  Statuses: {dict(statuses)}")

# 6. Treasury
print("\n--- 6. TREASURY ---")
try:
    tx_types = db.execute("SELECT type, COUNT(*), SUM(amount) FROM treasury_transactions GROUP BY type").fetchall()
    for t in tx_types:
        print(f"  {t[0]}: {t[1]} txns, total {t[2]:,.0f}")
except:
    tx_status = db.execute("SELECT status, COUNT(*), SUM(amount) FROM treasury_transactions GROUP BY status").fetchall()
    for t in tx_status:
        print(f"  {t[0]}: {t[1]} txns, total {t[2]:,.0f}")

# 7. Orphan check
print("\n--- 7. ORPHAN CHECK ---")
orphan_ms = db.execute("SELECT COUNT(*) FROM milestones m LEFT JOIN agreements a ON m.agreement_id = a.id WHERE a.id IS NULL AND m.agreement_id IS NOT NULL").fetchone()[0]
print(f"  Milestones with orphan agreement_id: {orphan_ms}")
orphan_sig = db.execute("SELECT COUNT(*) FROM agreement_signatures s LEFT JOIN agreements a ON s.agreement_id = a.id WHERE a.id IS NULL").fetchone()[0]
print(f"  Signatures with orphan agreement_id: {orphan_sig}")
try:
    orphan_votes = db.execute("SELECT COUNT(*) FROM proposal_votes v LEFT JOIN proposals p ON v.proposal_id = p.id WHERE p.id IS NULL").fetchone()[0]
    print(f"  Votes with orphan proposal_id: {orphan_votes}")
except:
    print(f"  Votes orphan check: skipped")

# 8. Users and auth
print("\n--- 8. AUTH & USERS ---")
users = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
user_cols = [c[1] for c in db.execute("PRAGMA table_info(users)").fetchall()]
print(f"  Users: {users} rows")
print(f"  User columns: {user_cols}")
has_password = 'password_hash' in user_cols or 'password' in user_cols
print(f"  Has password field: {has_password}")

auth_tables = ['sessions', 'auth_tokens', 'refresh_tokens']
for at in auth_tables:
    exists = db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", (at,)).fetchone()[0]
    print(f"  Table '{at}': {'EXISTS' if exists else 'MISSING'}")

# 9. Key table schemas
print("\n--- 9. KEY SCHEMAS ---")
for tname in ['daos', 'council_members', 'proposals', 'treasury_transactions']:
    cols = db.execute(f"PRAGMA table_info([{tname}])").fetchall()
    print(f"\n  {tname}:")
    for c in cols:
        nullable = "nullable" if not c[3] else "NOT NULL"
        default = f" default={c[4]}" if c[4] else ""
        print(f"    {c[1]:30s} {c[2]:10s} {nullable}{default}")

# 10. Production gaps
print("\n--- 10. PRODUCTION READINESS ---")
gaps = []
good = []

# Database integrity
if ic == "ok":
    good.append("Database integrity: OK")
else:
    gaps.append("Database integrity: FAILED")

# WAL mode
if jm == "wal":
    good.append("WAL journal mode: enabled")
else:
    gaps.append(f"Not using WAL mode (currently: {jm})")

# Users/auth
if users == 0:
    gaps.append("No user accounts - authentication not functional")
if not has_password:
    gaps.append("No password field in users table")

# Auth tables
for at in auth_tables:
    exists = db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", (at,)).fetchone()[0]
    if not exists:
        gaps.append(f"Missing {at} table for session management")

# Empty tables that should have data
important_empty = [t for t in empty_tables if t in ['dao_members', 'generated_contracts', 'legal_frameworks', 'negotiation_threads', 'user_profiles']]
if important_empty:
    gaps.append(f"Empty tables that may need data: {', '.join(important_empty)}")

# Backups
backup_dir = r"C:\Users\User\Documents\GitHub\DAOV1\backend\backups"
if os.path.exists(backup_dir):
    backups = [f for f in os.listdir(backup_dir) if f.endswith('.db')]
    if backups:
        good.append(f"Backup directory: {len(backups)} backups")
    else:
        gaps.append("Backup directory exists but no backups taken")
else:
    gaps.append("No backup directory")

# Data completeness
if len(populated_tables) >= 20:
    good.append(f"Data completeness: {len(populated_tables)} tables populated")
else:
    gaps.append(f"Only {len(populated_tables)} tables populated")

# Foreign key enforcement
fk_enabled = db.execute("PRAGMA foreign_keys").fetchone()[0]
if fk_enabled:
    good.append("Foreign key enforcement: ON")
else:
    gaps.append("Foreign keys not enforced (PRAGMA foreign_keys = OFF)")

print("\n  GOOD:")
for g in good:
    print(f"    + {g}")
print(f"\n  GAPS ({len(gaps)}):")
for i, g in enumerate(gaps):
    print(f"    - {g}")

print("\n" + "=" * 60)
print("AUDIT COMPLETE")
print("=" * 60)
db.close()
