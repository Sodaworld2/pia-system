# Machine 2 (soda-monster-hunter) — Setup Instructions

You are Claude, running on Machine 2 (soda-monster-hunter). Your job is to get PIA running as a **local spoke** that connects back to the hub on Machine 1 (Izzit7).

## Step 1: Open the firewall

Run these in an **admin PowerShell**:

```powershell
New-NetFirewallRule -DisplayName "PIA HTTP" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "PIA WS" -Direction Inbound -Port 3001 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Allow Ping" -Direction Inbound -Protocol ICMPv4 -Action Allow
```

## Step 2: Install dependencies

```bash
npm install
```

If `better-sqlite3` or `node-pty` fail, you need build tools:
```powershell
npm install --global windows-build-tools
```

## Step 3: Create the .env file

Create a file called `.env` in the project root (`pia-system/.env`) with this exact content:

```env
# PIA Configuration - Machine #2 (LOCAL SPOKE)
PIA_MODE=local
PIA_PORT=3000
PIA_HOST=0.0.0.0
PIA_WS_PORT=3001
PIA_SECRET_TOKEN=pia-local-dev-token-2024
PIA_JWT_SECRET=pia-jwt-secret-2024
PIA_HUB_URL=http://100.73.133.3:3000
PIA_MACHINE_NAME=Machine-2
PIA_AI_PRIMARY=ollama
PIA_AI_FALLBACK=claude
PIA_OLLAMA_URL=http://localhost:11434
PIA_OLLAMA_MODEL=qwen2.5-coder:7b
PIA_DB_PATH=./data/pia.db
PIA_ENABLE_AUTO_HEALER=true
PIA_ENABLE_PUSH_NOTIFICATIONS=true
PIA_HEARTBEAT_INTERVAL=30000
PIA_STUCK_THRESHOLD=300000
PIA_LOG_LEVEL=info
```

**Do NOT change the tokens** — they must match the hub exactly.

## Step 4: Start PIA

```bash
npm run dev
```

## Step 5: Verify

```bash
# Check local health — should say "mode":"local"
curl http://localhost:3000/api/health

# Check hub sees you — Machine-2 should be listed as online
curl http://100.73.133.3:3000/api/mc/machines
```

## Step 6: Confirm

Once both checks pass, you're done. Machine 1 (Izzit7) will see you in Mission Control and can send you tasks.

If `curl http://100.73.133.3:3000` times out, check:
- Is Tailscale running? (`tailscale status`)
- Can you ping 100.73.133.3? (`ping 100.73.133.3`)
- If not, try the LAN IP instead: replace `100.73.133.3` with `192.168.0.2` in the .env
