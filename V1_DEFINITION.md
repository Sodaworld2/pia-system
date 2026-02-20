# PIA v1.0 — Definition of Done

> Written 2026-02-20. This file defines the finish line for v1.0. When all items below are true, PIA v1.0 is done. Nothing else needs to be built for v1.0.

---

## The One-Sentence Version

PIA v1.0 is a 4-agent system running on M1 that wakes each morning with a briefing, accepts goals by email or dashboard, executes research tasks automatically, archives every session, and reports back — without Mic touching a keyboard.

---

## v1.0 Is Done When...

Each of the following must be true independently, verified by observation over 5 consecutive business days:

1. **Fisher2050 is inside the main PIA process.** He reads from and writes to the same SQLite database as everything else. Port 3002 is gone. There is one process, one database, one port 3000.

2. **Owl persists the task list across restarts.** Stopping and restarting PIA does not lose the task queue. After restart, Fisher2050 picks up exactly where he left off with no manual intervention.

3. **Fisher2050 creates a Farcake task from a plain-English goal.** You email fisher2050@sodalabs.ai with a research goal. Within 5 minutes, a scheduled Farcake task exists in the Owl with a time slot, input context, and machine assignment. No dashboard required.

4. **Farcake runs automatically without manual spawning.** At the scheduled time (written by Fisher2050), PIA spawns Farcake on M1 without any human action. The spawn uses Farcake's soul file, the task context from Owl, and terminates cleanly when the research is complete.

5. **Tim Buc fires on every session end.** Within 5 minutes of any agent session completing, Tim Buc wakes, reads the raw SDK log, files a structured record to the Records DB (project, agent, date, cost, produced files, consumed files), and terminates. Zero sessions go unfiled.

6. **Eliyahu sends a morning briefing by 6:15am every day.** The email arrives at Mic's inbox. It contains exactly 3 items that matter today. It reads the Tim Buc records from the last 24 hours. It is under 2 minutes to read. It does not require Mic to log into any dashboard to understand.

7. **Fisher2050 sends a 9am standup and a 6pm summary every day.** The standup email lists what is running today, what is queued, and any blockers. The summary reports what completed, what Tim Buc filed, and the API cost for the day. Both arrive automatically from fisher2050@sodalabs.ai.

8. **Ziggi reviews every Farcake output and scores it 1–10.** Within 30 minutes of a Farcake session ending and Tim Buc filing, Ziggi spawns, reviews the research output, produces a quality verdict (score + specific issue if any + recommended fix), files the report via Tim Buc, and terminates. Fisher2050 automatically creates a re-do task if the score is below 7.

9. **The core loop runs 5 days in a row without manual intervention.** Goal received → Fisher2050 schedules → Farcake executes → Tim Buc archives → Ziggi reviews → Eliyahu reports. Five consecutive days. No Mic touching the dashboard to restart anything, fix a crash, or re-spawn a stalled agent.

10. **PM2 keeps everything alive across restarts.** When M1 reboots, PIA restarts automatically. When the PIA process crashes, PM2 restarts it within 30 seconds. Mic does not need to SSH in to bring the system back up.

11. **The Records DB has at least 10 filed sessions.** Tim Buc has successfully processed at least 10 real agent sessions. Eliyahu has access to at least 10 records. The intelligence pipeline is proven at small scale before v1.0 is declared done.

12. **Inbound email routing to Fisher2050 works.** An email sent to fisher2050@sodalabs.ai from any email client creates a task in the Owl. This is the test that the system accepts goals from the outside world without requiring the Mission Control dashboard.

---

## What v1.0 Does NOT Include

These are explicitly deferred to v2.0. Do not build them for v1.0.

