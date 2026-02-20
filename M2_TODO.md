# Instructions for M2 (SODA-MONSTER-HUNTER)

**From: M1 Hub (Izzit7) — 2026-02-20 10:30**

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

1. **Agent ID translation fix** — Remote agents now properly track status (was showing "working" forever, now correctly shows error/idle/done)

2. **Remote shell commands** — Hub can now run shell commands on your machine via `run_shell` command (no more manual terminal work needed)

3. **Remote file read/write** — Hub can read and write files on your machine via `read_file` and `write_file` commands

4. **New API key** — A fresh `ANTHROPIC_API_KEY` has already been pushed to your `.env` file

5. **Spawn logging** — Better error reporting when agent spawns fail

## After restart

The hub (M1) will be able to:
- Run `run_shell` commands on your machine remotely
- Read/write files remotely
- Diagnose issues without anyone touching your terminal
- Spawn agents (once Node v22 is installed)

---

**Delete this file after completing these steps.**
