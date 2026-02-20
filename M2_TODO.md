# Instructions for M2 (SODA-MONSTER-HUNTER)

**From: M1 Hub (Izzit7) — 2026-02-20 08:20**

## What happened

M1 pushed code fixes for remote agent spawning. M2 needs to pull and restart PIA.

## What you need to do

Run these commands in order:

```powershell
cd C:\Users\User\Documents\GitHub\pia-system
git pull
npm run dev
```

## What changed

1. **`src/local/hub-client.ts`** — `set_env` command now injects vars into `process.env` immediately (not just the .env file). This means the hub can send you an API key and you'll use it right away without restarting.

2. **`src/local/hub-client.ts`** — New `diagnose` command. The hub can ask you to report your env status (API key present, SDK available, database OK, etc.) for troubleshooting.

3. **`src/api/routes/mission-control.ts`** — Command endpoint supports `?wait=true` query param so the hub can send a command and wait for your response synchronously.

4. **Your `.env` file** — M1 already sent `ANTHROPIC_API_KEY` to your .env via the `set_env` WebSocket command. After you restart PIA (with `npm run dev`), the key will be loaded via dotenv.

## After restart

Once PIA restarts, the hub (M1) should be able to:
- Run `diagnose` to check your status
- Spawn remote agents on your machine via `POST /api/mc/agents`
- Send env vars that take effect immediately

## Verification

After `npm run dev` starts, confirm:
- PIA starts in LOCAL mode
- It connects to the hub (you should see "Connected to hub" in the logs)
- Run: `curl http://localhost:3000/api/mc/machines` from M1 to verify you show as online

---

**Delete this file after completing these steps.**