- **Electron desktop app** — the Express server + browser dashboard is sufficient
- **React UI** — mission-control.html is the UI for v1.0, no migration needed
- **Google Calendar integration** — v1.0 uses a local `calendar_events` SQLite table, not Google OAuth
- **WhatsApp bridge** — email is the inbound channel for v1.0; WhatsApp waits for v2.0
- **M2 and M3 agents** — v1.0 runs entirely on M1; the multi-machine architecture is not required
- **Andy (editorial agent)** — Andy depends on GumballCMS delivery; that is a v2.0 pipeline
- **GumballCMS integration** — no external delivery target for v1.0; output lives in the Records DB
- **Videohoho Phase 2** — not in scope until the core agent loop is proven
- **MQTT broker** — REST + WebSocket is sufficient for v1.0; MQTT is an optimisation
- **Hub failover** — v1.0 is single-machine; failover is a multi-machine concern
- **Mobile-optimised dashboard** — the desktop browser dashboard is sufficient for v1.0
- **Coder Machine** — dedicated build agent is post-v1.0
- **Controller agent** — direct Fisher2050 access via email and dashboard is sufficient for v1.0; Controller routing is v2.0
- **Monitor Agent** — PM2 handles the critical uptime concern; a full monitor agent is v2.0
- **Activity Feed / briefing screen** — Eliyahu's emails are the briefing surface for v1.0
- **Weekly performance report** — Eliyahu's daily briefing is the intelligence layer for v1.0
- **Git worktree support** — single-agent-per-session for v1.0; no worktree conflicts
- **Fleet self-update command** — single machine, manual git pull for v1.0
- **RAG / vector store** — context window is sufficient for v1.0's session volume
- **Methodology framework injection** — soul system with current personality layers is sufficient for v1.0

---

## The Minimal Machine Setup

**Hardware:** M1 (Izzit7) only. M2 and M3 stay offline for v1.0.

**What runs on M1:**
- PIA Express server (port 3000, managed by PM2)
- SQLite database (Tasks/Owl, Records DB, agent_messages, calendar_events)
- Fisher2050 agent (integrated into main process, spawned by PIA)
- Farcake agent (spawned by Fisher2050 via local calendar trigger)
- Tim Buc agent (spawned by PIA hub on every session end)
- Ziggi agent (spawned by cron at 2am + event-triggered after Farcake completion)
- Eliyahu agent (spawned by cron at 6am)
- Mission Control dashboard (public/mission-control.html)

**What is not running on M1 for v1.0:**
- No hub WebSocket aggregator for remote machines (single-machine mode)
- No Tailscale cross-machine routing
- No MQTT broker

**Email infrastructure (minimal):**
- Outbound: SendGrid or Mailgun, configured for fisher2050@sodalabs.ai and eliyahu@sodalabs.ai
- Inbound: Mailgun inbound routing or Cloudflare Email Worker → webhook → /api/webhooks/email → Fisher2050

**Scheduling (no Google OAuth):**
- `calendar_events` SQLite table (id, agent, task, scheduled_at, context_json, status)
- PIA cron checks this table every minute
- Fisher2050 writes to this table; PIA hub reads from it and spawns agents

---

## The Daily Experience (What Mic Actually Feels)

Mic wakes up at 6am. Before he opens his laptop, there is an email in his inbox from eliyahu@sodalabs.ai. The subject line is "Morning Briefing — 20 Feb 2026." He reads it in under two minutes while making coffee. It tells him three things: the Afrotech research Farcake ran last night scored 8/10 from Ziggi and is ready for Andy to write from. One task is blocked because the brief was missing a key angle — Fisher2050 already rescheduled it for tomorrow. The API cost yesterday was $1.20. He does not log into anything. He knows what the system did.

At 9am, another email arrives from fisher2050@sodalabs.ai: the standup. Today's schedule: Farcake is booked at 2pm for a competitor analysis. Ziggi runs at 2am tonight. One task is queued for tomorrow pending Mic's approval of the research brief. Fisher2050 is asking for a decision on the brief — reply "approved" to unblock. Mic replies. That is the total interaction required for the day.

At 2pm, Farcake spawns automatically. No dashboard visit, no button click. Mic can see it in the Mission Control dashboard if he wants, but he does not have to. Farcake runs for 40 minutes, produces a structured research report, terminates. Within 5 minutes, Tim Buc wakes, files the session to the Records DB, terminates. Another 30 minutes later, Ziggi spawns, reviews the report, files a verdict: "8/10 — solid sources, one claim needs a stronger citation, recommend addressing before Andy writes from it." Fisher2050 creates a follow-up note in the task queue. All of this happens without Mic watching.

