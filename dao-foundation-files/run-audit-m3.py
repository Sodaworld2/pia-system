import urllib.request, json, time, re, base64

M3_PIA = "http://100.102.217.69:3000"
SID = "8Tt609LYFkJ5KRWOgrBZH"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=10000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# Read the audit script and base64 encode it
with open("C:/Users/mic/Downloads/pia-system/dao-foundation-files/audit-inner.py", "r") as f:
    script = f.read()

b64 = base64.b64encode(script.encode()).decode()
send_cmd("[IO.File]::WriteAllBytes('C:\\Users\\User\\audit_db.py',[Convert]::FromBase64String('" + b64 + "'));echo 'WRITTEN'")
time.sleep(2)
print("Transferred. Running audit...")
send_cmd("python C:\\Users\\User\\audit_db.py")
time.sleep(10)
output = read_buffer(10000)
print(output)
