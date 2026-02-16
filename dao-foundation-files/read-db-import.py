"""
Read the top of a simpler route file (like tokens.ts or health.ts)
to see how db is imported.
"""
import urllib.request, json, time, re

M3_PIA = "http://100.102.217.69:3000"
SID = "T-AXG0m3zFHP_H7pL5uj9"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(
        f"{M3_PIA}/api/sessions/{SID}/input",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=6000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# Read just the top of tokens.ts to see imports
print("=== Top of tokens.ts ===")
send_cmd("powershell -Command \"Get-Content 'C:\\Users\\User\\Documents\\GitHub\\DAOV1\\backend\\src\\routes\\tokens.ts' -Head 20\"")
time.sleep(3)
buf = read_buffer(3000)
print(buf)

print("\n=== Top of dao.ts (simpler route) ===")
send_cmd("powershell -Command \"Get-Content 'C:\\Users\\User\\Documents\\GitHub\\DAOV1\\backend\\src\\routes\\dao.ts' -Head 20\"")
time.sleep(3)
buf = read_buffer(3000)
print(buf)
