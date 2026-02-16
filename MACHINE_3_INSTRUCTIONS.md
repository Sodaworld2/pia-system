# Machine 3 (SODA-YETI) — Reconnect to Hub

You are Claude, running on Machine 3 (SODA-YETI). PIA is already installed but running in the wrong mode. You need to switch it to **local spoke** mode so it connects to the hub on Machine 1 (Izzit7).

## Step 1: Stop PIA

Kill the current PIA process:

```bash
# If running in a terminal, Ctrl+C it. Or:
taskkill /f /im node.exe
```

**Warning:** `taskkill /f /im node.exe` kills ALL node processes. If you have other node apps running (like the DAO backend), find just the PIA process:
```bash
netstat -ano | findstr :3000
taskkill /f /pid <THE_PID>
```

## Step 2: Check the .env file

The `.env` should already be updated (it was changed remotely). Verify it says:

```env
PIA_MODE=local
PIA_HUB_URL=http://100.73.133.3:3000
PIA_MACHINE_NAME=Machine-3
```

If it still says `PIA_MODE=hub` or `PIA_HUB_URL=http://localhost:3000`, update it to match this:

```env
# PIA Configuration - Machine #3 (LOCAL SPOKE)
PIA_MODE=local
PIA_PORT=3000
PIA_HOST=0.0.0.0
PIA_WS_PORT=3001
PIA_SECRET_TOKEN=pia-local-dev-token-2024
PIA_JWT_SECRET=pia-jwt-secret-2024
PIA_HUB_URL=http://100.73.133.3:3000
PIA_MACHINE_NAME=Machine-3
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

## Step 3: Install any new dependencies

```bash
npm install
```

## Step 4: Clean up the restart trigger

A restart trigger comment was added to `src/index.ts` remotely. Remove the first line if it says `// Restart trigger: 1771248010`:

```bash
# Check first line
head -1 src/index.ts
# If it's a restart trigger comment, remove it:
sed -i '1{/^\/\/ Restart trigger/d}' src/index.ts
```

## Step 5: Start PIA

```bash
npm run dev
```

## Step 6: Verify

```bash
# Check local health — should say "mode":"local"
curl http://localhost:3000/api/health

# Check hub sees you — Machine-3 should be listed as online
curl http://100.73.133.3:3000/api/mc/machines
```

## Step 7: Open firewall (if not already done)

```powershell
New-NetFirewallRule -DisplayName "PIA HTTP" -Direction Inbound -Port 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "PIA WS" -Direction Inbound -Port 3001 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Allow Ping" -Direction Inbound -Protocol ICMPv4 -Action Allow
```

## Done

Once the hub sees Machine-3 as online, you're connected. The hub (Izzit7) will show you in Mission Control alongside Machine-2 and itself.
