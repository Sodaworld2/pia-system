# M2 Activation Guide — soda-monster-hunter

> Written: 2026-02-21. This is the single source of truth for getting M2 running as a worker in the PIA fleet.

---

## Who Is M2?

| | M1 (Hub) | M2 (Worker) |
|---|---|---|
| **Machine** | Izzit7 | soda-monster-hunter |
| **Role** | Hub — controller, scheduler, brain | Worker — pure execution node |
| **IP** | 100.73.133.3 | 100.127.165.12 (Tailscale) |
| **Repo path** | `C:\Users\mic\Downloads\pia-system` | `C:\Users\User\Documents\GitHub\pia-system` |
| **Port** | 3000 (API) + 3001 (WebSocket) | 3000 (local API only) |
| **Services** | 13 — Fisher2050, Tim Buc, Cortex, Eliyahu, etc. | 4 — API, WebSocket, HubClient, DB |
| **Scheduled jobs** | Yes (Fisher2050 crons) | No — M1 decides scheduling |
| **Dashboard** | Full fleet view | Local view only |

**M2 is a pure execution node.** It runs agents when M1 asks it to, reports back, and stays quiet otherwise.

---

## How M2 Knows It's M2

Fleet auto-detection is hostname-based. In `src/config.ts`:

```typescript
const FLEET = {
  'IZZIT7':              { mode: 'hub',   hubUrl: 'http://localhost:3000' },
  'SODA-MONSTER-HUNTER': { mode: 'local', hubUrl: 'http://100.73.133.3:3000' },
  'SODA-YETI':           { mode: 'local', hubUrl: 'http://100.73.133.3:3000' },
};
```

On boot, PIA reads `hostname()` → matches `SODA-MONSTER-HUNTER` → sets `mode='local'`. No manual config needed. This was fixed in commit `dd07ba9` (Feb 20) — the hostname table is now the **only source of truth**. No PIA_MODE env var needed.

---

## What M2 Runs vs What It Doesn't

### M2 RUNS (startLocal):
- Express API on port 3000 (local dashboard)
- WebSocket server on port 3001
- SQLite DB (isolated copy at `./data/pia.db`)
- **HubClient** — connects to M1 at `ws://100.73.133.3:3001` every 30s heartbeat
- AgentSessionManager — spawns Claude agents locally when M1 commands

### M2 DOES NOT RUN:
- Fisher2050 (M1 only)
- Tim Buc (M1 only)
- Eliyahu (M1 only)
- Ziggi (M1 only)
- Cortex (M1 only)
- CalendarSpawnService (M1 only)
- Hub Aggregator (M1 only)

---

## M2 Activation Steps

### Step 1 — Pull latest code

SSH or physically on M2:
```bash
cd C:\Users\User\Documents\GitHub\pia-system
git pull origin master
npm install
```

**Minimum required commits** (must be present after pull):
| Commit | What it does |
|---|---|
| `dd07ba9` | Fleet auto-detection by hostname — M2 SELF-IDENTIFIES correctly |
| `4aada49` | Removes PIA_MODE from PM2 env — fleet table is authoritative |
| `c89003d` | Tim Buc service (runs on M1, but code must be on M2 too) |
| `9a526ca` | Email service (runs on M1 only) |
| `597ccae` | agent_messages TTL cleanup |

Verify: `git log --oneline -6`

### Step 2 — Create/update .env on M2

Create `.env` in the repo root. **Tokens MUST match M1 exactly:**

```env
# M2 Identity (fleet table overrides mode, but keep for reference)
PIA_MODE=local
PIA_PORT=3000
PIA_HOST=0.0.0.0
PIA_WS_PORT=3001

# Must match M1 exactly
PIA_SECRET_TOKEN=pia-local-dev-token-2024
PIA_JWT_SECRET=pia-jwt-secret-2024

# M1's hub address (via Tailscale)
PIA_HUB_URL=http://100.73.133.3:3000

# Machine name (fleet table also sets this, but explicit is fine)
PIA_MACHINE_NAME=soda-monster-hunter

# AI — M2 can use Claude SDK same as M1
ANTHROPIC_API_KEY=sk-ant-... (same key as M1 if you want Claude agents on M2)

# Logging
PIA_LOG_LEVEL=info
PIA_DB_PATH=./data/pia.db
```

### Step 3 — Create MACHINE_IDENTITY.local.md on M2

This file is `.gitignore`'d. Create it manually on M2:

