# Session Journal — 2026-02-23

---

## Session 1: docs.html Auth Fix + CLAUDE.md Docs Maintenance Rule

### What Happened

Fixed "Access denied by security policy" error in `public/docs.html` that prevented any file from loading. Root cause: unauthenticated fetch calls triggered `recordFailedAuth(localhost)` in `network-sentinel.ts` — after 5 failures localhost was blocked for 15 minutes.

### Fix

- Added `const API_TOKEN = 'pia-local-dev-token-2024'` + `API_HEADERS` constant to `docs.html`
- Added `{ headers: API_HEADERS }` to all 3 fetch calls (2× `files/list`, 1× `files/read`)
- Restarted PM2 to flush the in-memory sentinel IP block

### CLAUDE.md Updates

- Fixed hardcoded `SESSION_JOURNAL_2026-02-16.md` date → now says "current date's session journal"
- Added `public/docs.html` to the 4-file living documentation table
- Added "How to Update docs.html Pinned Groups" subsection with rules for when/how to add entries

### Files Changed

| File | Change |
|------|--------|
| `public/docs.html` | Added API token constant + auth headers to all 3 fetch calls |
| `CLAUDE.md` | Added docs.html to maintenance table + pinned group update rules + fixed journal date |

### Desktop App Impact

None — bug fix + documentation only.

---

## Session 2: WebMCP + Cloudflare + Community Research

### What Happened

Three parallel research agents (with honest note: this was expensive — should have been 1 combined agent). Full research on Cloudflare products, WebMCP, and developer community discussions.

### Key Findings

**WebMCP** — NOT what most people think. It's a W3C browser standard (Google + Microsoft), Chrome 146 Canary only, not production until Google I/O mid-2026. NOT Anthropic's backend MCP. Monitor, don't build yet.

**Biggest cost savings for PIA (in order):**
1. Prompt caching on soul system prompts — 70–90% cost reduction (real documented case: $720/mo → $72/mo)
2. Lazy-load MCP tools per agent role — 50–96% token reduction per session (Anthropic engineers hit 134k tokens just from tool defs)
3. Route execution agents (Farcake, Andy) to Haiku, keep Sonnet for orchestrators — 4–5× cheaper
4. Batch API for Fisher2050's scheduled crons — 50% off, zero code changes
5. Stack Batch + Prompt Cache = input cost $3/MTok → $0.15/MTok

**Cloudflare — 3 free wins under 2 hours total:**
- AI Gateway: one `.env` line, full cost dashboard, rate limits, caching, fallback providers
- Email Routing: all 12 agent @sodalabs.ai addresses → real inboxes, free forever
- Tunnel: `pia.sodalabs.ai` → localhost:3000, no port forwarding, works behind SA CGNAT

