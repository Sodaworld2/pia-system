# Agent Enrichment System — Full Specification
**Written: 2026-02-21 | Session 6 — Soul Deep Audit**
**Status: PLAN ONLY — No code written**

---

## Executive Summary

The soul system infrastructure is **fully built and complete**. All 12 agents have well-written souls (1000–1900 chars each), 5–6 goals each, 4–11 relationships each. The API has 17 endpoints. The engine works.

**The gap is not the souls. The gap is the wire.**

`agent-session.ts` never calls `generateSystemPrompt()`. Every agent spawned today runs WITHOUT their soul. One 20-line fix unlocks everything else.

Beyond the wire fix, the enrichment system has four purposes:
1. **Fix** — repair gaps as they emerge (thin goals, stale memories, conflicting instructions)
2. **Separate** — make each soul independently editable, versioned, portable (no code required to edit a soul)
3. **Improve** — deepen souls over time: more specific instructions, richer memories, methodology frameworks injected
4. **Analyse** — health scores, memory depth, freshness tracking, Eliyahu soul audit

---

## Part 1: Current Soul System State

### Soul Field Audit (as of 2026-02-21)

All data from `src/souls/personalities/*.json` — confirmed by code audit.

| Agent | Personality | Instructions | Goals | Relationships | Email | Machine |
|---|---|---|---|---|---|---|
| Controller | 1245c | 1418c | 5 | 5 | controller@sodalabs.ai | M1 |
| Fisher2050 | 1192c | 1593c | 6 | 11 | fisher2050@sodalabs.ai | M1 |
| Eliyahu | 1529c | 1544c | 5 | 6 | eliyahu@sodalabs.ai | M1 |
| Tim Buc | 1161c | 1255c | 5 | 4 | timbuc@sodalabs.ai | M1 |
| Owl | 1037c | 1199c | 5 | 4 | NONE (infrastructure) | M1 |
| Monitor | 1316c | 1422c | 5 | 5 | NONE (infrastructure) | M1 |
| Ziggi | 1584c | 1717c | 5 | 9 | ziggi@sodalabs.ai | M2 |
| Farcake | 1256c | 1337c | 5 | 5 | farcake@sodalabs.ai | M3 |
| Andy | 1295c | 1512c | 5 | 7 | andy@sodalabs.ai | M3 |
| Bird Fountain | 1297c | 1629c | 5 | 6 | birdfountain@sodalabs.ai | M2 |
| Wingspan | 1436c | 1707c | 5 | 6 | wingspan@sodalabs.ai | M3 |
| Coder Machine | 1479c | 1893c | 5 | 4 | NONE (no human-facing comms) | dedicated |

**Status: All 12 souls are complete and well-written.**

### What `generateSystemPrompt()` Assembles (exact order from source)

```
# Identity: {name}
**Role:** {role}
**Email:** {email}              ← omitted if null

## Personality
{personality prose}

## Instructions
{system_prompt}                ← omitted if null

## Current Goals
1. {goal}
2. {goal}
...

## Relationships
- **{agent}**: {description}
...

## Recent Memory
- [category/date] {content}    ← up to 20 recent + 10 importance≥7, deduplicated
...

## Current Context
{extraContext}                 ← task/project info passed at spawn time
```

### The Wiring Gap — Exact Location

**File:** `src/mission-control/agent-session.ts`
**Lines 499–504:**
```typescript
queryOptions.systemPrompt = {
  type: 'preset',
  preset: 'claude_code',
  append: session.config.systemPrompt || '',
};
```

**`AgentSessionConfig` interface (lines 116–144):** Has `systemPrompt?: string` but NO `soulId`.

No soul is ever loaded. No `getSoulEngine()` call exists in this file. The entire soul pipeline produces souls that are never used at spawn time.

---

## Part 2: Soul Enrichment System Design

### Where It Lives

A separate page: `public/soul-enrichment.html`

**Reasons for separate page (not a tab in mission-control.html):**
- mission-control.html is already 3,749 lines — adding a full editor would push it past 6,000
- The soul editor needs full-screen real estate (split editor + preview layout)
- Each page stays focused: MC = agent control, soul-enrichment = agent personality management
- Linked from mission-control.html header: `[Souls ↗]` link

No new backend needed. All backed by existing `/api/souls/*` (17 endpoints).

---

### Component 1: Soul Roster Grid

