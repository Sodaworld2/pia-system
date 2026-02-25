# PIA Integration Research — 6 Missing Items
**Compiled: 2026-02-22 | Deep code audit via Explore agent (27 tool calls)**

---

## Executive Summary

All 6 missing items were fully audited. The critical blocker is **B10 (spawn wire)** — a 1-hour fix that unblocks everything else. Two items are v1.0 required. Two are v2.0. The core loop integration test is the v1.0 exit gate.

| Item | Complexity | v1.0? | Blocked by |
|---|---|---|---|
| **B10: Spawn Wire** | 1 hour | YES — most critical | Nothing |
| **Tim Buc → Eliyahu Loop** | 6.5 hours | YES (partial) | B10 |
| **Handoff Protocol** | 5.5 hours | NO — v2.0 | B10 |
| **Agentic Commerce** | 3-5 days | NO — v2.0 | Nothing |
| **Coder Machine / Micro-Apps** | 1 day | NO — v2.0 | B10 |
| **Integration Test (DA4)** | 1-2 days | YES — v1.0 exit gate | B10 |

---

## 1. B10 — Spawn Wire

### Current State (exact lines)

- `src/souls/soul-engine.ts` lines 190–258: `generateSystemPrompt(soulId, extraContext?)` — fully functional
- `src/mission-control/agent-session.ts` lines 116–144: `AgentSessionConfig` has `systemPrompt?: string` but NO `soulId?: string`
- Lines 509–515: System prompt assembly — hardcoded to `{ type: 'preset', preset: 'claude_code', append: session.config.systemPrompt }`. Soul engine NEVER called.
- `src/api/routes/mission-control.ts` line 70–72: POST /api/mc/agents — does not extract `soulId` from request body
- `src/api/routes/orchestrator.ts` lines 173, 228: DOES extract `soulId` — this route has soul support; mission-control route does not

### The Gap

6 pieces missing:
1. `soulId?: string` field missing from `AgentSessionConfig` interface
2. Import of `getSoulEngine` not in agent-session.ts
3. SDK mode (lines 509–515) never calls `generateSystemPrompt()`
4. Mission Control API route never passes `soulId` to `mgr.spawn()`
5. HTML spawn form has no soulId dropdown
6. API mode (autonomous-worker) also missing soul injection

### Integration Plan

**Step 1** — Add to `AgentSessionConfig` interface (agent-session.ts line ~126):
```typescript
soulId?: string;  // If set, load soul and override systemPrompt
```

**Step 2** — Add import at top of agent-session.ts:
```typescript
import { getSoulEngine } from '../souls/soul-engine.js';
```

**Step 3** — Replace lines 509–515 in agent-session.ts:
```typescript
let finalSystemPrompt: string | undefined = session.config.systemPrompt;
if (session.config.soulId) {
  try {
    const engine = getSoulEngine();
    finalSystemPrompt = engine.generateSystemPrompt(
      session.config.soulId,
      session.config.systemPrompt  // appended as extraContext
    );
  } catch (err) {
    logger.warn(`Failed to load soul ${session.config.soulId}: ${err}. Falling back.`);
  }
}
queryOptions.systemPrompt = {
  type: 'preset',
  preset: 'claude_code',
  append: finalSystemPrompt || undefined,
};
```

**Step 4** — Update mission-control.ts route destructuring (~line 70) to include:
```typescript
const { ..., soulId } = req.body;
// Pass to mgr.spawn(): add soulId to the config object
```

**Step 5** — Add soulId dropdown to HTML spawn form (public/mission-control.html):
```html
<select id="spawnSoulId">
  <option value="">No soul</option>
  <option value="fisher2050">Fisher2050</option>
  <option value="eliyahu">Eliyahu</option>
  <!-- populated dynamically from GET /api/souls -->
</select>
```

**Step 6** — Include in JS spawn payload.

### Complexity: Small (1 hour)
### Dependencies: None — standalone fix

---

## 2. Tim Buc → Eliyahu Self-Improvement Loop

### Current State

**What works:**
- `src/services/tim-buc-service.ts` (232 lines) — passive listener, writes to `agent_records` ✓
- `fisher-service.ts` lines 407–464: `buildEliyahuPrompt()` reads from `agent_records` ✓
- `agent_messages` table exists (migration 046) ✓
- `agent_records` table exists (migration 047) ✓

**What's broken:**
- Tim Buc (line 132): reads `session.config.soulId` — field doesn't exist yet (blocked by B10)
- Quality score (lines 136–145): `qualityScore = produced.length > 0 ? 80 : 70` — pure heuristic, not real analysis
- No Eliyahu → Fisher2050 feedback — Eliyahu sends morning briefing to Mic via email but nothing routes patterns BACK to Fisher2050

### The Gap

