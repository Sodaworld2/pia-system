# PIA System — Machine 2 Setup Briefing

## Who is this for?
You are Claude, running on Machine 2. Your job is to get PIA running on this machine as a **local agent** that connects back to Machine 1 (the hub).

## Context
PIA (Project Intelligence Agent) is a multi-machine AI agent orchestration system. Machine 1 is already running as the hub. This machine (Machine 2) needs to run as a **local agent** that reports to Machine 1.

**Machine 2 stores its own full copy of the repository.** The code is the same, but each machine has its own `.env` config (Machine 1 = hub, Machine 2 = local), its own database (`data/pia.db`), and its own installed dependencies. They are independent installs that communicate over the network.

The repository is at: https://github.com/Sodaworld2/pia-system.git

---

## Step-by-step instructions

### Step 1: Verify prerequisites
Check that the following are installed:
- **Node.js 20+** (`node --version` — must be 20.x or higher)
- **npm** (`npm --version`)
- **Git** (`git --version`)

If Node.js is not installed or is below v20, install it from https://nodejs.org (LTS version).

### Step 2: Clone the repository
```bash
git clone https://github.com/Sodaworld2/pia-system.git
cd pia-system
```

### Step 3: Install dependencies
```bash
npm install
```

If you get errors about `better-sqlite3` or `node-pty`, you may need build tools:
- **Windows:** `npm install --global windows-build-tools` or install Visual Studio Build Tools
- **Mac:** `xcode-select --install`
- **Linux:** `sudo apt-get install build-essential python3`

### Step 4: Create the .env file
Create a file called `.env` in the project root with this content:

```env
# PIA Configuration — MACHINE 2 (LOCAL AGENT)

# Mode: This machine is a LOCAL agent, not the hub
PIA_MODE=local

# Server — use different ports if Machine 1 is on the same network
PIA_PORT=3000
PIA_HOST=0.0.0.0
PIA_WS_PORT=3001

# Security — MUST match Machine 1's tokens
PIA_SECRET_TOKEN=pia-local-dev-token-2024
PIA_JWT_SECRET=pia-jwt-secret-2024

# Hub connection — Machine 1's address
# Replace with Machine 1's actual IP address
PIA_HUB_URL=http://MACHINE_1_IP:3000
PIA_MACHINE_NAME=Machine 2

# AI Configuration
# Option A: Use Ollama locally (recommended — install Ollama first)
PIA_AI_PRIMARY=ollama
PIA_AI_FALLBACK=claude
PIA_OLLAMA_URL=http://localhost:11434
PIA_OLLAMA_MODEL=qwen2.5-coder:7b

# Option B: Use Claude API (need an API key)
# PIA_AI_PRIMARY=claude
# ANTHROPIC_API_KEY=sk-ant-...your-key-here...

# Database — local to this machine
PIA_DB_PATH=./data/pia.db

# Features
PIA_ENABLE_AUTO_HEALER=true
PIA_ENABLE_PUSH_NOTIFICATIONS=true
PIA_LOG_LEVEL=info
```

**IMPORTANT:** Replace `MACHINE_1_IP` with the actual IP address of Machine 1. Ask the user for this.

### Step 5: Build the project
```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

### Step 6: Start PIA
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

### Step 7: Verify it's running
Open a browser and go to: `http://localhost:3000`

You should see the PIA dashboard. Check:
- [ ] Dashboard loads without errors
- [ ] Status shows "local" mode
- [ ] Machine name shows "Machine 2"

### Step 8: Test the API
Run these quick checks:
```bash
# Health check
curl http://localhost:3000/api/machines

# Check relay status
curl http://localhost:3000/api/relay/stats
```

### Step 9: Register with Machine 1
Once both machines are running, Machine 2 needs to announce itself to Machine 1:

```bash
curl -X POST http://MACHINE_1_IP:3000/api/relay/register \
  -H "Content-Type: application/json" \
  -d '{
    "id": "machine-2",
    "name": "Machine 2",
    "hostname": "'$(hostname)'",
    "channels": ["api"]
  }'
```

You should get back a `201` with `status: "registered"`.

---

## Verification checklist
After setup, confirm:
- [ ] `npm run build` completes without errors
- [ ] `npm start` launches the server on port 3000
- [ ] `http://localhost:3000` loads the dashboard
- [ ] `/api/machines` returns a JSON response
- [ ] `/api/relay/stats` returns relay statistics
- [ ] Machine identity shows "Machine 2" in the dashboard

## Troubleshooting
- **Port 3000 already in use:** Change `PIA_PORT` in `.env` to 3001 or another free port
- **better-sqlite3 build fails:** Install build tools (see Step 3)
- **node-pty build fails:** Same — needs native build tools
- **Cannot connect to Machine 1:** Check Machine 1's IP, make sure its firewall allows port 3000

## Key files to know
- `src/config.ts` — all configuration, reads from `.env`
- `src/api/server.ts` — Express API server
- `src/comms/cross-machine.ts` — relay system for machine-to-machine communication
- `src/tunnel/pty-wrapper.ts` — local terminal control
- `public/mission-control.html` — Mission Control dashboard
- `src/api/routes/relay.ts` — relay API endpoints

## What Machine 2 does
Once running, Machine 2:
1. Runs its own PIA API server locally
2. Can spawn and manage agents on this machine
3. Reports status back to Machine 1 (the hub)
4. Receives commands from Machine 1 via the relay system
5. Has its own local database for agents, tasks, etc.