**Layout:** Tiered by machine layer (M1 Strategic → Quality → M3 Execution → M2 Orchestration → Dedicated)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Agent Enrichment — SodaLabs Fleet                    [+ New Soul]      │
├─────────────────────────────────────────────────────────────────────────┤
│  M1 STRATEGIC                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──┐│
│  │ C        │ │ F        │ │ E        │ │ T        │ │ O        │ │ M ││
│  │Controller│ │Fisher    │ │Eliyahu   │ │Tim Buc   │ │Owl       │ │Mon││
│  │ ●active  │ │ ●active  │ │ ●active  │ │ ●active  │ │ ●active  │ │●a ││
│  │ ████ 92% │ │ ████ 88% │ │ ████ 90% │ │ ████ 85% │ │ ███ 72%  │ │███││
│  │ 0 memories│ │ 0 mem   │ │ 0 mem    │ │ 0 mem    │ │ 0 mem    │ │0  ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──┘│
│  QUALITY GATE         M3 EXECUTION                   M2 / DEDICATED    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ Z Ziggi  │ │ F Farcake│ │ A Andy   │ │ W Wingspn│ │ B Bird F │ ... │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

**Each card contains:**
- Colored avatar initial (color by tier: M1=blue, M2=orange, M3=purple, dedicated=green)
- Agent name + role (truncated to 30 chars)
- Status dot (active/inactive/archived) — clickable to toggle
- Soul health score ring (SVG progress circle, 0–100%)
  - 90–100%: green | 70–89%: yellow | 40–69%: orange | 0–39%: red
- Memory count badge
- Last enriched timestamp ("Never" until first edit)
- Three action buttons: `[Edit]` `[+ Memory]` `[Preview]`
- Eliyahu flag (if soul is flagged for enrichment): red warning dot

**Soul health score calculation (0–100%):**
| Criterion | Score |
|---|---|
| `personality` ≥ 200 chars | +20 |
| `system_prompt` ≥ 300 chars | +20 |
| `goals` array has ≥ 3 items | +20 |
| `relationships` map has ≥ 3 entries | +20 |
| `config` has `machine` assignment | +10 |
| `soul_memories` count ≥ 5 | +10 |

**Based on current state:** All 12 souls score ~90% (all fields complete, 0 memories = -10).

---

### Component 2: Soul Editor — 6-Section Form