**LiteLLM preferred over Cloudflare AI Gateway for PIA** — self-hosted, semantic caching already built (Cloudflare's is "planned"), traffic stays on your network.

**Community consensus on Tunnel vs Tailscale:**
- Tailscale = internal M1↔M2↔M3 traffic (already correct in PIA)
- Cloudflare Tunnel = public-facing endpoints only

### Files Created

| File | Change |
|------|--------|
| `research/WEBMCP_CLOUDFLARE_RESEARCH.md` | **NEW** — combined research: WebMCP definition, token bloat analysis, Pipedream, AI Gateway, Tunnel, community findings, 10-item action plan |
| `research/CLOUDFLARE_KNOWLEDGE_BASE.md` | **NEW** — deep Cloudflare product breakdown: 12 products, 3 deep dives, TODAY vs LATER plan |

### Files Updated

| File | Change |
|------|--------|
| `public/docs.html` | Added both new research files to ⭐ Key Docs pinned group |
| `FILE_INDEX.md` | Added both new research files to Research table |

### Desktop App Impact

None — research only.

---

## Session 3: MCP Security Scan

### What Happened

User asked about MCP security after learning about tool poisoning attacks. Ran a full audit of all 8 configured MCP servers in Claude Desktop.

### MCP Servers Audited

| Server | Package | Risk | Finding |
|---|---|---|---|
| `browsermcp` | `@browsermcp/mcp@latest` | Medium | Sends telemetry to PostHog + Amplitude; should pin to `@0.1.3` |
| `firebase` | `firebase-tools@latest` | Low | Official Google package |
| `google-drive` | `@modelcontextprotocol/server-google-drive` | Low | Official Anthropic-affiliated package |
| `gmail` | `@modelcontextprotocol/server-gmail` | Low | Official Anthropic-affiliated package |
| `google-calendar` | `@modelcontextprotocol/server-google-calendar` | Low | Official Anthropic-affiliated package |
| `context7` | `@upstash/context7-mcp` | Low | Well-known Upstash company |
| `google-keep-local` | Local Python | Low | Placeholder creds — inactive |
| `cerebra-legal` | Local Node.js (`yoda-digital`) | Medium | **3 HIGH npm vulns** in express/qs deps; no outbound network calls in source |

### Security Fixes Required

1. **cerebra-legal** — Run `npm audit fix` in `C:\Users\mic\Downloads\mcp-cerebra-legal-server`
2. **browsermcp** — Pin version in Claude Desktop config: `"@browsermcp/mcp@0.1.3"` not `@latest`

### New CVEs from Last 2 Weeks (Feb 8–22, 2026)

| CVE | Product | Affects PIA? |
|---|---|---|
| CVE-2025-68145/43/44 | Anthropic's Git MCP server — RCE (patched) | No |
| CVE-2026-21516/23/56 | GitHub Copilot RCE via command injection | No |
| n8n: 8 high CVEs | n8n workflow automation | No |
| SmartLoader/Oura | Trojanized GitHub MCP clone, StealC infostealer (Feb 17) | No |

**Verdict: No active compromise detected. Two fixable issues. Not being stolen from.**

### mcp-scan Status

- Installed `mcp-scan 0.4.2` via pip
- Google MCP servers couldn't be scanned (need active OAuth tokens to start)
- cerebra-legal and browsermcp were reachable
- Network connectivity error prevented uploading results to invariantlabs.ai (Windows semaphore timeout — network config issue, not a security issue)

### Files Changed

None — audit and recommendations only.

### Desktop App Impact

None.

---

## Session 4: Mac Mini M4 Hardware Research

*(Commissioned — results pending)*

Research question: Would Mac Mini M4 machines make sense as dedicated PIA agent machines? How do they compare to current setup? Break down the investment case per machine/agent.

---

## Session 5: PIA Presentation Suite — Published Online + New Intelligence Deck

### What Happened

Full presentation build session. Continued from previous context (conversation was compacted). Three outputs: cross-linked the 4 existing HTML presentation files, deployed everything live to Netlify, then read today's BASA/intelligence knowledge and built a 5th deck that applies that research to the product pitch.

---

### Part A: Cross-Navigation + Netlify Deployment

**Problem from previous session:** 4 HTML presentation files existed locally with no way to navigate between them, and no live URL.

**Fixed in this session:**

1. **Created `pitch.html`** — hub/portal page at `public/pitch.html`. Four cards, one per format, each with a description of its target audience and a hover effect. Entry point for sharing the entire suite.

2. **Added cross-navigation bar** to all 4 existing files — fixed bottom bar (dark, 48px, backdrop blur) with `SodaLabs · PIA` wordmark + "View as" links to all formats. Added to:
   - `PIA_CLIENT_PITCH.html`
   - `PIA_FOR_HUMANS.html`
   - `PIA_MAGAZINE_ARTICLE.html`
   - `PIA_PRESS_RELEASE.html`

3. **Deployed to Netlify** — new site created: `sodalabs-pia.netlify.app`

   ```
   netlify deploy --create-site sodalabs-pia --dir public --prod
   ```

   110 files uploaded. All 4 presentations + hub live.

**Live URLs:**

| Page | URL |
|------|-----|
| Hub | https://sodalabs-pia.netlify.app/pitch.html |
| Investor Pitch | https://sodalabs-pia.netlify.app/PIA_CLIENT_PITCH.html |
| For Humans | https://sodalabs-pia.netlify.app/PIA_FOR_HUMANS.html |
| Magazine | https://sodalabs-pia.netlify.app/PIA_MAGAZINE_ARTICLE.html |
| Press Release | https://sodalabs-pia.netlify.app/PIA_PRESS_RELEASE.html |

---

### Part B: Intelligence Research Read + New Deck

**Trigger:** Mic asked to read all knowledge discussed today (BASA session, intelligence system) and use it to build a new, better product deck — not for BASA as a client, but for PIA as a product pitched TO clients like BASA.

**Knowledge sources consumed:**

| Source | Key Intel Extracted |
|--------|-------------------|
| `SESSION_JOURNAL_2026-02-23.md` (sessions 1–3) | Cloudflare, WebMCP, cost savings, MCP security audit |
| `SESSION_JOURNAL_2026-02-22.md` (sessions 1–N) | Autonomous Business Swarms thesis, v1.0 completion, bug fixes, integration loop |
| `farcake-clients/intelligence/KB_BASA_BETHMEETING_230226.md` | Beth x Mic meeting notes, "narrow window" framing, Beth's communication style, action items |
| `farcake-clients/intelligence/BASA_STRATEGIC_ASSESSMENT.md` | R5M–15M 3-year BASA opportunity, Beth's personal success criteria, the Zanele archetype |
| `farcake-clients/intelligence/JOURNAL.md` | Full day session recap: verified job displacement data, Africa-specific stats, Ramp $0.03, Klarna, Jobtech Alliance |
| `research/SODALABS-CREATIVE-DECK.md` | Existing pitch deck content, agent descriptions, pricing tiers, soul system slides |
| `research/AGENT_PRODUCT_SHEETS.md` | Full agent product sheets — all 12 agents, soul layers, triggers, success criteria |
| `research/AGENCY-AGENTS-SALES-COPY.md` | Sales copy for management agents, objection handling, pricing model |

**Key intelligence that changed how the deck was framed:**

1. **Africa-specific data is now available and verified** — previous decks used generic global stats. New deck uses: Jobtech Alliance -21% African freelancers on Upwork, -28% writers, -33% graphic artists (2025 measured data), R161B SA creative economy.

2. **The "narrow window" framing** — Beth's exact phrase from this morning's meeting ("narrow window to mobilise finance and technology for exponential sector growth") is the most resonant urgency frame. Used as central thesis.

3. **The Zanele archetype** — BASA's marketing manager (creatively brilliant, operationally bottlenecked) is a universal client story. Every institutional client has a Zanele. Used as the human story section.

4. **Verified economic data** — Ramp 2025 transaction data ($0.03 per $1 human labor), Klarna 40% reduction, Ben Horowitz "66% fewer jobs," Goldman 300M exposed. All verified, all citable.

5. **The audience shift** — existing decks speak to founders/investors or individual business owners. The new deck speaks to institutional leaders (like Beth): cultural organisations, professional services, creative sector bodies. Policy-brief aesthetic, not tech deck.

**New file created:** `public/PIA_NARROW_WINDOW.html`

**Design:** Dark gold/amber premium intelligence brief aesthetic. Playfair Display headlines + Inter body. Gold (#f2c440) accent. Not a tech deck, not a warm business story — a serious policy document that happens to be beautiful.

**Sections built:**
1. Masthead — "For Organisation Leaders. February 2026. Confidential."
2. Cover — "The Narrow Window" headline
3. The Numbers — 6-cell data wall (verified sources, all cited)
4. Closer to Home — Africa-specific 4-stat box (Jobtech Alliance, creative sector)
5. The Human Reality — "Every team has a Zanele" with before/after time split
6. The AI Workforce — 3 management agents + 6 specialist workers (all 9 cards)
7. The Economics — South African comparison table: R116,000/month human vs R36/month AI
8. The Compound Advantage — Intelligence loop diagram (5 steps)
9. The Differentiators — 6 items, numbered list
10. The Urgency — "Narrow window" pull quote + deployment timeline
11. CTA — 4 spots, mic@sodalabs.ai

**Hub updated:** `pitch.html` — added "Narrow Window" card spanning full width at top, tagged "New · 23 Feb 2026."

**Second Netlify deploy:** 3 changed files uploaded. All live.

---

### Files Changed

| File | Change |
|------|--------|
| `public/pitch.html` | **NEW** — hub page linking all presentations |
| `public/PIA_CLIENT_PITCH.html` | Added cross-navigation bar |
| `public/PIA_FOR_HUMANS.html` | Added cross-navigation bar |
| `public/PIA_MAGAZINE_ARTICLE.html` | Added cross-navigation bar |
| `public/PIA_PRESS_RELEASE.html` | Added cross-navigation bar |
| `public/PIA_NARROW_WINDOW.html` | **NEW** — intelligence brief deck (Africa data, urgency frame) |

### Netlify Site

**Site name:** `sodalabs-pia`
**URL:** `https://sodalabs-pia.netlify.app`
**Team:** mic-udst51o's team
**Deployment:** `netlify deploy --dir public --prod` (linked after first deploy)

### Desktop App Impact

None — presentation/marketing files only. No server code changed.

---

## Session 6: V1 Completion, Model Default Fix, M1→M2 Ecosystem Investigation

### What Happened

Long multi-part session covering V1 finalization, critical cost bug investigation, and the first attempt to build the M1→M2 remote agent control ecosystem for the Mama Jazz project.

### Part A: V1 Status Sweep (from previous conversation)

Confirmed all 17 V1 items. Items 1–13 and 16 are complete. Items 14 (email outbound) and 15 (email inbound) need only external config (SendGrid key + Cloudflare routing). Item 17 (soak test) waiting on time. Zero remaining code work.

- **Item 16 completed**: Added inbox size limit (200 msgs/agent) to `fisher-service.ts` TTL cleanup
- **EMAIL_SETUP.md created**: Step-by-step activation guide for items 14 & 15

### Part B: Model Default — The Opus Cost Bug

**Critical finding:** Three places in `src/db/database.ts` had `model TEXT DEFAULT 'claude-opus-4-6'` as the DB column default. **Fixed** — all three now say `claude-sonnet-4-6`.

Lines fixed: 382 (migration 020), 627 (migration 030), 656 (migration 031)

The **runtime code** in `agent-session.ts` already defaulted to sonnet (lines 227, 264, 429, 492) — fixed in a previous session. But the DB schema default was never updated.

**Deeper model issue discovered:** The Claude Code CLI (v2.1.50) **ignores the `--model` flag** when spawned via the Agent SDK. Even when PIA passes `model: 'claude-sonnet-4-6'` or `'claude-haiku-4-5-20251001'` → the SDK correctly passes `--model` to the CLI subprocess → but the CLI always uses the user's subscription default (`claude-opus-4-6`).

Confirmed via standalone test: requested haiku, got opus. NOT a PIA bug — CLI behavior.

**Impact:** Every SDK-mode agent session uses Opus regardless of what PIA configures. For cost-sensitive tasks, use API mode (`autonomous-worker.ts`) which calls the Anthropic API directly and respects model choice.

### Part C: Agent Spawn Exit Code 1

All 15+ agent sessions in DB (Feb 21) show `status=error`, `error_message="Claude Code process exited with code 1"`.

**Root cause:** CLI's nested session detection (`CLAUDECODE` env var). Fix in `agent-session.ts` line 412 (`delete cleanEnv.CLAUDECODE`) is correct — but only works when PIA server wasn't started from within a Claude Code session. If PM2 inherits `CLAUDECODE` from parent shell, all spawns fail.

**Resolution:** Clean PM2 restart (not from within Claude Code) fixes it. Confirmed via standalone test.

### Part D: Mama Jazz — Readiness Assessment

Already done in sodaworld repo: real event calendar, artist bios, Firebase seeded. PIA agents ready: Fisher2050, Farcake, Bird Fountain, Tim Buc, Ziggi. Gap: image generation API not wired.

### Part E: M1→M2 Remote Control — In Progress

- M2 PIA reachable at `100.127.165.12:3000` via Tailscale
- `/api/exec` endpoint works (PowerShell commands)
- M2 registered in hub as `CPRCCmmvcH6PHSTyURmSK` (online)
- Remote agent spawn via hub API reported successful
- **Blocker:** SSH from M1→M2 blocked by Windows Firewall (needs admin elevation on M2)
- **Blocker:** No tmux/WSL on M2 for persistent terminal sessions

### Files Changed

| File | Change |
|------|--------|
| `src/db/database.ts` | **FIX** — changed 3× `model TEXT DEFAULT 'claude-opus-4-6'` → `'claude-sonnet-4-6'` |
| `src/services/fisher-service.ts` | Added inbox size limit (200 msgs/agent) to weekly TTL cleanup |
| `EMAIL_SETUP.md` | **NEW** — email activation guide |
| `FILE_INDEX.md` | Added EMAIL_SETUP.md |

### Desktop App Impact

DB schema default fix may affect new installs. No functional change for existing data.

---

## Session 7: M2 Agent Spawn — Fixed and Working

### What Happened

Continued from Session 6. Resolved the remaining blockers to get SDK agent spawning working on M2 (soda-monster-hunter). The agent ecosystem is now operational across M1→M2.

### Part A: PM2 on M2 — Windows NVM Compatibility

PM2 could not start PIA on M2 via any method:
- `pm2 start npm` → npm.cmd is a batch file, not a Node script
- `pm2 start node_modules/.bin/tsx` → Unix shell script, not parseable by Node
- `pm2 start node_modules/tsx/dist/cli.mjs` → Process shows "online" but zero output, port 3000 never listens
- `Start-Process` from SSH → silently fails (environment issue)
- `start /b` from SSH → same

**Working solution:** Run via SSH background process:
```bash
ssh User@100.127.165.12 "cd C:/Users/User/Documents/GitHub/pia-system && C:\nvm4w\nodejs\node.exe node_modules/tsx/dist/cli.mjs watch src/index.ts" > /tmp/m2-pia.log 2>&1 &
```
The SSH session stays open in the background and keeps the process alive. Not ideal for production but works for development.

**PM2 ecosystem file created** at `ecosystem.config.cjs` for future use (PM2 launches but doesn't capture output on Windows/NVM).

### Part B: ANTHROPIC_API_KEY Fix — The Real Blocker

**Root cause confirmed:** When the SDK spawns a Claude CLI subprocess, it inherits the parent's `ANTHROPIC_API_KEY` env var. If that key has no credits (ours doesn't — we use OAuth/subscription), the CLI prefers the API key over OAuth and fails with "Credit balance is too low".

**Fix (both machines):** Delete `ANTHROPIC_API_KEY` from the spawn environment so the CLI falls back to OAuth tokens in `~/.claude.json`.

Two places in `agent-session.ts`:
1. **Line ~414 (cleanEnv):** `delete cleanEnv.ANTHROPIC_API_KEY;` — already fixed in Session 6
2. **Line ~439 (spawnEnv):** `delete spawnEnv.ANTHROPIC_API_KEY;` — was still commented out on M2, **fixed this session**

M1 had both fixes from Session 6. M2 only had the cleanEnv fix — the spawnEnv path (used by `spawnClaudeCodeProcess` callback in newer SDK versions) was still passing the API key through.

### Part C: Successful Agent Spawn on M2

Test spawn confirmed working:
```
POST http://100.127.165.12:3000/api/mc/agents
{ "task": "Say hello and confirm you are running. Report your hostname.",
  "mode": "sdk", "model": "claude-sonnet-4-6",
  "cwd": "C:/Users/User/Documents/GitHub/pia-system" }
```

**Result:** Status `idle` (completed), cost $0.13, 62K tokens in, 126 out, 1 tool call.
Response: "Hello. I am running. **Hostname:** `SODA-MONSTER-HUNTER` **Role:** WORKER (M2)"

### Key Learnings

1. **API field name:** The spawn endpoint uses `task` not `prompt` — sending `prompt` silently creates an agent with empty task
2. **PM2 + NVM on Windows:** PM2 cannot reliably manage tsx processes on Windows with NVM4W — use direct node execution
3. **OAuth vs API key precedence:** Claude CLI checks env var `ANTHROPIC_API_KEY` first. If set, it ignores OAuth. Remove from env to use OAuth.
4. **M2 machine ID changed:** Was `CPRCCmmvcH6PHSTyURmSK`, now `JwXrmNoXTk8VOMs02PUMm` after restart (ID regenerated on each hub connection)

### Cleanup

Removed temp files from M2: `patch-auth.cjs`, `patch-auth2.cjs`, `patch-auth3.cjs`, `patch4.cjs`, `read-lines.cjs`, `test-sdk.mjs`, `test-sdk2.mjs`, `test-sdk-out.txt`, `test-sdk-out2.txt`, `pia-start.log`, `pia-stdout.log`, `pia-stderr.log`, `start-pia.cmd`, `ecosystem.config.cjs`

### Files Changed

| File | Change |
|------|--------|
| `src/mission-control/agent-session.ts` (M2 only) | **FIX** — uncommented `delete spawnEnv.ANTHROPIC_API_KEY` in spawnClaudeCodeProcess callback |

### Desktop App Impact

None — fix is runtime environment handling only.

---
