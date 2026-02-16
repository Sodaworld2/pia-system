"""
Fix the server restart on Machine #3 (PowerShell uses ';' not '&&')
and verify the endpoints.
"""
import urllib.request, json, time, re

M3_PIA = "http://100.102.217.69:3000"
SID = "T-AXG0m3zFHP_H7pL5uj9"
BACKEND = r"C:\Users\User\Documents\GitHub\DAOV1\backend"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(
        f"{M3_PIA}/api/sessions/{SID}/input",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=8000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# ============================================================
# STEP 1: Kill existing server on port 5003
# ============================================================
print("STEP 1: Killing existing process on port 5003")
send_cmd("npx kill-port 5003")
time.sleep(6)
buf = read_buffer(2000)
print(buf[-400:])

# ============================================================
# STEP 2: cd into backend directory
# ============================================================
print("\nSTEP 2: cd into backend directory")
send_cmd(f"cd \"{BACKEND}\"")
time.sleep(2)
buf = read_buffer(1000)
print(buf[-300:])

# ============================================================
# STEP 3: Start the server
# ============================================================
print("\nSTEP 3: Starting the server with npx tsx src/index.ts")
send_cmd("npx tsx src/index.ts")
print("Waiting 15 seconds for server initialization...")
time.sleep(15)
buf = read_buffer(6000)
print("Server output:")
print(buf[-2000:])

# ============================================================
# STEP 4: Verify endpoints
# ============================================================
print("\n" + "=" * 60)
print("STEP 4: Verifying endpoints")
print("=" * 60)

# Test /api/knowledge
try:
    req = urllib.request.Request("http://100.102.217.69:5003/api/knowledge")
    resp = urllib.request.urlopen(req, timeout=10)
    body = resp.read().decode('utf-8')
    data = json.loads(body)
    print(f"\n/api/knowledge => HTTP {resp.status}")
    print(f"  success: {data.get('success')}")
    print(f"  count: {data.get('count')}")
    if data.get('data') and len(data['data']) > 0:
        print(f"  first item keys: {list(data['data'][0].keys())}")
        print(f"  sample: {json.dumps(data['data'][0], indent=2)[:400]}")
    else:
        print("  (no data rows)")
except Exception as e:
    print(f"\n/api/knowledge => FAILED: {e}")

# Test /api/bounties
try:
    req = urllib.request.Request("http://100.102.217.69:5003/api/bounties")
    resp = urllib.request.urlopen(req, timeout=10)
    body = resp.read().decode('utf-8')
    data = json.loads(body)
    print(f"\n/api/bounties => HTTP {resp.status}")
    print(f"  success: {data.get('success')}")
    print(f"  count: {data.get('count')}")
    if data.get('data') and len(data['data']) > 0:
        print(f"  first item keys: {list(data['data'][0].keys())}")
        print(f"  sample: {json.dumps(data['data'][0], indent=2)[:400]}")
    else:
        print("  (no data rows)")
except Exception as e:
    print(f"\n/api/bounties => FAILED: {e}")

# Also verify an existing endpoint still works
try:
    req = urllib.request.Request("http://100.102.217.69:5003/api/health")
    resp = urllib.request.urlopen(req, timeout=10)
    print(f"\n/api/health => HTTP {resp.status} (sanity check)")
except Exception as e:
    print(f"\n/api/health => FAILED: {e}")

print("\n" + "=" * 60)
print("DONE")
print("=" * 60)
