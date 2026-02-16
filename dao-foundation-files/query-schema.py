import urllib.request, json, time, re, base64

M3_PIA = "http://100.102.217.69:3000"
SID = "8Tt609LYFkJ5KRWOgrBZH"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=12000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

inner_script = r'''
import sqlite3, json

db = sqlite3.connect(r'C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db')
db.row_factory = sqlite3.Row
cur = db.cursor()

# Get all tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print("=== TABLES ===")
for t in tables:
    print(f"  {t}")

print("\n=== SCHEMAS ===")
for t in tables:
    cur.execute(f"PRAGMA table_info({t})")
    cols = cur.fetchall()
    print(f"\n-- {t} --")
    for c in cols:
        print(f"  {c[1]} ({c[2]}) {'PK' if c[5] else ''} {'NOT NULL' if c[3] else 'NULLABLE'}")

print("\n=== ROW COUNTS ===")
for t in tables:
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    cnt = cur.fetchone()[0]
    print(f"  {t}: {cnt}")

# Sample existing data for key tables
for t in ['proposals', 'milestones', 'marketplace_items', 'knowledge_items', 'bounties', 'treasury_transactions', 'proposal_votes', 'agreement_signatures', 'council_members', 'daos']:
    if t in tables:
        cur.execute(f"SELECT * FROM {t} LIMIT 2")
        rows = cur.fetchall()
        if rows:
            print(f"\n=== SAMPLE {t} ===")
            cols_names = [desc[0] for desc in cur.description]
            print(f"  Columns: {cols_names}")
            for r in rows:
                print(f"  Row: {dict(zip(cols_names, r))}")

db.close()
print("\nDONE_SCHEMA_QUERY")
'''

b64 = base64.b64encode(inner_script.encode()).decode()
send_cmd("[IO.File]::WriteAllBytes('C:\\Users\\User\\query_schema.py',[Convert]::FromBase64String('" + b64 + "'));echo 'WRITTEN'")
time.sleep(2)
print("File written, running...")
send_cmd("python C:\\Users\\User\\query_schema.py")
time.sleep(8)
output = read_buffer(12000)
print(output)
