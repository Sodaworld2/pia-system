import urllib.request, json, time

BASE = "http://100.102.217.69:5003"

endpoints = [
    ("GET", "/api/health"),
    ("GET", "/api/dao"),
    ("GET", "/api/council"),
    ("GET", "/api/proposals"),
    ("GET", "/api/agreements"),
    ("GET", "/api/milestones"),
    ("GET", "/api/marketplace"),
    ("GET", "/api/knowledge"),
    ("GET", "/api/bounties"),
    ("GET", "/api/bubbles"),
    ("GET", "/api/treasury"),
    ("GET", "/api/token-distribution"),
    ("GET", "/api/token-distribution/history"),
    ("GET", "/api/admin/logs"),
    ("GET", "/api/brain/status"),
    ("GET", "/api/brain/personas"),
    ("GET", "/api/modules"),
    ("GET", "/api/modules/registry"),
    ("GET", "/api/signatures"),
]

print("=" * 60)
print("COMPREHENSIVE API ENDPOINT TEST")
print(f"Target: {BASE}")
print("=" * 60)

passed = 0
failed = 0
results = []

for method, path in endpoints:
    try:
        url = BASE + path
        req = urllib.request.Request(url, method=method)
        start = time.time()
        resp = urllib.request.urlopen(req, timeout=10)
        elapsed = int((time.time() - start) * 1000)
        code = resp.getcode()
        body = resp.read().decode()[:200]

        # Check if response has data
        try:
            data = json.loads(body[:2000] if len(body) > 2000 else body + resp.read().decode()[:2000])
            has_data = bool(data.get('data') or data.get('success') or data.get('status'))
        except:
            has_data = len(body) > 10

        status = "PASS" if code == 200 and has_data else "WARN"
        if status == "PASS":
            passed += 1
        print(f"  {status}  {method:4} {path:40} {code} {elapsed:4}ms  {body[:80]}")
        results.append((path, status, code))
    except urllib.error.HTTPError as e:
        failed += 1
        print(f"  FAIL  {method:4} {path:40} {e.code}")
        results.append((path, "FAIL", e.code))
    except Exception as e:
        failed += 1
        print(f"  FAIL  {method:4} {path:40} {str(e)[:50]}")
        results.append((path, "FAIL", str(e)[:30]))

# Test POST brain/chat (special case)
print(f"\n  --- POST endpoints ---")
try:
    url = BASE + "/api/brain/chat"
    data = json.dumps({"prompt": "Hello", "sessionId": "test-session", "daoId": 1}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    start = time.time()
    resp = urllib.request.urlopen(req, timeout=15)
    elapsed = int((time.time() - start) * 1000)
    body = resp.read().decode()[:200]
    code = resp.getcode()
    status = "PASS" if code == 200 else "WARN"
    if status == "PASS":
        passed += 1
    print(f"  {status}  POST /api/brain/chat                         {code} {elapsed:4}ms  {body[:80]}")
except urllib.error.HTTPError as e:
    failed += 1
    body = e.read().decode()[:100]
    print(f"  FAIL  POST /api/brain/chat                         {e.code}       {body[:60]}")
except Exception as e:
    failed += 1
    print(f"  FAIL  POST /api/brain/chat                         {str(e)[:50]}")

# Test static file serving (production build)
print(f"\n  --- Static / Frontend ---")
try:
    url = BASE + "/dashboard/overview"
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req, timeout=10)
    body = resp.read().decode()[:500]
    has_html = '<html' in body.lower() or '<!doctype' in body.lower()
    status = "PASS" if has_html else "WARN"
    if status == "PASS":
        passed += 1
    print(f"  {status}  GET  /dashboard/overview (SPA catch-all)    {resp.getcode()}        {'HTML served' if has_html else body[:50]}")
except Exception as e:
    failed += 1
    print(f"  FAIL  GET  /dashboard/overview                     {str(e)[:50]}")

total = passed + failed
print(f"\n{'=' * 60}")
print(f"RESULTS: {passed}/{total} passed, {failed} failed")
print(f"{'=' * 60}")