**Layout:** 60/40 split — form on left, live system prompt preview on right.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Back to Roster          Fisher2050          [Save] [Export] [↺ v3] │
├───────────────────────────────────────┬──────────────────────────────┤
│  1. IDENTITY                          │  SYSTEM PROMPT PREVIEW       │
│  Name: [Fisher2050          ]         │  ─────────────────────────   │
│  Role: [Project Manager...  ]         │  # Identity: Fisher2050      │
│  Email: [fisher2050@sodalabs.ai]      │  **Role:** Project Manager.. │
│  Status: ● Active ▼                   │                              │
│                                       │  ## Personality              │
│  2. CHARACTER (personality)           │  You are Fisher2050, the..   │
│  ┌─────────────────────────────────┐  │  [... live rendered ...]     │
│  │ You are Fisher2050, the Project │  │                              │
│  │ Manager of SodaWorld...        │  │  Tokens: ~2,400              │
│  │                                │  │  [Copy] [Spawn with Soul]    │
│  └─────────────────────────────────┘  │                              │
│  1,192 chars  ✅ Well developed        │                              │
│                                       │                              │
│  3. MISSION (system_prompt)           │                              │
│  ┌─────────────────────────────────┐  │                              │
│  │ [Mic's Working Style]...        │  │                              │
│  └─────────────────────────────────┘  │                              │
│  1,593 chars  ✅ Detailed              │                              │
│                                       │                              │
│  4. GOALS  (6 goals)                  │                              │
│  ⠿ Keep all projects on track...  ✕   │                              │
│  ⠿ Ensure every task has owner... ✕   │                              │
│  ⠿ Run daily reviews...          ✕   │                              │
│  [+ Add Goal]                         │                              │
│                                       │                              │
│  5. RELATIONSHIPS (11 entries)        │                              │
│  [Mic          ▼] The boss. Reports.. │                              │
│  [Controller   ▼] Upstream router...  │                              │
│  [+ Add Relationship]                 │                              │
│                                       │                              │
│  6. CONFIG                            │                              │
│  Machine: [M1 ▼]                      │                              │
│  Always on: [○ OFF]                   │                              │
│  Ephemeral: [○ OFF]                   │                              │
│  Daily review: [09:00]                │                              │
│  Evening summary: [18:00]             │                              │
│  Auto Ziggi review: [● ON]            │                              │
└───────────────────────────────────────┴──────────────────────────────┘
```

**Section details:**

**Section 1 — Identity**
- Name: text input
- Role: text input (100 chars max, hints: "e.g., Project Manager and Machine Resource Scheduler")
- Email: text input (auto-suggest @sodalabs.ai)
- Status: dropdown (active / inactive / archived)

**Section 2 — Character (`personality`)**
- Full auto-resizing textarea
- Character count with quality band:
  - < 200 chars: `⚠️ Thin — describe communication style, 3+ personality traits, 2+ quirks`
  - 200–500 chars: `⚠️ Developing — consider adding more distinctive voice`
  - > 500 chars: `✅ Well developed`
- Prompt: "Define their voice, traits, quirks, communication style, and catch-phrases"

**Section 3 — Mission (`system_prompt`)**
- Full auto-resizing textarea
- Character count with quality band:
  - Empty: `🔴 MISSING — agent has no operational instructions. Will behave unpredictably.`
  - < 300 chars: `⚠️ Too thin — write step-by-step trigger response + output format`
  - > 300 chars: `✅ Instructions present`
- Contains: Mic's Working Style block + trigger response + output format + when to escalate
- Prompt: "Step-by-step: when triggered, what do you do? What format do you produce? When do you escalate?"

**Section 4 — Goals**
- Drag-to-reorder ordered list (drag handle ⠿)
- Each item: `[⠿] [goal text...............] [✕]`
- `[+ Add Goal]` button at bottom
- Goal count badge — warn if < 3
- Hint: "Goal order = priority order. Most important goal goes first."

**Section 5 — Relationships**
- Key-value pair table: `[agent dropdown] → [description input]` `[✕]`
- Agent dropdown: autocompletes from 12 known souls + "Mic" + common external names
- Warnings:
  - "Mic" not present: `⚠️ Every agent should know who their boss is`
  - "Tim Buc" not present: `⚠️ Every agent should know where to archive`
- `[+ Add Relationship]` button

**Section 6 — Config**
- Machine: dropdown (M1 / M2 / M3 / dedicated)
- Boolean toggles rendered based on soul type:
  - `always_on` — is this agent persistent or ephemeral?
  - `ephemeral` — terminates after each task?
  - `autoCreateZiggiReview` — Fisher2050 only
  - `requires_ziggi_review` — execution agents
  - `trackTechnicalDebt` — Ziggi only
  - `useContext7` — Ziggi, Farcake
  - `backup_required` — Owl only
- Schedule fields (shown for agents with cron times):
  - `morningBriefingTime` (Eliyahu)
  - `dailyReviewTime` + `eveningSummaryTime` (Fisher2050)
  - `deepReviewTime` (Ziggi)
- Numeric fields:
  - `maxTasksPerAgent`, `confidenceThreshold`, `codeQualityMinimum`, etc.
- Raw JSON editor (power mode — collapsible `[Show raw config JSON]`)

---

### Component 3: Memory Panel

Accessed via `[+ Memory]` on roster card, or as a tab in the Soul Editor.

```
┌──────────────────────────────────────────────────────────────┐
│  Fisher2050 — Memory Bank (0 memories)                       │
│  [Add Memory]  [View Memories]  [Stats]                      │
├──────────────────────────────────────────────────────────────┤
│  ADD MEMORY                                                  │
│  Category:   [experience      ▼]                            │
│  Content:    [What happened...                           ]  │
│              [                                           ]  │
│  Importance: [──────●────────] 7/10  (Notable)              │
│  Context:    [e.g., "Project: SodaWorld, Date: 2026-02-21"] │
│                                               [Save Memory] │
├──────────────────────────────────────────────────────────────┤
│  MEMORY STATS (populated once memories exist)               │
│  Total: 0 | Avg importance: — | Categories: —               │
│  [Summarize old (7d+)] [Prune low-value (30d+, imp≤3)]      │
└──────────────────────────────────────────────────────────────┘
```

**Categories with labels:**
- `experience` — "Something happened during a session"
- `decision` — "A decision was made (with reasoning)"
- `learning` — "Something discovered or learned"
- `interaction` — "Interaction with another agent or Mic"
- `observation` — "Pattern or observation noticed"
- `goal_progress` — "Progress toward a goal"
- `summary` — "Auto-generated by the summarize function"

**Importance scale labels:**
- 1–2: Trivial (will be pruned first)
- 3–4: Low
- 5–6: Normal (default)
- 7–8: Notable (surfaces in important memories)
- 9–10: Critical (never pruned)

**View Memories tab:**
- Filter: category | importance threshold | date range | keyword search
- Memory list items: `[7] [experience] [2026-02-21] "content text..." [✕]`
- Batch: `[Summarize old (7d+)]` | `[Prune old (30d+, imp≤3)]`

---

### Component 4: System Prompt Preview

Right panel — updates live (500ms debounce after any field edit).

```
┌──────────────────────────────────────────────────┐
│  SYSTEM PROMPT PREVIEW        [Copy] [Spawn →]   │
│  ─────────────────────────────────────────────── │
│  # Identity: Fisher2050                          │
│  **Role:** Project Manager and Machine Resource  │
│  Scheduler                                       │
│  **Email:** fisher2050@sodalabs.ai               │
│                                                  │
│  ## Personality                                  │
│  You are Fisher2050, the Project Manager of the  │
│  SodaWorld ecosystem. You are organized,         │
│  proactive, and relentless about follow-through. │
│  ...                                             │
│                                                  │
│  ## Instructions                                 │
│  [Mic's Working Style]                           │
│  - Lead with the answer, reasoning after         │
│  ...                                             │
│                                                  │
│  ## Current Goals                                │
│  1. Keep all projects on track...                │
│  ...                                             │
│  ─────────────────────────────────────────────── │
│  ~6,800 chars | ~1,700 tokens                    │
│  ✅ Within budget                                │
│                                                  │
│  Task context (optional):                        │
│  [Add context to see how it affects prompt...]   │
└──────────────────────────────────────────────────┘
```

- Token estimate: `chars / 4` (rough approximation)
- Budget warnings:
  - > 4,000 tokens: `⚠️ Large prompt — consider trimming personality or goals`
  - > 8,000 tokens: `🔴 Very large — will consume ~25% of context window on spawn`
- `[Spawn with this soul]` → opens Mission Control spawn modal pre-filled with this soulId

---

## Part 3: Soul Repair System

### Repair Types

| Type | Symptom | Fix |
|---|---|---|
| **Thin** | Personality < 200 chars or missing system_prompt | Editor warns with red/orange banner per section |
| **Conflicting** | Personality says "minimal comms" but instructions say "send daily updates" | Eliyahu audit flags — human reviews in editor |
| **Stale** | No new memories in 14+ days despite agent activity | Memory panel shows "Last memory: 47 days ago ⚠️" |
| **Orphan** | No "Mic" or "Tim Buc" in relationships | Editor shows warning in Section 5 |
| **Underprioritised** | Goals not ordered by importance | Section 4 hint + drag to reorder |
| **Machine mismatch** | Config says M3 but agent keeps getting spawned on M1 | Config section shows machine vs actual spawn machine |

### Repair Workflow (in the editor)

1. Open soul from roster card
2. Red/orange warnings show which sections need attention
3. Edit the sections flagged
4. Watch system prompt preview update live — see the effect
5. Save → soul updated in DB immediately
6. Preview prompt reflects the fixed soul
7. Health score recalculates on next roster view

---

## Part 4: Soul Analysis System

### Soul Health Endpoint (to build)

```
GET /api/souls/:id/health
```

Returns:
```json
{
  "soulId": "fisher2050",
  "score": 90,
  "breakdown": {
    "personality": { "points": 20, "chars": 1192, "status": "excellent" },
    "system_prompt": { "points": 20, "chars": 1593, "status": "excellent" },
    "goals": { "points": 20, "count": 6, "status": "excellent" },
    "relationships": { "points": 20, "count": 11, "status": "excellent" },
    "config": { "points": 10, "hasMachine": true, "status": "complete" },
    "memories": { "points": 0, "count": 0, "status": "empty — add memories after first sessions" }
  },
  "warnings": [],
  "lastEnriched": null,
  "memoryFreshness": null
}
```

### Eliyahu Soul Audit

When Eliyahu runs her periodic audit (configurable, suggested weekly):

1. Call `GET /api/souls` to list all souls
2. Call `GET /api/souls/:id/health` for each
3. Call `GET /api/souls/:id/memories/stats` for each
4. Cross-reference soul goals with actual session output (from Tim Buc Records DB)
5. Produce audit report:

```
Soul Audit — 2026-02-21

Fisher2050: 90% health. 0 memories (expected after 2 sessions). Goals aligned with activity.
Ziggi: 92% health. 0 memories. Config uses Context7 — verify this capability is available.
Owl: 72% health. Missing memories layer — Owl's purpose requires persistent state but has no memories yet.
Coder Machine: 85% health. Missing email. If Coder Machine will receive task notifications, needs email.

Action Items:
→ Fisher2050 to schedule memory enrichment session (add first 5 key facts from this week's sessions)
→ Owl: add memories as state fills up
→ Coder Machine: decide if email needed before email service goes live
```

---

## Part 5: Soul Separation + Portability

### Export
```
GET /api/souls/:id/export
```
Returns the soul as a downloadable JSON file — exact same format as the `src/souls/personalities/*.json` files. Any soul can be re-imported anywhere.

### Import
```
POST /api/souls/import
Body: { soul: SoulDefinition }
```
Creates a new soul or (with `?overwrite=true`) replaces an existing one. Validates schema before writing.

### Version Snapshots (new migration needed)

New table: `soul_versions`
```sql
CREATE TABLE soul_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  soul_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,  -- full JSON snapshot of soul at that point
  saved_by TEXT,           -- 'user' or agent name
  note TEXT,               -- e.g., "before enrichment session 2026-02-21"
  created_at INTEGER NOT NULL
);
```

- Auto-snapshot taken before every `PUT /api/souls/:id` (except status-only changes)
- Max 10 versions per soul (oldest pruned automatically)
- `GET /api/souls/:id/versions` — list snapshots
- `POST /api/souls/:id/rollback/:versionId` — restore a snapshot

### Cross-Machine Soul Sync

When a soul is updated on M1:
```typescript
// In PUT /api/souls/:id handler (souls.ts)
wss.broadcast({ type: 'soul:updated', soulId: id, updatedAt: Date.now() });
```

Workers (M2/M3) receive `soul:updated` event and cache-bust: on next spawn for that soulId, they fetch the fresh soul from M1 via `GET /api/souls/:id` before calling `generateSystemPrompt()`.

---

## Part 6: Integration into Current PIA System — 8 Points

### Integration 1: The Spawn Wire (HIGHEST PRIORITY)

**File:** `src/mission-control/agent-session.ts`
**Change 1 — Add field to interface (line ~126):**
```typescript
export interface AgentSessionConfig {
  // ... existing fields ...
  soulId?: string;  // Optional: load soul and inject personality at spawn
}
```

**Change 2 — Import SoulEngine (top of file):**
```typescript
import { getSoulEngine } from '../souls/soul-engine.js';
```

**Change 3 — Wire at lines 499–504:**
```typescript
// System prompt — use claude_code preset, inject soul if provided
let appendPrompt = session.config.systemPrompt || '';
if (session.config.soulId) {
  try {
    const soulEngine = getSoulEngine();
    const taskContext = session.config.task || '';
    const soulPrompt = soulEngine.generateSystemPrompt(session.config.soulId, taskContext);
    appendPrompt = soulPrompt + (appendPrompt ? '\n\n---\n\n' + appendPrompt : '');
    logger.info(`Soul injected: ${session.config.soulId}`);
  } catch (err) {
    logger.warn(`Soul not found: ${session.config.soulId} — spawning without soul`);
  }
}
queryOptions.systemPrompt = {
  type: 'preset',
  preset: 'claude_code',
  append: appendPrompt,
};
```

**Effort: 20 lines. Zero risk (gracefully falls back if soulId invalid).**

---

### Integration 2: Mission Control Spawn API

**File:** `src/api/routes/mission-control.ts`
**In POST /api/mc/agents handler — add `soulId` to destructured body:**
```typescript
const { task, model, machineId, approvalMode, systemPrompt, soulId, ... } = req.body;
// ... pass soulId through to AgentSessionConfig:
const config: AgentSessionConfig = { ..., soulId, ... };
```

---

### Integration 3: Spawn Modal in Dashboard

**File:** `public/mission-control.html`
**In the spawn agent modal — add soul selector:**
```javascript
// On modal open: fetch active souls
const souls = await fetch('/api/souls').then(r => r.json());
// Render soul dropdown:
// <select id="spawnSoulId">
//   <option value="">No soul (generic agent)</option>
//   <option value="fisher2050">Fisher2050 — Project Manager</option>
//   ...
// </select>
// Pass selected value as soulId in POST /api/mc/agents body
```

---

### Integration 4: FisherService Spawn Calls

**File:** `src/services/fisher-service.ts`
**When Fisher2050 schedules an agent spawn, include the target agent's soulId:**
```typescript
// Example: spawning Ziggi at 2am
agentSessionManager.spawn({
  task: 'Nightly quality audit',
  soulId: 'ziggi',          // ← new field
  machineId: m2MachineId,
  ...
});
```
Each cron job in FisherService should pass the correct `soulId` for each agent it schedules.

---

### Integration 5: Tim Buc → Soul Memory Loop

**When Tim Buc archives a session, he should also add memories to the agent's soul.**

After filing to Records DB:
```typescript
// Tim Buc adds 1-3 key memories per archived session
await fetch(`/api/souls/${agentId}/memories`, {
  method: 'POST',
  body: JSON.stringify({
    category: 'experience',
    content: `Completed: ${taskSummary}`,
    importance: sessionImportance,  // derived from task complexity/outcome
    context: `Session: ${sessionId}, Date: ${date}, Cost: $${cost}`,
  })
});
```
This closes the continuity loop:
`Session → Tim Buc files → soul gets memory → next spawn has context → agent remembers`

---

### Integration 6: Soul Health Endpoint

**File:** `src/api/routes/souls.ts`
**Add `GET /api/souls/:id/health`:**
```typescript
router.get('/:id/health', (req, res) => {
  const soul = getSoulEngine().getSoul(param(req, 'id'));
  const memStats = getSoulEngine().getMemoryManager().getMemoryStats(param(req, 'id'));
  // Calculate score (100-point breakdown as per spec)
  // Return score + breakdown + warnings
});
```

---

### Integration 7: Cross-Machine Soul Sync

**File:** `src/api/routes/souls.ts`
**In the `PUT /api/souls/:id` handler — broadcast on save:**
```typescript
// After successful soul update:
getWebSocketServer()?.broadcast({
  type: 'soul:updated',
  soulId: id,
  updatedAt: Date.now(),
});
```

**On workers (`src/local/hub-client.ts`):**
```typescript
// Listen for soul:updated events
case 'soul:updated':
  soulCache.invalidate(event.soulId);
  break;
```

---

### Integration 8: Soul Version Snapshots

**New migration:** `soul_versions` table (see Part 5 above).
**In `PUT /api/souls/:id` — snapshot before write:**
```typescript
// Before update:
const current = getSoulEngine().getSoul(id);
saveSnapshot(id, current, 'user');
// Then do the update
```

---

## Part 7: The Full Data Flow (How It All Connects)

```
1. Mic enriches Fisher2050 in soul-enrichment.html
   → PUT /api/souls/fisher2050
   → Auto-snapshot saved (version N)
   → WebSocket: soul:updated → M2/M3 cache bust

2. FisherService cron fires at 09:00
   → agentSessionManager.spawn({ soulId: 'fisher2050', task: '9am standup' })

3. agent-session.ts receives soulId
   → getSoulEngine().generateSystemPrompt('fisher2050', '9am standup')
   → Assembles: personality + instructions + goals + relationships + memories
   → Injected into Claude SDK query() as system prompt

4. Fisher2050 runs WITH full soul context
   → Speaks in Fisher's voice, with Fisher's goals, knowing Fisher's relationships
   → FIRST TIME this actually works since wiring gap fix

5. Session ends → Tim Buc triggers
   → Reads session logs, files to Records DB
   → Adds memory to fisher2050 soul:
     "2026-02-21 9am standup: 3 overdue items flagged (SodaWorld auth, M2 git pull, soak test)"

6. Next morning: Fisher2050 spawns again
   → Soul now includes yesterday's memory
   → Fisher2050 can reference what was flagged — CONTINUITY ACHIEVED

7. Eliyahu reads Ziggi's verdicts + session logs weekly
   → Calls GET /api/souls + GET /api/souls/:id/health for all 12 agents
   → Flags any thin/stale/conflicting souls to Fisher2050
   → Fisher2050 schedules enrichment session

8. Mic or an enrichment agent opens soul-enrichment.html
   → Reviews Eliyahu's flagged souls
   → Edits the flagged sections
   → Health scores improve
   → Cycle repeats
```

---

## Part 8: Build Order

### Phase 1 — The Wire (30 min) — PREREQUISITE FOR EVERYTHING

1. Add `soulId?` to `AgentSessionConfig` interface (agent-session.ts line 126)
2. Import `getSoulEngine` in agent-session.ts
3. Wire at lines 499–504: if soulId → generateSystemPrompt → prepend to append
4. Update POST /api/mc/agents in mission-control.ts to accept + pass soulId
5. Test: spawn Fisher2050 with `soulId: 'fisher2050'` — verify soul appears in session

### Phase 2 — Spawn Modal Soul Selector (2 hrs)

6. Add soul dropdown to spawn modal in mission-control.html
7. Fetches GET /api/souls on modal open
8. Passes selected soulId in POST /api/mc/agents body
9. "Spawn as {name}" quick-select buttons for common agents

### Phase 3 — FisherService + Soul (1 hr)

10. Add soulId to each FisherService cron's spawn call
11. Fisher2050 spawns as Fisher2050. Ziggi spawns as Ziggi. Etc.

### Phase 4 — Soul Health Endpoint (2 hrs)

12. Add `GET /api/souls/:id/health` to souls.ts
13. Implement score calculation (8 criteria)
14. Returns breakdown + warnings

### Phase 5 — Soul Enrichment Page (2–3 days)

15. Create `public/soul-enrichment.html`
16. Soul roster grid (12 cards, health score rings, tier grouping)
17. Soul editor form: Identity + Character + Mission (Sections 1–3)
18. Goals section with drag-to-reorder (Section 4)
19. Relationships editor (Section 5)
20. Config section with smart toggle rendering (Section 6)
21. System prompt preview panel (live render via GET /api/souls/:id/prompt)
22. Memory panel: add + view + stats tabs

### Phase 6 — Tim Buc Memory Loop (1 day)

23. After Tim Buc files a session: call POST /api/souls/:id/memories with session summary
24. importance = derived from task type (simple task=5, complex=7, breakthrough=9)
25. Test: run 3 sessions → verify memories accumulate → verify next spawn includes them

### Phase 7 — Cross-Machine Sync + Versioning (1 day)

26. New migration: `soul_versions` table
27. In PUT /api/souls/:id: auto-snapshot + WebSocket broadcast
28. Workers: handle soul:updated event (cache bust)
29. GET /api/souls/:id/versions, POST /api/souls/:id/rollback/:versionId

### Phase 8 — Export/Import (4 hrs)

30. GET /api/souls/:id/export → JSON file download
31. POST /api/souls/import → validate schema → create/overwrite

### Phase 9 — Eliyahu Soul Audit (1 day)

32. Add soul audit to Eliyahu's periodic run
33. Reads all soul health scores + memory stats
34. Cross-references with Records DB for activity vs goals alignment
35. Produces flagged agents list for Fisher2050 to schedule enrichment

---

## Summary

| What | Why | When |
|---|---|---|
| **Wire soulId into spawn** | Nothing else works without this | First |
| **Spawn modal soul selector** | Lets you manually select soul when spawning | After wire |
| **FisherService soulId** | Automated agents get souls | After wire |
| **Soul health endpoint** | Powers health scores in UI | Before UI |
| **soul-enrichment.html** | The actual editor — fix/improve/analyse souls | Phase 5 |
| **Tim Buc memory loop** | Closes continuity — agents remember across sessions | Phase 6 |
| **Cross-machine sync** | M2/M3 get soul updates without restart | Phase 7 |
| **Versioning + rollback** | Safe enrichment — never lose a good soul | Phase 7 |
| **Export/import** | Portability — share souls, clone, back up | Phase 8 |
| **Eliyahu soul audit** | Autonomous soul health monitoring | Phase 9 |

**Total effort (rough):** ~10–12 days of focused work across 9 phases.
**Value delivered by Phase 3 alone (3 hrs):** Every agent spawns with their full personality for the first time.
