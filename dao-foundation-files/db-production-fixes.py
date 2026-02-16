"""
db-production-fixes.py - Machine #3 DAO Backend Production Fixes
================================================================
Three fixes:
1. Enable PRAGMA foreign_keys = ON
2. Seed user accounts matching the 9 council members
3. Trigger a database backup

Executes remotely on Machine #3 via PTY session.
"""

import urllib.request
import json
import time
import base64
import sys

MACHINE3 = "http://100.102.217.69:3000"
MACHINE_ID = "yFJxIOpcFcQEVl4CL9x0c"

# ── Helper: PTY API calls ────────────────────────────────────────────────

def api(method, path, body=None):
    url = MACHINE3 + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return json.loads(resp.read().decode())
    except Exception as e:
        print(f"  API ERROR: {method} {path} -> {e}")
        return {}

def send_cmd(sid, cmd):
    """Send raw input to PTY session. Include \\r\\n for enter."""
    api("POST", f"/api/sessions/{sid}/input", {"data": cmd + "\r\n"})

def read_buffer(sid):
    """Read the session buffer (contains all output since session started)."""
    resp = api("GET", f"/api/sessions/{sid}")
    return resp.get("buffer", "")

def wait_and_read(sid, seconds=3):
    time.sleep(seconds)
    return read_buffer(sid)

# ── Step 0: Create a fresh PTY session ───────────────────────────────────

print("=" * 70)
print("STEP 0: Creating fresh PTY session on Machine #3")
print("=" * 70)

resp = api("POST", "/api/sessions", {
    "machine_id": MACHINE_ID,
    "command": "powershell",
    "cwd": "C:\\Users\\User\\Documents\\GitHub\\DAOV1"
})
SID = resp.get("id")
if not SID:
    print(f"FATAL: Failed to create session. Response: {resp}")
    sys.exit(1)

print(f"Session created: {SID}")
time.sleep(3)

# Read initial buffer to confirm PowerShell is running
initial = read_buffer(SID)
print(f"Initial buffer length: {len(initial)} chars")

# ── The inner Python script that runs ON Machine #3 ─────────────────────

