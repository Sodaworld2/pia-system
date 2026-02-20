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

---

**Delete this file after completing these steps.**
