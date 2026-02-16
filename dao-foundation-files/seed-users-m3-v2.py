import urllib.request, json, time, re, base64

M3_PIA = "http://100.102.217.69:3000"
# Try multiple sessions to find a clean one
SESSIONS = ["HqA499aMwerKweRs-tpYV", "Z14uMWLxwnew2F1KQ5QmL", "aMbphI23SGQ8nIRfHCyCy"]

def send_cmd(sid, cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{sid}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(sid, chars=12000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{sid}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# Find a clean session
SID = None
for sid in SESSIONS:
    try:
        buf = read_buffer(sid, 500)
        # Check if it has a PS prompt (not filled with server logs)
        if 'PS C:\\' in buf and 'tsx src/index.ts' not in buf[-200:]:
            SID = sid
            print(f"Using session: {sid}")
            break
    except:
        continue

if not SID:
    SID = SESSIONS[0]
    print(f"Defaulting to session: {SID}")

# Read the inner script and encode
with open('seed-users-inner.py', 'r') as f:
    script_content = f.read()
b64 = base64.b64encode(script_content.encode()).decode()

# Transfer script to Machine #3
cmd = f"[IO.File]::WriteAllBytes('C:\\Users\\User\\seed_users.py',[Convert]::FromBase64String('{b64}'));echo 'SEED_SCRIPT_WRITTEN'"
send_cmd(SID, cmd)
time.sleep(3)
buf = read_buffer(SID, 2000)
print("Transfer check:", "OK" if 'SEED_SCRIPT_WRITTEN' in buf else "checking...")
print(buf[-300:])

# Execute the seed script
send_cmd(SID, "python C:\\Users\\User\\seed_users.py")
time.sleep(6)
print("\n=== SEED RESULTS ===")
print(read_buffer(SID, 8000))
