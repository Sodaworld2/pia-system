# PIA Remote Machine Setup - Instructions for Claude

**READ THIS FIRST. You are a Claude instance on a REMOTE machine.**
**Your job is to connect this machine to the PIA hub and make repos alive.**

---

## Context

The user (mic) has a multi-machine AI orchestration system called **PIA**.
The HUB is running on another computer (izzit7) at Tailscale IP `100.73.133.3`.
This machine needs to connect to that hub so both computers can talk to each other.

The user wants every repository on this machine to be "alive" - meaning it can receive tasks, execute them, track job history, and report back to the central PIA hub.

---

## Step-by-Step Setup

### 1. Install dependencies

```bash
cd <this-repo-directory>
npm install
npm run build
```

### 2. Check Tailscale

Tailscale must be installed and logged in with mic's account.

```bash
tailscale status
```

You should see `100.73.133.3 izzit7` in the list. If Tailscale is not installed:
- Download from https://tailscale.com/download
- Install and login with the SAME account as the hub machine

### 3. Test connection to the hub

```bash
curl -H "X-Api-Token: pia-local-dev-token-2024" http://100.73.133.3:3000/api/health
```

Expected response: `{"status":"ok","mode":"hub",...}`

If this fails:
- Check Tailscale is connected (`tailscale status`)
- Check Windows Firewall isn't blocking port 3000
- Try `ping 100.73.133.3`

### 4. Register this machine with the hub

```bash
curl -X POST http://100.73.133.3:3000/api/relay/register \
  -H "X-Api-Token: pia-local-dev-token-2024" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"MACHINE_ID\",\"name\":\"MACHINE_NAME\",\"hostname\":\"HOSTNAME\",\"project\":\"PROJECT_NAME\",\"channels\":[\"api\",\"websocket\"]}"
```

Replace MACHINE_ID, MACHINE_NAME, HOSTNAME, PROJECT_NAME with actual values.
Example: `"id":"dao-machine","name":"DAO Machine","hostname":"desktop-dao","project":"DAO"`

### 5. Make repos alive

For EACH repository the user wants to make alive, run:

```bash
cd <path-to-repo>
node <path-to-pia>/scripts/init-repo.cjs --name <repo-name> --capabilities "<comma-separated-capabilities>"
```

Examples:
```bash
# For a DAO project
node C:\path\to\pia-system\scripts\init-repo.cjs --name dao --capabilities "smart-contracts,deploy,test,governance,tokenomics"

# For any web project
node C:\path\to\pia-system\scripts\init-repo.cjs --name myapp --capabilities "build,test,deploy,code"
```

This creates a `.pia/` directory with:
- `identity.json` - Who this repo is
- `knowledge/` - Auto-generated knowledge base (README, deps, structure)
- `jobs/history.jsonl` - Job execution log
- `queue/pending.json` - Incoming task queue
- `state.json` - Current status
- `hooks/` - Task execution templates

### 6. Start the repo agent

For each alive repo:

```bash
cd <path-to-repo>
node <path-to-pia>/scripts/repo-agent.cjs
```

This will:
- Register the repo with the PIA hub
- Poll for incoming tasks every 5 seconds
- Watch the local queue for tasks
- Log all completed jobs
- Report state back to hub

### 7. (Optional) Start the interactive relay connector

For a live chat channel between machines:

```bash
npm install ws
node <path-to-pia>/scripts/remote-connect.cjs \
  --hub http://100.73.133.3:3000 \
  --name "THIS_MACHINE_NAME" \
  --project "PROJECT_NAME"
```

Type messages and they'll appear on the hub machine. Commands: `/machines`, `/status`, `/quit`

---

## Key Information

| Key | Value |
|-----|-------|
| Hub IP (Tailscale) | `100.73.133.3` |
| Hub API | `http://100.73.133.3:3000` |
| Hub WebSocket | `ws://100.73.133.3:3001` |
| API Token | `pia-local-dev-token-2024` |
| JWT Secret | `pia-jwt-secret-2024` |

## API Quick Reference

From this machine, you can call the hub API:

```bash
TOKEN="pia-local-dev-token-2024"
HUB="http://100.73.133.3:3000"

# Health check
curl -H "X-Api-Token: $TOKEN" $HUB/api/health

# List all alive repos across all machines
curl -H "X-Api-Token: $TOKEN" $HUB/api/repos

# List connected machines
curl -H "X-Api-Token: $TOKEN" $HUB/api/relay/machines

# Send a task to any repo (e.g., ask Wingspan to update a deck)
curl -X POST $HUB/api/repos/wingspan/task \
  -H "X-Api-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"update-deck","description":"Add new contract addresses","requestedBy":"dao"}'

# Check a repo's job history
curl -H "X-Api-Token: $TOKEN" $HUB/api/repos/dao/jobs

# Find repos that can deploy
curl -H "X-Api-Token: $TOKEN" $HUB/api/repos/find/deploy

# Broadcast a message to all machines
curl -X POST $HUB/api/relay/broadcast \
  -H "X-Api-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from the DAO machine!","type":"chat"}'

# Send a direct message to a specific machine
curl -X POST $HUB/api/relay/send \
  -H "X-Api-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"hub-izzit7","content":"DAO reporting in","type":"status"}'
```

## Verification Checklist

After setup, confirm everything works:

- [ ] `npm run build` succeeds
- [ ] `tailscale status` shows izzit7 online
- [ ] `curl .../api/health` returns ok
- [ ] Machine registered with hub (`curl .../api/relay/machines` shows this machine)
- [ ] At least one repo initialized (`.pia/identity.json` exists)
- [ ] Repo agent running and registered (`curl .../api/repos` shows the repo)
- [ ] Can send a test task to the hub
- [ ] Can receive tasks from the hub

## What Happens Next

Once connected, the user can:
1. Send tasks to any repo from any machine via the PIA dashboard or API
2. Every repo tracks its own job history in `.pia/jobs/history.jsonl`
3. The hub shows all repos, their status, and task flows
4. Repos can talk to each other: "DAO asks Farcake to deploy"

## User's Style

- Prefers ACTION over explanation
- Wants to SEE things working
- Values real-time collaboration
- Likes documentation/journaling
- Working directory varies - ask the user which repos to make alive

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/init-repo.cjs` | Initialize .pia/ in any repo |
| `scripts/repo-agent.cjs` | Run the alive agent in a repo |
| `scripts/remote-connect.cjs` | Interactive relay connector |
| `scripts/start-tunnel.cmd` | Start ngrok tunnel (if no Tailscale) |
| `REMOTE_SETUP.md` | Human-readable setup guide |
| `src/comms/cross-machine.ts` | Cross-machine relay (hub side) |
| `src/comms/repo-router.ts` | Repo registry and task routing |
| `src/api/routes/relay.ts` | Relay REST API |
| `src/api/routes/repos.ts` | Repos REST API |

---

*Generated by PIA Hub (izzit7) | 2026-02-12*
*Claude on the hub side built all of this. Now it's your turn to connect.*