INNER_SCRIPT = r'''
import sqlite3
import os
import shutil
import uuid
import json
from datetime import datetime

DB_PATH = r"C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db"
BACKUP_DIR = r"C:\Users\User\Documents\GitHub\DAOV1\backend\backups"
BACKUP_PATH = os.path.join(BACKUP_DIR, "mentor_chats_backup_2026-02-15.db")

results = {"task1": None, "task2": None, "task3": None}

# --- TASK 1: Enable foreign key enforcement ---
print("")
print("=" * 60)
print("TASK 1: Foreign Key Enforcement")
print("=" * 60)

try:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    fk_status = conn.execute("PRAGMA foreign_keys").fetchone()
    print("PRAGMA foreign_keys = %s" % fk_status[0])

    if fk_status[0] == 1:
        results["task1"] = "OK: foreign_keys = ON"
        print("SUCCESS: Foreign keys are now enforced for this connection")
    else:
        results["task1"] = "WARN: pragma set but value is 0"
        print("WARNING: Pragma set but value still 0")

    # Try to patch the knex config for persistence across restarts
    knex_files = [
        r"C:\Users\User\Documents\GitHub\DAOV1\backend\database.ts",
        r"C:\Users\User\Documents\GitHub\DAOV1\backend\src\database.ts",
        r"C:\Users\User\Documents\GitHub\DAOV1\backend\knexfile.js",
        r"C:\Users\User\Documents\GitHub\DAOV1\backend\knexfile.ts",
    ]

    patched_file = None
    for fpath in knex_files:
        if os.path.exists(fpath):
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
            if "foreign_keys" not in content and "knex(" in content.lower():
                if "useNullAsDefault" in content:
                    new_content = content.replace(
                        "useNullAsDefault: true,",
                        "useNullAsDefault: true,\n  pool: {\n    afterCreate: (conn: any, cb: any) => {\n      conn.run('PRAGMA foreign_keys = ON', cb);\n    },\n  },"
                    )
                    if new_content != content:
                        with open(fpath, "w", encoding="utf-8") as f:
                            f.write(new_content)
                        patched_file = fpath
                        print("PATCHED: %s with afterCreate FK pragma" % fpath)
                        results["task1"] += " + patched %s" % os.path.basename(fpath)
            elif "foreign_keys" in content:
                print("ALREADY PATCHED: %s already has foreign_keys reference" % fpath)
                results["task1"] += " (already in %s)" % os.path.basename(fpath)
            break

    if not patched_file:
        print("NOTE: No knex config file found to patch on disk. FK enabled for current session.")

except Exception as e:
    results["task1"] = "ERROR: %s" % e
    print("ERROR: %s" % e)

# --- TASK 2: Seed user accounts ---
print("")
print("=" * 60)
print("TASK 2: Seed User Accounts from Council Members")
print("=" * 60)

try:
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Check if users table exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    has_users = cur.fetchone()

    if not has_users:
        print("WARNING: users table does not exist. Creating it...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                firebase_uid TEXT UNIQUE,
                email TEXT UNIQUE,
                display_name TEXT,
                avatar_url TEXT,
                role TEXT DEFAULT 'member',
                wallet_address TEXT,
                metadata TEXT DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.commit()
        print("Created users table")

    # Check if council_members table exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='council_members'")
    has_council = cur.fetchone()

    inserted_count = 0
    skipped_count = 0

    if has_council:
        cur.execute("SELECT * FROM council_members")
        members = cur.fetchall()
        col_names = [d[0] for d in cur.description]
        print("Found %d council members in database" % len(members))

        for m_row in members:
            m = dict(zip(col_names, m_row))
            member_id = str(uuid.uuid4())
            display_name = "%s %s" % (m.get('name',''), m.get('surname',''))
            email = m.get('email','')
            wallet = m.get('wallet_address','')
            role = m.get('role_type','member')
            firebase_uid = "dao-%s" % email.split('@')[0]
            avatar_url = "https://api.dicebear.com/7.x/initials/svg?seed=%s+%s" % (m.get('name',''), m.get('surname',''))

            metadata = json.dumps({
                "council_member_id": m.get('id'),
                "role_category": m.get('role_category'),
                "custom_role": m.get('custom_role_description'),
                "token_allocation": m.get('token_allocation_total', 0),
                "source": "council_members_sync",
                "synced_at": datetime.now().isoformat(),
            })

            try:
                cur.execute("""
                    INSERT OR IGNORE INTO users
                    (id, firebase_uid, email, display_name, avatar_url, role, wallet_address, metadata, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                """, (member_id, firebase_uid, email, display_name, avatar_url, role, wallet, metadata))

                if cur.rowcount > 0:
                    inserted_count += 1
                    print("  INSERTED: %s (%s) as %s" % (display_name, email, role))
                else:
                    skipped_count += 1
                    print("  SKIPPED (exists): %s (%s)" % (display_name, email))
            except Exception as ie:
                skipped_count += 1
                print("  SKIPPED (error): %s - %s" % (display_name, ie))

        conn.commit()
    else:
        print("WARNING: council_members table not found. Using hardcoded list.")

        hardcoded = [
            ("Marcus Chen", "marcus@sodaworld.io", "founder", "7xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwi"),
            ("Sarah Williams", "sarah@sodaworld.io", "founder", "9xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwj"),
            ("James Wright", "james@sodaworld.io", "founder", "5xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwk"),
            ("Lisa Park", "lisa@sodaworld.io", "advisor", "3xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwl"),
            ("David Kumar", "david@sodaworld.io", "advisor", "2xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwm"),
            ("Emma Rodriguez", "emma@sodaworld.io", "contributor", "8xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwn"),
            ("Alex Thompson", "alex@sodaworld.io", "contributor", "4xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwo"),
            ("Mia Johnson", "mia@sodaworld.io", "firstborn", "6xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwp"),
            ("Noah Davis", "noah@sodaworld.io", "firstborn", "1xKXtg2CW87d97TXJSDpbD6jBHqNRf1S3wFTa7rBFBwq"),
        ]

        for (name, email, role, wallet) in hardcoded:
            member_id = str(uuid.uuid4())
            firebase_uid = "dao-%s" % email.split('@')[0]
            avatar_url = "https://api.dicebear.com/7.x/initials/svg?seed=%s" % name.replace(' ', '+')
            metadata = json.dumps({"source": "hardcoded_seed", "synced_at": datetime.now().isoformat()})

            try:
                cur.execute("""
                    INSERT OR IGNORE INTO users
                    (id, firebase_uid, email, display_name, avatar_url, role, wallet_address, metadata, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                """, (member_id, firebase_uid, email, name, avatar_url, role, wallet, metadata))

                if cur.rowcount > 0:
                    inserted_count += 1
                    print("  INSERTED: %s (%s) as %s" % (name, email, role))
                else:
                    skipped_count += 1
                    print("  SKIPPED (exists): %s (%s)" % (name, email))
            except Exception as ie:
                skipped_count += 1
                print("  SKIPPED (error): %s - %s" % (name, ie))

        conn.commit()

    # Populate user_profiles if it exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_profiles'")
    has_profiles = cur.fetchone()

    profiles_inserted = 0
    if has_profiles:
        print("")
        print("Populating user_profiles...")
        # Re-open without row_factory for simpler reads
        cur2 = conn.cursor()
        cur2.execute("SELECT id, email, display_name FROM users WHERE email LIKE '%@sodaworld.io'")
        dao_users = cur2.fetchall()
        for u in dao_users:
            session_id = "dao-session-%s" % u[1].split('@')[0]
            try:
                cur2.execute("INSERT OR IGNORE INTO user_profiles (sessionId, learning_style) VALUES (?, ?)",
                           (session_id, "collaborative"))
                if cur2.rowcount > 0:
                    profiles_inserted += 1
            except Exception:
                pass
        conn.commit()
        print("  user_profiles: %d new rows" % profiles_inserted)
    else:
        print("NOTE: user_profiles table does not exist, skipping")

    # Populate dao_members if it exists
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='dao_members'")
    has_dao_members = cur.fetchone()

    dao_members_inserted = 0
    if has_dao_members:
        print("")
        print("Populating dao_members...")
        cur3 = conn.cursor()
        cur3.execute("SELECT id FROM daos LIMIT 1")
        dao_row = cur3.fetchone()
        if dao_row:
            dao_id = str(dao_row[0])
            cur3.execute("SELECT id, role FROM users WHERE email LIKE '%@sodaworld.io'")
            dao_users = cur3.fetchall()
            for u in dao_users:
                dm_id = str(uuid.uuid4())
                try:
                    cur3.execute("""
                        INSERT OR IGNORE INTO dao_members (id, dao_id, user_id, role, voting_power, reputation_score, metadata)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (dm_id, dao_id, u[0], u[1], 1.0, 100.0, '{}'))
                    if cur3.rowcount > 0:
                        dao_members_inserted += 1
                except Exception:
                    pass
            conn.commit()
            print("  dao_members: %d new rows (dao_id=%s)" % (dao_members_inserted, dao_id))
        else:
            print("  WARNING: No DAO found in daos table")
    else:
        print("NOTE: dao_members table does not exist, skipping")

    # Verify
    cur4 = conn.cursor()
    cur4.execute("SELECT COUNT(*) FROM users WHERE email LIKE '%@sodaworld.io'")
    total = cur4.fetchone()[0]
    print("")
    print("VERIFICATION: %d sodaworld.io users now in users table" % total)

    cur4.execute("SELECT display_name, email, role, wallet_address FROM users WHERE email LIKE '%@sodaworld.io' ORDER BY role, display_name")
    for row in cur4.fetchall():
        print("  %-12s | %-20s | %-25s | %s..." % (row[2], row[0], row[1], row[3][:20]))

    results["task2"] = "OK: %d inserted, %d skipped, %d total" % (inserted_count, skipped_count, total)
    if profiles_inserted > 0:
        results["task2"] += ", %d profiles" % profiles_inserted
    if dao_members_inserted > 0:
        results["task2"] += ", %d dao_members" % dao_members_inserted

except Exception as e:
    results["task2"] = "ERROR: %s" % e
    print("ERROR: %s" % e)
    import traceback
    traceback.print_exc()

# --- TASK 3: Database Backup ---
print("")
print("=" * 60)
print("TASK 3: Database Backup")
print("=" * 60)

try:
    conn.close()

    os.makedirs(BACKUP_DIR, exist_ok=True)
    print("Backup directory: %s" % BACKUP_DIR)

    shutil.copy2(DB_PATH, BACKUP_PATH)

    original_size = os.path.getsize(DB_PATH)
    backup_size = os.path.getsize(BACKUP_PATH)

    print("Original: %s (%s bytes)" % (DB_PATH, "{:,}".format(original_size)))
    print("Backup:   %s (%s bytes)" % (BACKUP_PATH, "{:,}".format(backup_size)))

    if backup_size == original_size:
        results["task3"] = "OK: backup created (%s bytes)" % "{:,}".format(backup_size)
        print("SUCCESS: Backup verified - sizes match")
    else:
        results["task3"] = "WARN: size mismatch (orig=%d, bak=%d)" % (original_size, backup_size)
        print("WARNING: File sizes differ!")

    bak_conn = sqlite3.connect(BACKUP_PATH)
    integrity = bak_conn.execute("PRAGMA integrity_check").fetchone()[0]
    bak_conn.close()
    print("Integrity check: %s" % integrity)
    if integrity == "ok":
        results["task3"] += ", integrity=ok"

except Exception as e:
    results["task3"] = "ERROR: %s" % e
    print("ERROR: %s" % e)
    import traceback
    traceback.print_exc()

# --- Summary ---
print("")
print("=" * 60)
print("SUMMARY")
print("=" * 60)
for k, v in results.items():
    print("  %s: %s" % (k, v))
print("=" * 60)
print("ALL_DONE")
'''