At 6pm, the summary email arrives. Today: one research session completed, cost $0.85, Ziggi verdict 8/10, records filed. Tomorrow: competitor analysis round 2 queued for 10am. Fisher2050 estimates the full brief will be complete by end of week. Mic reads this in 90 seconds and closes his laptop. The operation ran itself.

---

## Build Sequence to v1.0

These are the ONLY items to build for v1.0. Everything else is v2.0 or later.

| # | Item | Source | Estimated Effort |
|---|---|---|---|
| 1 | **Anthropic API key rotation** | BUILD_LIST 1.7 | 10 min |
| 2 | **File API authentication** | BUILD_LIST 1.8 | 30 min |
| 3 | **PM2 on M1** | BUILD_LIST 1.6 | 15 min |
| 4 | **Merge Fisher2050 into main PIA process** (eliminate port 3002 sidecar) | DEVILS_ADVOCATE fix 5 | 1 day |
| 5 | **Agent Records DB** (SDK log capture — migration 043+) | BUILD_LIST 1.2 | 1-2 days |
| 6 | **Owl persistence layer** (tasks table + session start/end R/W) | BUILD_LIST 1.4 | 1 day |
| 7 | **Fisher2050 full soul + automation profile** | BUILD_LIST 1.1 | 1 day |
| 8 | **Local calendar_events table** (replaces Google Calendar for v1.0) | DEVILS_ADVOCATE fix 2 | 1 day |
| 9 | **Calendar-triggered spawn** (PIA cron watches calendar_events table) | BUILD_LIST 2.1 (local only) | 1-2 days |
| 10 | **Tim Buc agent** (event-triggered on session end, files to Records DB) | BUILD_LIST 1.5 | 1 day |
| 11 | **Eliyahu agent** (6am cron, reads Tim Buc records, sends email briefing) | BUILD_LIST 2.3 | 1-2 days |
| 12 | **Ziggi agent** (2am cron + post-Farcake event trigger, quality verdict) | BUILD_LIST 2.5 | 1 day |
| 13 | **Farcake soul + automation profile** | BUILD_LIST 2.7 | 1 day |
| 14 | **Agent email outbound** (fisher2050@ and eliyahu@ via SendGrid/Mailgun) | BUILD_LIST 3.1 (partial) | 1 day |
| 15 | **Agent email inbound** (fisher2050@ receives goals via webhook) | BUILD_LIST 3.2 (partial) | 1 day |
| 16 | **Add TTL + inbox size limit to agent_messages** | DEVILS_ADVOCATE fix 3 | 1 hour |
| 17 | **5-day soak test** — run the core loop unattended, fix what breaks | — | 1 week |

**Total estimated build time: 3-4 weeks for a 1-person team.**
**Total estimated soak/validation: 1 additional week.**
**v1.0 target: 5 weeks from today.**

---

## Success Metrics

How Mic will know v1.0 is working and saving him time:

1. **Zero missed briefings in 30 days.** Eliyahu's 6am email arrives every weekday without exception. If it misses a day, v1.0 is not done.

2. **At least 3 research tasks completed per week without manual spawning.** Fisher2050 schedules, Farcake executes, Tim Buc files — all autonomously. Manual spawns from the dashboard do not count toward this metric.

3. **API cost stays under $5/day.** The ephemeral compute model should mean Mic pays for work done, not idle time. If costs exceed $5/day on a normal week, something is running when it should not be.

4. **Ziggi average quality score of 7.5/10 or above across 20+ reviews.** The quality gate is working if Ziggi's verdicts are meaningful and Fisher2050 is creating re-do tasks for scores below 7.

5. **"Where are we?" answered in under 10 seconds.** At any point, Mic can ask Fisher2050 (via dashboard or email) for the current task state, and receive a complete, accurate answer from the Owl within 10 seconds. If this requires Mic to reconstruct context manually, v1.0 is not done.

---

*This file was written 2026-02-20. It is the definitive scope boundary for v1.0.*
*Do not add items to the v1.0 build sequence without first removing something else or upgrading the target date.*
*Every build decision for the next 5 weeks should be evaluated against: "does this get us to the 5-day unattended loop?" If not, it waits.*
