import urllib.request, json, time, re, base64

M3_PIA = "http://100.102.217.69:3000"
SID = "8Tt609LYFkJ5KRWOgrBZH"

def send_cmd(cmd):
    data = json.dumps({"data": cmd + "\r\n"}).encode()
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}/input", data=data, headers={"Content-Type": "application/json"}, method="POST")
    return urllib.request.urlopen(req, timeout=10).read().decode()

def read_buffer(chars=6000):
    req = urllib.request.Request(f"{M3_PIA}/api/sessions/{SID}")
    data = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    buf = data.get("buffer", "")
    clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', buf[-chars:])
    clean = re.sub(r'\x1b\[\?[0-9;]*[a-zA-Z]', '', clean)
    return ''.join(c if ord(c) < 128 else '?' for c in clean)

# Inner script that will run on Machine #3
inner_lines = [
    'import re, shutil, os',
    '',
    'index_path = r"C:\\Users\\User\\Documents\\GitHub\\DAOV1\\backend\\src\\index.ts"',
    '',
    'with open(index_path, "r", encoding="utf-8") as f:',
    '    content = f.read()',
    '',
    'if "express.static" in content and "dist" in content:',
    '    print("Already patched!")',
    'else:',
    '    if "import path from" not in content:',
    '        content = "import path from \'path\';\\n" + content',
    '',
    '    static_block = "// Serve production frontend build\\n"',
    '    static_block += "    const distPath = path.resolve(__dirname, \'../../dist\');\\n"',
    '    static_block += "    app.use(express.static(distPath));\\n\\n"',
    '    static_block += "    // SPA catch-all\\n"',
    '    static_block += "    app.get(\'*\', (req, res) => {\\n"',
    '    static_block += "      if (!req.path.startsWith(\'/api/\')) {\\n"',
    '    static_block += "        res.sendFile(path.join(distPath, \'index.html\'));\\n"',
    '    static_block += "      }\\n"',
    '    static_block += "    });\\n\\n    "',
    '',
    '    content = content.replace("app.listen(port,", static_block + "app.listen(port,")',
    '',
    '    with open(index_path, "w", encoding="utf-8") as f:',
    '        f.write(content)',
    '    print("PATCHED - added static file serving")',
    '',
    '# Copy HTML docs to dist',
    'daov1 = r"C:\\Users\\User\\Documents\\GitHub\\DAOV1"',
    'dist = os.path.join(daov1, "dist")',
    'docs_dist = os.path.join(dist, "docs")',
    'os.makedirs(docs_dist, exist_ok=True)',
    '',
    'copied = 0',
    'for f in os.listdir(daov1):',
    '    if f.endswith(".html") and f != "index.html":',
    '        shutil.copy2(os.path.join(daov1, f), os.path.join(dist, f))',
    '        copied += 1',
    '',
    'docs_src = os.path.join(daov1, "docs")',
    'if os.path.exists(docs_src):',
    '    for root, dirs, files in os.walk(docs_src):',
    '        for f in files:',
    '            if f.endswith(".html"):',
    '                src = os.path.join(root, f)',
    '                rel = os.path.relpath(src, docs_src)',
    '                dst = os.path.join(docs_dist, rel)',
    '                os.makedirs(os.path.dirname(dst), exist_ok=True)',
    '                shutil.copy2(src, dst)',
    '                copied += 1',
    '',
    'print(f"Copied {copied} HTML docs to dist/")',
    'print("DONE")',
]

inner_script = "\n".join(inner_lines)
b64 = base64.b64encode(inner_script.encode()).decode()
send_cmd("[IO.File]::WriteAllBytes('C:\\Users\\User\\patch_static.py',[Convert]::FromBase64String('" + b64 + "'));echo 'WRITTEN'")
time.sleep(2)
send_cmd("python C:\\Users\\User\\patch_static.py")
time.sleep(5)
print("=== PATCH RESULT ===")
print(read_buffer(3000))

# Kill old server and restart
send_cmd("npx kill-port 5003")
time.sleep(4)

send_cmd(r"cd C:\Users\User\Documents\GitHub\DAOV1\backend; npx tsx src/index.ts")
time.sleep(15)
print("\n=== SERVER RESTART ===")
print(read_buffer(4000))
