# Machine 3 (SODA-YETI) — Reconnect to Hub

You are Claude, running on Machine 3 (SODA-YETI). PIA is already installed but needs to run in **local spoke** mode connecting to the hub on Machine 1 (Izzit7).

## Step 1: Stop PIA

Kill the current PIA process:

```bash
# Find the PIA process on port 3000
netstat -ano | findstr :3000
# Kill it by PID
taskkill /f /pid <THE_PID>
```

Or if it's in a terminal, just `Ctrl+C`.

## Step 2: Pull latest code

```bash
cd ~/Downloads/pia-system
git pull
npm install
```

## Step 3: Create or fix the .env file

**IMPORTANT: git pull does NOT update .env (it's gitignored).** You must check and fix it manually.

Check current mode:
```bash
cat .env | grep PIA_MODE
```

If it says `PIA_MODE=hub` or the file doesn't exist, you need to fix it.

**Write this exact content to `.env`:**

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

### CRITICAL: These must be exact
- `PIA_MODE=local` (NOT `hub`)
- `PIA_HUB_URL=http://100.73.133.3:3000` (NOT `localhost`)
- `PIA_SECRET_TOKEN=pia-local-dev-token-2024` (must match hub exactly)
- `PIA_JWT_SECRET=pia-jwt-secret-2024` (must match hub exactly)

## Step 4: Clean up restart trigger in index.ts

A previous remote config attempt added a comment to `src/index.ts`. Check and remove it:

```bash
head -1 src/index.ts
```

If the first line says `// Restart trigger: ...`, remove it:
```bash
sed -i '1{/^\/\/ Restart trigger/d}' src/index.ts
```

## Step 5: Start PIA

```bash
npm run dev
```

You should see output like:
```
[hub-client] Connecting to hub at ws://100.73.133.3:3001
[hub-client] Authenticated with hub
[hub-client] Registered as Machine-3
```

If you see `auth failed`, double-check `PIA_SECRET_TOKEN` matches exactly.

## Step 6: Verify

```bash
# Check local health — MUST say "mode":"local" (NOT "hub")
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

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `mode: "hub"` after restart | .env still says `PIA_MODE=hub` — fix it and restart |
| WebSocket auth failed | `PIA_SECRET_TOKEN` doesn't match. Must be `pia-local-dev-token-2024` |
| Can't reach hub | Check Tailscale: `tailscale status`. Try `ping 100.73.133.3` |
| Port 3000 in use | Old process still running: `netstat -ano \| findstr :3000` then `taskkill /f /pid <PID>` |
| `// Restart trigger` in index.ts | Remove it: `sed -i '1{/^\/\/ Restart trigger/d}' src/index.ts` |