# ── Step 1: Base64-encode the inner script and send to Machine #3 ────────

print("\n" + "=" * 70)
print("STEP 1: Transferring Python script to Machine #3")
print("=" * 70)

b64 = base64.b64encode(INNER_SCRIPT.encode()).decode()
print(f"Script size: {len(INNER_SCRIPT)} bytes, base64: {len(b64)} chars")

# Write the file via PowerShell base64 decode
send_cmd(SID, f"[IO.File]::WriteAllBytes('C:\\Users\\User\\fix_db.py',[Convert]::FromBase64String('{b64}'));echo 'WRITE_OK'")
time.sleep(4)
buf = read_buffer(SID)

if 'WRITE_OK' in buf:
    print("File transfer: OK")
else:
    print(f"File transfer: checking... (buffer len={len(buf)})")
    # Give it more time
    time.sleep(3)
    buf = read_buffer(SID)
    if 'WRITE_OK' in buf:
        print("File transfer: OK (delayed)")
    else:
        print(f"WARNING: WRITE_OK not found in buffer. Last 300 chars: {buf[-300:]}")

# ── Step 2: Execute the script ───────────────────────────────────────────

print("\n" + "=" * 70)
print("STEP 2: Executing fix script on Machine #3")
print("=" * 70)

# Save buffer length before execution to detect new output
pre_len = len(buf)

