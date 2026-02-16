"""
Deploy two new API routes to Machine #3's DAO backend:
  1. /api/knowledge  -> queries knowledge_items table
  2. /api/bounties   -> queries bounties table

Then patch index.ts to register them, restart the server, and verify.
"""
import urllib.request, json, time, re, base64

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
# STEP 1: Create knowledge.ts route file
# ============================================================
print("=" * 60)
print("STEP 1: Creating knowledge.ts route file")
print("=" * 60)

knowledge_ts = """\
import { Router } from 'express';
import db from '../database';

const router = Router();

// GET /api/knowledge - List all knowledge items
router.get('/', async (req, res) => {
  try {
    const items = await db('knowledge_items')
      .select('*')
      .orderBy('created_at', 'desc');

    res.json({
      success: true,
      data: items,
      count: items.length
    });
  } catch (error) {
    console.error('Error fetching knowledge items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch knowledge items'
    });
  }
});

// GET /api/knowledge/:id - Get single knowledge item
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await db('knowledge_items').where({ id }).first();

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Knowledge item not found'
      });
    }

    res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error('Error fetching knowledge item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch knowledge item'
    });
  }
});

export default router;
"""

b64_knowledge = base64.b64encode(knowledge_ts.encode('utf-8')).decode('ascii')
knowledge_path = BACKEND + r"\src\routes\knowledge.ts"

cmd = f"[IO.File]::WriteAllBytes('{knowledge_path}',[Convert]::FromBase64String('{b64_knowledge}'));echo 'KNOWLEDGE_OK'"
send_cmd(cmd)
time.sleep(3)
buf = read_buffer(2000)
if 'KNOWLEDGE_OK' in buf:
    print("[OK] knowledge.ts created successfully")
else:
    print("[WARN] Could not confirm knowledge.ts creation")
    print(buf[-500:])

# ============================================================
# STEP 2: Create bounties.ts route file
# ============================================================
print("\n" + "=" * 60)
print("STEP 2: Creating bounties.ts route file")
print("=" * 60)

bounties_ts = """\
import { Router } from 'express';
import db from '../database';

const router = Router();

// GET /api/bounties - List all bounties
router.get('/', async (req, res) => {
  try {
    const bounties = await db('bounties')
      .select('*')
      .orderBy('created_at', 'desc');

    res.json({
      success: true,
      data: bounties,
      count: bounties.length
    });
  } catch (error) {
    console.error('Error fetching bounties:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bounties'
    });
  }
});

// GET /api/bounties/:id - Get single bounty
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bounty = await db('bounties').where({ id }).first();

    if (!bounty) {
      return res.status(404).json({
        success: false,
        error: 'Bounty not found'
      });
    }

    res.json({
      success: true,
      data: bounty
    });
  } catch (error) {
    console.error('Error fetching bounty:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bounty'
    });
  }
});

export default router;
"""

b64_bounties = base64.b64encode(bounties_ts.encode('utf-8')).decode('ascii')
bounties_path = BACKEND + r"\src\routes\bounties.ts"

cmd = f"[IO.File]::WriteAllBytes('{bounties_path}',[Convert]::FromBase64String('{b64_bounties}'));echo 'BOUNTIES_OK'"
send_cmd(cmd)
time.sleep(3)
buf = read_buffer(2000)
if 'BOUNTIES_OK' in buf:
    print("[OK] bounties.ts created successfully")
else:
    print("[WARN] Could not confirm bounties.ts creation")
    print(buf[-500:])

# ============================================================
# STEP 3: Patch index.ts to register new routes
# ============================================================
print("\n" + "=" * 60)
print("STEP 3: Patching index.ts to register knowledge + bounties routes")
print("=" * 60)

# We need to:
# a) Add import lines after the existing imports
# b) Add app.use() lines after the existing route registrations
#
# Strategy: Read index.ts, find the right insertion points, write back.
# Using PowerShell to read, modify, and write the file.

