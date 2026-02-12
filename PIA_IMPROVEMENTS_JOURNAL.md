# PIA System Improvements Journal
## Discovered During DAO Rebuild — February 12, 2026
## Machine #1 Hub (izzit7) — Auto-Generated

---

## Improvements Implemented This Session

### 1. Network Sentinel Localhost Fix (Machine #3)
**Problem**: Network Sentinel was detecting localhost (127.0.0.1) as a port scanner when the dashboard loaded, because 31+ unique endpoints were hit rapidly.
**Fix**: Added `if (state.isLocalhost || state.isTailscale) return;` in `checkPortScan()` in `src/security/network-sentinel.ts`.
**Impact**: Critical — without this, the dashboard locks itself out on every machine.
**Status**: FIXED by Machine #3, committed, pushed.

### 2. Cross-Machine HTTP Delivery
**Problem**: Messages were logged locally but never actually delivered to remote machines.
**Fix**: Added HTTP POST fallback in `src/comms/cross-machine.ts` — delivers to `http://{tailscaleIp}:3000/api/relay/incoming`. Added `/api/relay/incoming` endpoint to `src/api/routes/relay.ts`.
**Impact**: Critical — messaging between machines now actually works.
**Status**: IMPLEMENTED by Machine #1, live.

### 3. Visor Auto-Open on Startup
**Problem**: Users had to manually open the browser to see the dashboard.
**Fix**: Added auto-open in `src/index.ts` using platform-specific commands (`start ""` on Windows, `open` on macOS, `xdg-open` on Linux). Skips if running in Electron or if `PIA_NO_BROWSER=1`.
**Status**: IMPLEMENTED, live.

---

## Improvements Needed (Discovered During DAO Rebuild)

### P0 — Critical

#### 4. Message Persistence in SQLite
**Problem**: All relay messages are stored in memory. Server restart = all messages lost.
**Proposal**: Create `relay_messages` table in PIA's SQLite DB. Store all messages with: id, from_machine, to_machine, content, type, timestamp, delivered_at.
**Effort**: 2-3 hours
**Benefit**: Message history survives restarts. New machines can catch up on missed messages.

#### 5. Auto-Registration on Startup
**Problem**: Every time a machine restarts, it must manually register with the hub via curl commands.
**Proposal**: On startup, if `PIA_HUB_URL` is set, automatically POST to `{hubUrl}/api/relay/register` with this machine's info. Retry every 30s if hub is unreachable. Also register hub on local relay.
**Implementation**:
```typescript
// src/comms/auto-register.ts
async function autoRegister() {
  const hubUrl = process.env.PIA_HUB_URL;
  if (!hubUrl) return; // We ARE the hub

  const myInfo = {
    id: process.env.PIA_MACHINE_NAME || os.hostname(),
    name: process.env.PIA_MACHINE_NAME,
    hostname: os.hostname(),
    project: 'PIA',
    tailscaleIp: await getTailscaleIp(),
    channels: ['api', 'tailscale']
  };

  // Register self on hub
  await fetch(`${hubUrl}/api/relay/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Token': token },
    body: JSON.stringify(myInfo)
  });

  // Register hub on local relay
  await fetch('http://localhost:3000/api/relay/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Token': token },
    body: JSON.stringify({ id: 'hub', tailscaleIp: new URL(hubUrl).hostname, ... })
  });
}
```
**Effort**: 1-2 hours
**Benefit**: Zero-config machine joining. Plug in, start PIA, done.

### P1 — Important

#### 6. Relay Message Auto-Journaling
**Problem**: Important architectural decisions happen in relay messages but aren't persisted beyond the relay buffer.
**Proposal**: Hook into relay message handler. Any message containing keywords like "decision", "architecture", "spec", "agreed", "approved" gets auto-appended to `JOURNAL_{date}.md`.
**Effort**: 1 hour
**Benefit**: Decisions are automatically documented.

#### 7. Spec Serving API
**Problem**: Spec files (Foundation, API Contracts, State Machines) are scattered across repos as markdown files. No central way to query the latest spec.
**Proposal**: Add `GET /api/specs/:name` endpoint that reads spec files from the repo and returns them. Machines can query `GET /api/specs/foundation` to get the latest spec.
**Effort**: 30 minutes
**Benefit**: Any machine can fetch specs via API instead of git pull.

#### 8. Remote PTY Session Management
**Problem**: PTY sessions accumulate and are never cleaned up. Buffer limited to ~4KB visible.
**Proposal**:
- Auto-expire PTY sessions after 30 minutes of inactivity
- Add `GET /api/sessions/:id/output?since=OFFSET` for streaming large outputs
- Add session naming: `POST /api/sessions { name: "dao-build", ... }`
**Effort**: 2-3 hours
**Benefit**: Cleaner session management for remote orchestration.

#### 9. WebSocket Push for Relay Messages
**Problem**: Visor polls every 3 seconds for new messages. That's a 0-3 second delay.
**Proposal**: When a relay message arrives, broadcast it via WebSocket to all connected Visor clients. Keep 3s polling as fallback only.
**Effort**: 1 hour
**Benefit**: Real-time chat in Visor. Machine #3 already designed this as Phase 2-3 of their UX plan.

### P2 — Nice to Have

#### 10. Task Delegation System Wiring
**Problem**: Routes exist for `/api/tasks` and `/api/delegation` but they're not wired to actual execution.
**Proposal**: When a task is assigned to a machine, create a PTY session on that machine and run the task. Report status back via relay.
**Effort**: 4-6 hours
**Benefit**: True automated task routing across machines.

#### 11. Hub Failover
**Problem**: If Machine #1 (hub) goes down, all coordination stops.
**Proposal**: Designate Machine #3 as backup hub. If spokes can't reach hub for 60 seconds, Machine #3 promotes itself to hub and other spokes reconnect.
**Effort**: 8-12 hours
**Benefit**: No single point of failure.

#### 12. Cost Tracking Across Machines
**Problem**: Each machine tracks its own AI costs independently. No fleet-wide cost view.
**Proposal**: Spokes report cost data to hub via relay. Hub aggregates and displays fleet-wide cost dashboard.
**Effort**: 3-4 hours
**Benefit**: One view of total AI spend across all machines.

---

## Architecture Insights from DAO Rebuild

### Insight 1: File-Based Messaging via Git
Git push/pull works as a reliable asynchronous messaging system between machines. Files committed to a shared repo are guaranteed to arrive (eventually). Good for specs, journals, large documents. Not good for real-time coordination.

### Insight 2: PTY is Powerful but Fragile
Remote PTY sessions give full terminal control but have limitations:
- Buffer overflow on long outputs
- No persistent history
- Session can drop
- Creating files via PTY is cumbersome (use git instead)
Best used for: running builds, checking status, git operations, quick commands.

### Insight 3: Parallel Agents are Key
Running 5+ agents in parallel (spec writers, implementation deployer, QA reviewer) dramatically increases throughput. The hub orchestrates, agents execute. This is the pattern PIA should formalize: Hub creates tasks → assigns to agents → agents execute in parallel → report back.

### Insight 4: Specs Before Code Saves Time
Writing Foundation Spec + API Contracts + State Machines BEFORE touching code means:
- All agents share the same blueprint
- No conflicting implementations
- Clear acceptance criteria for QA
- Documentation is a byproduct, not an afterthought

---

*Journal auto-generated by Hub Orchestrator*
*February 12, 2026*
*Next update: After all agents complete current tasks*
