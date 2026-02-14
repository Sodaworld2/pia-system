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
# Read the actual .env file
envpath = r"C:\Users\User\Documents\GitHub\DAOV1\backend\.env"
print("=== .env contents ===")
with open(envpath) as f:
    for line in f:
        print("  " + repr(line.strip()))

# Check if the env var is set in the current process
print("\n=== ENV VAR CHECK ===")
print(f"  ANTHROPIC_API_KEY set: {'ANTHROPIC_API_KEY' in os.environ}")
print(f"  GEMINI_API_KEY set: {'GEMINI_API_KEY' in os.environ}")

# Check how backend loads dotenv
print("\n=== DOTENV USAGE ===")
for f in [r"C:\Users\User\Documents\GitHub\DAOV1\backend\src\index.ts",
          r"C:\Users\User\Documents\GitHub\DAOV1\backend\src\config.ts"]:
    if os.path.exists(f):
        with open(f) as fh:
            for i, line in enumerate(fh):
                if 'dotenv' in line.lower() or 'ANTHROPIC' in line or '.env' in line:
                    print(f"  {os.path.basename(f)}:{i+1}: {line.strip()}")

print("\nENV_CHECK_DONE")
'''

b64 = base64.b64encode(script.encode()).decode()
ps = "[IO.File]::WriteAllBytes('C:\\Users\\User\\chk.py',[Convert]::FromBase64String('" + b64 + "'));echo 'OK'"
print(send_cmd(ps))
time.sleep(2)
print(send_cmd("python C:\\Users\\User\\chk.py"))
time.sleep(6)
print(read_buffer())
