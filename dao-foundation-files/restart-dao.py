import urllib.request, json, time

sid = "aMbphI23SGQ8nIRfHCyCy"
url = f"http://100.102.217.69:3000/api/sessions/{sid}/input"

cmd = r"cd C:\Users\User\Documents\GitHub\DAOV1\backend; npx tsx src/index.ts" + "\r\n"
data = json.dumps({"data": cmd}).encode()
req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
resp = urllib.request.urlopen(req, timeout=10)
print("Send:", resp.read().decode())

print("Waiting 15s for server startup...")
time.sleep(15)

try:
    resp = urllib.request.urlopen("http://100.102.217.69:5003/api/health", timeout=5)
    print("Health:", resp.read().decode()[:200])
except Exception as e:
    print("Server not up yet:", e)
    time.sleep(10)
    try:
        resp = urllib.request.urlopen("http://100.102.217.69:5003/api/health", timeout=5)
        print("Health (2nd try):", resp.read().decode()[:200])
    except Exception as e2:
        print("Still down:", e2)

try:
    resp = urllib.request.urlopen("http://100.102.217.69:5003/api/brain/status", timeout=5)
    d = json.loads(resp.read().decode())
    for m in d.get("models", []):
        print(f"  {m['tier']}: available={m['available']} {m.get('reason','')}")
except:
    print("Brain status unavailable")
