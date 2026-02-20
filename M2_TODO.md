# Instructions for M2 (SODA-MONSTER-HUNTER)

**From: M1 Hub (Izzit7) — 2026-02-20 11:15**

## URGENT UPDATE: You now get your own dashboard!

## What you need to do

Run these commands in order:

```powershell
cd C:\Users\User\Documents\GitHub\pia-system
git pull
npm run dev
```

## IMPORTANT: Node version issue

M2 currently runs **Node v24.11.1** which causes Claude Code agents to crash.
M1 runs **Node v22.15.1 (LTS)** which works perfectly.

**After git pull, also run:**

```powershell
# Check if nvm is installed
nvm list

# If nvm is available:
nvm install 22
nvm use 22
node --version   # Should show v22.x.x

# Then restart PIA:
npm run dev
```

If nvm is not installed, download Node v22 LTS from https://nodejs.org and install it.

## What changed in this update

1. **YOUR OWN DASHBOARD** — After `npm run dev`, open http://localhost:3000 in your browser. You now have the full Mission Control dashboard, same as M1. Spawn agents, see their output, chat with them.

2. **Hub connection preserved** — You still connect to M1's hub for fleet visibility. M1 can still see your machine and agents.

3. **Agent ID translation fix** — Remote agents now properly track status

4. **Remote shell/file commands** — Hub can run commands on your machine via `run_shell`

5. **New API key** — Already pushed to your `.env` file

## After restart

- Open **http://localhost:3000** in your browser — that's YOUR dashboard
- Spawn agents on your own projects (Birdfountain, InvestorDome, etc.)
- See live terminal output just like M1
- M1 can also still control your machine remotely

## Verify it's working — paste this into Claude Code after restart

Once PIA is running, paste this prompt into Claude Code on this machine to confirm everything is healthy:

```
You are running on M2 (SODA-MONSTER-HUNTER). PIA was just updated — you now have your own full dashboard. Please verify the following:

1. Run `hostname` — confirm this is SODA-MONSTER-HUNTER
2. Run `node --version` — confirm it's v22.x.x (not v24)
3. Check `curl -s http://localhost:3000/api/mc/machines` — confirm the server is running and this machine shows as online
4. Check `curl -s http://localhost:3000/api/mc/agents` — list any local agents
5. Open http://localhost:3000 in a browser and confirm the Mission Control dashboard loads
6. Spawn a test agent: go to the dashboard, click "+ Spawn", pick any project, and give it the task: "Run hostname and node --version and report back."
7. Confirm you can see the agent's terminal output live in the dashboard

Report what you find for each step. If anything fails, read the PIA server log output (npm run dev terminal) and share any error messages.
```

---

**Delete this file after completing these steps.**