1. **No inter-agent messaging wired** — `agent_messages` table exists but nothing writes Fisher2050's inbox from Eliyahu
2. **No Eliyahu pattern analysis** — Eliyahu reads last 24h of records but doesn't aggregate 7-day pass rates or quality trends
3. **No longitudinal memory for Eliyahu** — each 6am spawn starts fresh; no memory of yesterday's patterns
4. **Ziggi verdicts not fed to Eliyahu** — `quality_verdict` in agent_records exists but `buildEliyahuPrompt()` doesn't include Ziggi pass/fail rates
5. **Tim Buc is a service, not an agent** — it cannot develop memory or identity; it's a passive DB writer

### Integration Plan

**Step 1** — Wire Eliyahu → Fisher2050 via agent_messages after morning briefing:
```typescript
// After buildEliyahuPrompt() runs, inject analysis into Fisher2050's inbox
db.prepare(`
  INSERT INTO agent_messages (id, to_agent, from_agent, subject, body, expires_at)
  VALUES (?, 'fisher2050', 'eliyahu', ?, ?, unixepoch('now', '+1 day'))
`).run(nanoid(), 'Daily Pattern Analysis', analysisText);
```

**Step 2** — Fisher2050 reads agent_messages at spawn time (inject via `extraContext`):
```typescript
// When spawning Fisher2050:
const unread = db.prepare(`
  SELECT * FROM agent_messages WHERE to_agent = 'fisher2050' AND read_at IS NULL
  ORDER BY created_at DESC LIMIT 10
`).all();
const extraContext = unread.map(m => `[${m.from_agent}] ${m.subject}: ${m.body}`).join('\n');
engine.generateSystemPrompt('fisher2050', extraContext);
// Mark as read
db.prepare(`UPDATE agent_messages SET read_at = unixepoch() WHERE to_agent = 'fisher2050'`).run();
```

**Step 3** — Enhance `buildEliyahuPrompt()` with 7-day pattern analysis:
```typescript
// Add to query: include Ziggi verdicts and 7-day pass rates
const passRates = db.prepare(`
  SELECT agent,
    COUNT(*) as total,
    SUM(CASE WHEN quality_verdict LIKE '%PASS%' THEN 1 ELSE 0 END) as passed
  FROM agent_records
  WHERE created_at >= unixepoch('now', '-7 days')
  GROUP BY agent
`).all();
```

**Step 4** — Add Eliyahu memory injection at spawn:
```typescript
const recentInsights = await getMemoryManager().getRecentMemories('eliyahu', 5);
const extraContext = recentInsights.map(m => m.content).join('\n');
// Pass to generateSystemPrompt('eliyahu', extraContext)
```

### Complexity: Medium (6.5 hours)
### Dependencies: B10 must be done first

---

## 3. Handoff Protocol

### Current State

- FisherService `scheduleJob()` takes optional `onComplete?: (result) => Promise<void>` callback
- Example wired: Eliyahu email on Tim Buc completion (lines 99–105)
- `calendar_events` table (migration 045): no `next_agent` or `handoff_target` field
- `tasks` table (migration 001): has `blocks`/`blocked_by` but no `handoff_target`
- No general-purpose runtime handoff mechanism — every handoff is hardcoded in FisherService

### The Gap

- No declarative handoff table
- Cannot express: "when Farcake completes with quality ≥ 7, spawn Ziggi"
- Cannot express conditional paths (pass vs fail → different next agent)
- Cannot express parallel handoffs (one task → two agents simultaneously)

### Integration Plan (v2.0)

**New table** — `automation_profiles`:
```sql
CREATE TABLE automation_profiles (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES souls(id),
  trigger TEXT NOT NULL,  -- 'cron' | 'event' | 'manual'
  on_success_action TEXT, -- 'spawn_agent' | 'create_task' | 'email' | 'none'
  on_success_next_agent TEXT REFERENCES souls(id),
  on_success_condition TEXT, -- JS expr: "quality_score >= 7"
  on_failure_action TEXT,  -- 'retry' | 'escalate' | 'email'
  on_failure_retry_count INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
```

**Runtime enforcement** — In `AgentSessionManager` after emitting 'complete':
```typescript
const profile = db.prepare(`SELECT * FROM automation_profiles WHERE agent_id = ?`).get(agentName);
if (profile?.on_success_action === 'spawn_agent') {
  const isSuccess = evaluateCondition(profile.on_success_condition, { session, quality });
  if (isSuccess) mgr.spawn({ soulId: profile.on_success_next_agent, ... });
}
```

### Complexity: Medium (5.5 hours)
### v1.0 scope: NO — deferred to v2.0

---

## 4. Agentic Commerce

### Current State

- Internal API cost tracking works: `ai_usage`, `ai_budgets`, `ai_cost_daily` tables all exist
- Daily cost reported in Fisher standup (fisher-service.ts line 384)
- NO payment gateway, NO spending authority, NO external transaction capability

### Verdict: **DO NOT BUILD FOR v1.0**

V1_DEFINITION.md explicitly defers commerce. Cost tracking is sufficient for v1.0.

**v2.0 requirements when ready:**
- Stripe integration for agent spending authority
- `transactions` table with approval workflow
- Commerce profile per soul (e.g., Coder Machine: up to $50/month on cloud)
- Cost-benefit evaluator (ROI threshold before spending)

