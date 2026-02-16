import urllib.request, json, time, re, base64

M3_PIA = "http://100.102.217.69:3000"
SID = "8Tt609LYFkJ5KRWOgrBZH"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=15000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

inner_script = r'''
import sqlite3, json

db = sqlite3.connect(r'C:\Users\User\Documents\GitHub\DAOV1\backend\mentor_chats.db')
cur = db.cursor()

# Get detailed schema for specific tables
for t in ['proposal_votes', 'agreement_signatures', 'agreements', 'votes', 'bubbles', 'treasury_approvals', 'treasury_policies', 'treasury_signers', 'admin_logs', 'token_distribution_groups', 'user_balances', 'generated_contracts', 'legal_frameworks']:
    cur.execute(f"PRAGMA table_info({t})")
    cols = cur.fetchall()
    print(f"\n-- {t} --")
    for c in cols:
        print(f"  {c[1]} ({c[2]}) {'PK' if c[5] else ''} {'NOT NULL' if c[3] else 'NULLABLE'}")

    # Sample data
    cur.execute(f"SELECT * FROM {t} LIMIT 2")
    rows = cur.fetchall()
    if rows:
        cols_names = [desc[0] for desc in cur.description]
        print(f"  Sample Columns: {cols_names}")
        for r in rows:
            print(f"  Sample: {dict(zip(cols_names, r))}")
    else:
        print(f"  (empty table)")

db.close()
print("\nDONE_SCHEMA2")
'''

b64 = base64.b64encode(inner_script.encode()).decode()
send_cmd("[IO.File]::WriteAllBytes('C:\\Users\\User\\query_schema2.py',[Convert]::FromBase64String('" + b64 + "'));echo 'WRITTEN'")
time.sleep(2)
send_cmd("python C:\\Users\\User\\query_schema2.py")
time.sleep(8)
output = read_buffer(15000)
print(output)
