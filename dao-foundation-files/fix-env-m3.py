import json, base64, urllib.request, time, re

M3_PIA = "http://100.102.217.69:3000"
SESSION = "l-2KVfMrHVDzLJqwn91tT"

def send_cmd(cmd):
    payload = json.dumps({"data": cmd + "\r\n"})
    req = urllib.request.Request(
        f"{M3_PIA}/api/sessions/{SESSION}/input",
        data=payload.encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=2000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SESSION}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return clean

script = r'''import os

envpath = r"C:\Users\User\Documents\GitHub\DAOV1\backend\.env"

# Read the file as binary to handle any encoding
with open(envpath, "rb") as f:
    raw = f.read()

# Detect if UTF-16 (BOM or null bytes)
if b"\xff\xfe" in raw[:4] or b"\x00" in raw[:10]:
    print("File is UTF-16, converting to UTF-8...")
    content = raw.decode("utf-16")
else:
    content = raw.decode("utf-8")

# Parse existing vars
lines = [l.strip() for l in content.split("\n") if l.strip() and not l.strip().startswith("#")]
print("Existing vars:", [l.split("=")[0] for l in lines])

# Rewrite as clean UTF-8
new_content = """PORT=5003
NODE_ENV=development
GEMINI_API_KEY=test-key-for-local-dev
ADMIN_PASSWORD=LocalTestAdmin2026secure

# Claude AI Integration
ANTHROPIC_API_KEY=REDACTED_KEY
"""

with open(envpath, "w", encoding="utf-8") as f:
    f.write(new_content)

# Verify
with open(envpath, "r", encoding="utf-8") as f:
    print("\nNew .env:")
    for line in f:
        print("  " + line.strip())

print("\nENV_FIXED")
'''

b64 = base64.b64encode(script.encode()).decode()
ps = "[IO.File]::WriteAllBytes('C:\\Users\\User\\fixenv.py',[Convert]::FromBase64String('" + b64 + "'));echo 'OK'"
print(send_cmd(ps))
time.sleep(2)
print(send_cmd("python C:\\Users\\User\\fixenv.py"))
time.sleep(6)
print(read_buffer())