### Complexity: Large (3–5 days)
### v1.0 scope: NO — v2.0

---

## 5. Coder Machine / Micro-App Pattern

### Current State

- `src/souls/personalities/coder_machine.json` — **fully defined soul** with complete job execution spec
- Config includes: `queue_type: "fisher2050_coding_jobs"`, `require_tests: true`, `use_git: true`
- Job flow in soul: pull job → read context → state scope → code → test → commit → report → file
- NO coding job queue table exists
- NO Coder Machine spawn trigger
- NO git worktree support in code
- NO PR submission mechanism
- V1_DEFINITION.md line 58: **explicitly deferred to v2.0**

### Integration Plan (v2.0)

1. **`coding_jobs` table** (migration 049): title, description, codebase, feature_branch, context_json, status, pr_url, test_results
2. **API endpoint**: `POST /api/jobs/coding` — submit job, returns jobId
3. **CoderMachineOrchestrator service**: polls `coding_jobs` every 30s, spawns Coder Machine with soul + job context
4. **Git worktree pattern** in soul system_prompt: `git worktree create` before coding, `git worktree remove` after
5. **GitHub PR submission**: `POST https://api.github.com/repos/{repo}/pulls` on test pass
6. **Deployment step**: run deploy command, verify health check, update job status

### Complexity: Large (1 day focused)
### v1.0 scope: NO — v2.0

---

## 6. Integration Test — Core Loop (DA4)

### Current State

- **No test harness exists** — no `tests/`, `__tests__/`, no `*.test.ts` files found
- Existing: `dao-test-fixed.cjs`, `dao-full-test.cjs` — DAO-only, irrelevant
- V1_DEFINITION.md success criterion 9: *"The core loop runs 5 days in a row without manual intervention"*
- This IS the v1.0 exit gate

### The 10-step loop to test

1. Fisher2050 reads incoming goal
2. Creates `calendar_events` entry
3. PIA cron spawns Farcake at scheduled time
4. Farcake runs and produces output
5. Tim Buc fires on session completion
6. Tim Buc files `agent_records`
7. Ziggi spawns and reviews output
8. Eliyahu reads records, sends briefing
9. Eliyahu writes analysis to Fisher2050's `agent_messages` inbox
10. Fisher2050 receives analysis, schedules next iteration

### Test Harness Plan (tests/integration/core-loop.test.ts)

```typescript
describe('PIA Core Loop — 5-Day Integration Test', () => {
  // In-memory SQLite, deterministic timezone, mocked Anthropic API

  test('Goal received → Fisher schedules Farcake', async () => { ... });
  test('Farcake spawns and produces output', async () => { ... });
  test('Tim Buc files agent_records within 5 min', async () => { ... });
  test('Ziggi spawns and reviews within 30 min', async () => { ... });
  test('Eliyahu reads records at 6am', async () => { ... });
  test('5-day repeat without intervention', async () => { ... });
  test('State survives server restart', async () => { ... });
  test('Farcake crash: rescheduled by Fisher', async () => { ... });
  test('Tim Buc failure: Ziggi still spawns', async () => { ... });
});
```

**Key setup needs:**
- `jest` or `vitest` configured (not currently in package.json)
- Mock for `ANTHROPIC_API_KEY` (don't burn real tokens in tests)
- In-memory SQLite for test isolation
- `waitFor()` helper for async event verification

### Complexity: Large (1–2 days)
### v1.0 scope: **YES — MUST COMPLETE BEFORE v1.0 RELEASE**

---

## Build Order (v1.0 only)

```
WEEK 1
├── B10: Spawn wire (1 hour) ← do this FIRST, unblocks everything
│
├── Tim Buc loop (6.5 hours)
│   ├── Wire agent_messages Eliyahu → Fisher2050
│   ├── 7-day pattern analysis in buildEliyahuPrompt()
│   └── Memory injection for Eliyahu at spawn
│
└── Integration test setup (1 day)
    ├── Jest/vitest config
    ├── Core loop test (5-day simulation)
    └── Failure scenario tests

DEFERRED TO v2.0
├── Handoff Protocol (automation_profiles table)
├── Agentic Commerce (Stripe, spending authority)
└── Coder Machine / Micro-Apps (coding_jobs queue, git worktree, PR submission)
```

---

## Sources

- `src/mission-control/agent-session.ts` — full audit
- `src/souls/soul-engine.ts` — full audit
- `src/api/routes/mission-control.ts` — full audit
- `src/api/routes/orchestrator.ts` — full audit
- `src/services/tim-buc-service.ts` — full audit
- `src/services/fisher-service.ts` — full audit
- `src/souls/personalities/*.json` — all 12 souls reviewed
- `research/AGENT_PRODUCT_SHEETS.md` — automation profiles spec
- `V1_DEFINITION.md` — scope boundaries
- `research/DEVILS_ADVOCATE.md` — DA4 requirement