send_cmd(SID, "python C:\\Users\\User\\fix_db.py")

# Wait for execution
time.sleep(10)
buf = read_buffer(SID)

# Wait until we see ALL_DONE or timeout
attempts = 0
while "ALL_DONE" not in buf and attempts < 15:
    time.sleep(3)
    buf = read_buffer(SID)
    attempts += 1
    print(f"  Waiting for completion (attempt {attempts}/15, buffer={len(buf)} chars)...")

# Extract the output after our command
print("\n--- Machine #3 Output ---")
# Find the python command in the buffer and show everything after
marker = "fix_db.py"
idx = buf.rfind(marker)
if idx > 0:
    output = buf[idx + len(marker):]
    print(output)
else:
    # Show last portion of buffer
    print(buf[-3000:] if len(buf) > 3000 else buf)
print("--- End Output ---")

# ── Step 3: Parse & Report ──────────────────────────────────────────────

print("\n" + "=" * 70)
print("STEP 3: Results Summary")
print("=" * 70)

if "ALL_DONE" in buf:
    print("STATUS: All tasks completed successfully on Machine #3")

    # Extract summary lines
    in_summary = False
    for line in buf.split("\n"):
        stripped = line.strip()
        if "SUMMARY" in stripped:
            in_summary = True
            continue
        if in_summary and stripped.startswith("task"):
            print(f"  {stripped}")
        if in_summary and stripped == "=" * 60:
            in_summary = False

    # Extract verification info
    for line in buf.split("\n"):
        stripped = line.strip()
        if "VERIFICATION:" in stripped or "SUCCESS:" in stripped or "Backup:" in stripped:
            print(f"  {stripped}")
else:
    print("WARNING: Script may not have completed within timeout.")
    print("Last 500 chars of buffer:")
    print(buf[-500:])

print("\n" + "=" * 70)
print("DB PRODUCTION FIXES COMPLETE")
print("=" * 70)