# PowerShell script to patch index.ts
patch_script = r"""
$indexPath = 'C:\Users\User\Documents\GitHub\DAOV1\backend\src\index.ts'
$content = [IO.File]::ReadAllText($indexPath)

# Check if already patched
if ($content -match 'knowledgeRouter') {
    Write-Output 'ALREADY_PATCHED_KNOWLEDGE'
} else {
    # Add import after the modulesRouter import line
    $importAnchor = "import modulesRouter from './routes/modules';"
    $newImports = "import modulesRouter from './routes/modules';`nimport knowledgeRouter from './routes/knowledge';`nimport bountiesRouter from './routes/bounties';"
    $content = $content.Replace($importAnchor, $newImports)

    # Add route registration after the marketplace line
    $routeAnchor = "app.use('/api/marketplace', marketplaceRouter);"
    $newRoutes = "app.use('/api/marketplace', marketplaceRouter);`napp.use('/api/knowledge', knowledgeRouter);`napp.use('/api/bounties', bountiesRouter);"
    $content = $content.Replace($routeAnchor, $newRoutes)

    [IO.File]::WriteAllText($indexPath, $content)
    Write-Output 'PATCH_OK'
}
"""

b64_patch = base64.b64encode(patch_script.encode('utf-8')).decode('ascii')
patch_path = BACKEND + r"\patch-index.ps1"

# Write the patch script
cmd = f"[IO.File]::WriteAllBytes('{patch_path}',[Convert]::FromBase64String('{b64_patch}'));echo 'SCRIPT_WRITTEN'"
send_cmd(cmd)
time.sleep(2)
buf = read_buffer(2000)
print(f"Patch script written: {'SCRIPT_WRITTEN' in buf}")

# Execute the patch script
send_cmd(f"powershell -ExecutionPolicy Bypass -File \"{patch_path}\"")
time.sleep(4)
buf = read_buffer(3000)
if 'PATCH_OK' in buf:
    print("[OK] index.ts patched successfully")
elif 'ALREADY_PATCHED_KNOWLEDGE' in buf:
    print("[OK] index.ts was already patched (knowledge routes exist)")
else:
    print("[WARN] Could not confirm index.ts patch")
    print(buf[-800:])

# ============================================================
# STEP 4: Verify the files exist
# ============================================================
print("\n" + "=" * 60)
print("STEP 4: Verifying files exist on Machine #3")
print("=" * 60)

send_cmd(f"dir \"{BACKEND}\\src\\routes\\knowledge.ts\" \"{BACKEND}\\src\\routes\\bounties.ts\"")
time.sleep(2)
buf = read_buffer(2000)
has_knowledge = 'knowledge.ts' in buf
has_bounties = 'bounties.ts' in buf
print(f"knowledge.ts exists: {has_knowledge}")
print(f"bounties.ts exists: {has_bounties}")

# Also verify index.ts has our imports
send_cmd(f"powershell -Command \"Select-String -Path '{BACKEND}\\src\\index.ts' -Pattern 'knowledgeRouter|bountiesRouter'\"")
time.sleep(3)
buf = read_buffer(3000)
print(f"\nindex.ts grep for new routes:")
print(buf[-1000:])

# ============================================================
# STEP 5: Restart the server
# ============================================================
print("\n" + "=" * 60)
print("STEP 5: Restarting the DAO backend server")
print("=" * 60)

# Kill any existing process on port 5003
send_cmd(f"cd \"{BACKEND}\" && npx kill-port 5003")
time.sleep(5)
buf = read_buffer(2000)
print(f"Kill port output: {buf[-300:]}")

# Start the server in background
send_cmd(f"cd \"{BACKEND}\" && npx tsx src/index.ts")
print("Server starting... waiting 12 seconds for initialization")
time.sleep(12)
buf = read_buffer(6000)
print(f"Server output:\n{buf[-1500:]}")

# ============================================================
# STEP 6: Verify endpoints
# ============================================================
print("\n" + "=" * 60)
print("STEP 6: Verifying endpoints return 200")
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
    if data.get('data'):
        print(f"  first item keys: {list(data['data'][0].keys()) if data['data'] else 'empty'}")
        print(f"  sample: {json.dumps(data['data'][0], indent=2)[:300]}" if data['data'] else "  (no data)")
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
    if data.get('data'):
        print(f"  first item keys: {list(data['data'][0].keys()) if data['data'] else 'empty'}")
        print(f"  sample: {json.dumps(data['data'][0], indent=2)[:300]}" if data['data'] else "  (no data)")
except Exception as e:
    print(f"\n/api/bounties => FAILED: {e}")

print("\n" + "=" * 60)
print("DEPLOYMENT COMPLETE")
print("=" * 60)