```markdown
# Machine Identity — DO NOT COMMIT

## Who Am I
- **Machine:** M2 — soda-monster-hunter
- **Role:** Worker (local spoke node)
- **Tailscale IP:** 100.127.165.12

## My Rules
- I receive commands from M1 (100.73.133.3)
- I run agents locally
- I report back via WebSocket heartbeat every 30s
- I do NOT run Fisher2050, Tim Buc, Eliyahu, Ziggi — those are M1 only
- I do NOT push to GitHub (M1 is the writer)
- If M1 is offline, I go idle

## The Fleet
| Machine | Role | IP |
|---|---|---|
| M1 Izzit7 (hub) | Controller | 100.73.133.3 |
| M2 soda-monster-hunter (THIS) | Worker | 100.127.165.12 |
| M3 soda-yeti | Worker | 100.102.217.69 |
```

### Step 4 — Start PIA on M2

**For testing (watch mode):**
```bash
npm run dev
```

**For production (PM2):**
```bash
npx pm2 start ecosystem.config.cjs
npx pm2 save
```

**For auto-start on Windows boot (one-time setup):**
```bash
npx pm2 startup
npx pm2 save
```

### Step 5 — Verify M2 is alive

**On M2 terminal, you should see:**
```
[Main] Mode: LOCAL
[LocalService] Connecting to Hub...
[HubClient] Connecting to Hub: ws://100.73.133.3:3001
[HubClient] Connected to Hub
[HubClient] Authenticated with Hub
[HubClient] Registered as: soda-monster-hunter
[HubClient] Heartbeat sent
```

**On M1 dashboard (http://localhost:3000/mission-control.html):**
- SODA-MONSTER-HUNTER shows as **Online** (green dot)
- Heartbeat timestamp updates every 30s

**Test spawn from M1:**
1. M1 dashboard → "+ Spawn Agent"
2. Machine dropdown → select "SODA-MONSTER-HUNTER"
3. Task: "What is your hostname? One sentence."
4. Spawn → should see agent appear, output streams back to M1 dashboard

---

## How M1 → M2 Spawn Works

```
M1 dashboard POST /api/mc/agents { machineId: 'M2_DB_ID', task: '...' }
  → mission-control.ts: machineId != local → WebSocket to M2
  → M2 hubClient receives 'spawn_agent' command
  → M2 AgentSessionManager.spawn() runs Claude locally
  → M2 streams 'agent:output' back via WebSocket
  → M1 aggregator stores agent record (machine_id = M2's DB ID)
  → M1 dashboard shows M2 agent output in real-time
```

---

## Bugs Fixed on M1 That M2 Also Gets (Feb 21)

After `git pull`, M2 gets these automatically:

| Fix | File | Effect on M2 |
|---|---|---|
| `kill()` now deletes from sessions map | `agent-session.ts` | Kill buttons remove agents from M2's list |
| DELETE falls back to DB purge | `mission-control.ts` | Stale agents removable from M2 |
| Spawn with DB machine ID works | `mission-control.ts` | `localMachineId()` uses real ESM imports |
| Per-agent `✕` kill buttons | `mission-control.html` | M2's local dashboard also has kill buttons |
| Grid view kill button | `mission-control.html` | Grid mode kill works on M2 |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| M2 shows as "hub" mode | Old code, hostname not in FLEET table | `git pull`, verify hostname is `SODA-MONSTER-HUNTER` |
| M2 not appearing in M1 dashboard | HubClient not connecting | Check Tailscale (ping 100.73.133.3), check M1's WS port 3001 is open |
| Spawn on M2 fails: "not connected" | M2's WebSocket not connected to M1 | Check M2 logs for HubClient errors |
| Agents run but output doesn't stream | Token mismatch between M1 and M2 | Ensure `PIA_SECRET_TOKEN` matches exactly |
| M2 runs Fisher2050/crons | Old code (bug) | `git pull` — startLocal() doesn't start those services |

---

## What's NOT Done Yet (V1 Backlog for M2)

- [ ] M2 auto-start via PM2 on Windows boot (needs `pm2 startup` run once on M2)
- [ ] M2 appears offline in M1 dashboard — needs git pull + restart
- [ ] M2 ANTHROPIC_API_KEY in .env (required for Claude agents to think)
- [ ] Test end-to-end: M1 spawns agent on M2, output streams, agent completes, Tim Buc archives

---

*Last updated: 2026-02-21 by repair session agent.*
