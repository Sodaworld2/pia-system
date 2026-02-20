# Dashboard Improvements — Builder Spec
**Status:** Ready to build
**Date written:** 2026-02-20 (Session 26)
**Author:** Eliyahu (intelligence synthesis agent)
**For:** Any builder agent, Coder Machine, or future Claude session

---

## What This Doc Is

A complete, self-contained build spec for 3 targeted improvements to `public/mission-control.html` and the backend. Read the whole thing before touching a file. It has full context, exact file paths, exact code changes, and test criteria.

---

## Background: What We Discovered

On 2026-02-20 a full audit of `public/mission-control.html` (3,499 lines) revealed:

**5 of 6 proposed improvements are ALREADY coded in the HTML.** A previous session already built the CSS, JS functions, and HTML structure. They exist but are not wired to live data. The 6th (Fisher2050 panel) is fully missing.

### What's already fully working (DO NOT rebuild):
- Kill All / Kill Done / Kill Errors buttons — lines 1978-1980 HTML, functions at ~line 2785 JS
- Soul selector in spawn modal — `<select id="soul-select">` at line 1334, `fetchSouls()` at ~line 2730, `onSoulSelect()` at ~line 2751
- Soul names on grid tiles — `getSoulName()` and `formatSoulId()` at ~line 2739, used in `renderGridView()` at ~line 3325
- Git branch badge on grid tiles — `fetchGitBranch()` at ~line 2767, reads `.git/HEAD`, shows on all tiles
- Context % bar CSS — `.ctx-bar`, `.ctx-bar-fill`, `.ctx-label` at lines 1128-1134

### What's broken / incomplete (what this spec fixes):
1. **Context % bar renders 0% for every agent** — backend never returns `contextUsed`/`contextWindow` fields
2. **Soul names NOT shown on machine tile chips** (left panel) — only grid tiles show them
3. **Fisher2050 status panel doesn't exist** — no HTML, no API routes

---

## CHANGE 1: Context % Bar — Wire the Backend

### The Problem
`renderGridView()` already computes and renders the context bar:
```javascript
// From mission-control.html ~line 3334
const ctxUsed = a.contextUsed || 0;
const ctxWin  = a.contextWindow || 0;
const ctxPct  = ctxWin > 0 ? Math.min(100, Math.round((ctxUsed / ctxWin) * 100)) : 0;
const ctxClass = ctxPct >= 90 ? 'ctx-high' : ctxPct >= 70 ? 'ctx-med' : 'ctx-low';
```

But `a.contextUsed` and `a.contextWindow` are ALWAYS 0 because the backend never returns them. See `mission-control.ts` lines 185-201 — `contextUsed` and `contextWindow` are not in the serialized agent object.

### The Fix — 2 files

#### File 1: `src/api/routes/mission-control.ts`

**Find the local agent serialization** (around line 185). It currently looks like:
```typescript
return mgr.getAllSessions().map(s => ({
  id: s.id,
  name: ...,
  task: ...,
  cwd: ...,
  mode: ...,
  status: s.status,
  approvalMode: s.config.approvalMode,
  model: s.config.model || 'claude-opus-4-6',
  cost: s.cost,
  tokensIn: s.tokensIn,
  tokensOut: s.tokensOut,
  toolCalls: s.toolCalls,
  createdAt: s.createdAt,
  errorMessage: s.errorMessage,
  restartCount: s.restartCount,
  hasAllowlist: !!(s.config.allowedTools?.length),
  hasNetworkPolicy: !!(s.config.networkPolicy),
  machineId: s.config.machineId || 'local',
}));
```

**Add these two fields to every agent serialization block** (there are 3 blocks — around lines 185, 248, and the GET /api/mc/agents/:id detail block around line 639):

```typescript
  contextUsed: s.tokensIn,  // tokens consumed so far = context used
  contextWindow: getContextWindowForModel(s.config.model || 'claude-opus-4-6'),
  soulId: (s.config as any).soulId || null,
```

**Add this helper function** near the top of the file (after the imports, before the router):

```typescript
/** Returns the context window size in tokens for a given Claude model ID */
function getContextWindowForModel(model: string): number {
  // All current Claude models (Opus 4.6, Sonnet 4.5, Haiku 4.5) have 200k context
  if (model.includes('haiku')) return 200000;
  if (model.includes('sonnet')) return 200000;
  if (model.includes('opus'))   return 200000;
  return 200000; // safe default for any unknown future model
}
```

**Do this for ALL THREE serialization blocks in the file:**
1. The main `GET /api/mc/agents` local sessions map (~line 185)
2. The second block that handles the combined local+DB list (~line 248)
3. The `GET /api/mc/agents/:id` detail endpoint (~line 639)

For remote/DB agents (from `getAllAgents()`), set `contextUsed: a.tokens_used || 0` and `contextWindow: 200000`.

#### File 2: `public/mission-control.html` — fetchAgents normalization

**Find** the `fetchAgents()` function and the normalization where agent objects are built (~line 1640):
```javascript
soulId: a.soulId || null,
contextUsed: a.contextUsed || a.context_used || 0,
contextWindow: a.contextWindow || a.context_window || 0,
```
This line already exists — it's already written to accept the fields. **No change needed here** — just make the backend send the data and it works automatically.

#### Also fix: `updateGridTileBody()` (~line 3385)

This function handles live streaming updates but currently doesn't render the context bar. Add it:

```javascript
function updateGridTileBody(sessionId) {
  const body = document.getElementById('gridBody-' + sessionId);
  if (!body) return;
  const agent = agents.find(a => a.id === sessionId);
  const lines = (outputBuffers[sessionId] || []).slice(-20);
  let html = '';
  if (agent && agent.task) {
    html += `<div class="gl system" style="color:#64748b;margin-bottom:4px;">${esc(agent.task.substring(0, 100))}</div>`;
  }
  html += lines.map(l => `<div class="gl ${l.type}">${l.type === 'tool' ? '<span style="color:#bc8cff;">' + esc(l.text) + '</span>' : esc(l.text)}</div>`).join('');

  // ADD THIS: context bar (same logic as renderGridView)
  const ctxUsed = agent?.contextUsed || 0;
  const ctxWin  = agent?.contextWindow || 0;
  const ctxPct  = ctxWin > 0 ? Math.min(100, Math.round((ctxUsed / ctxWin) * 100)) : 0;
  if (ctxPct > 0) {
    const ctxClass = ctxPct >= 90 ? 'ctx-high' : ctxPct >= 70 ? 'ctx-med' : 'ctx-low';
    html += `<div class="ctx-bar"><div class="ctx-bar-fill ${ctxClass}" style="width:${ctxPct}%"></div></div>`;
    html += `<div class="ctx-label">${ctxPct}% ctx</div>`;
  }

  body.innerHTML = html;
  body.scrollTop = body.scrollHeight;
}
```

#### Also add to single-agent cost footer

Find `updateCostFooter()` (~line 2152) and add a context % display:

```javascript
function updateCostFooter(agent) {
  document.getElementById('costSession').textContent = '$' + (agent.cost || 0).toFixed(2);
  document.getElementById('costIn').textContent = ...;
  document.getElementById('costOut').textContent = ...;
  document.getElementById('costTools').textContent = agent.toolCalls || 0;
  const elapsed = agent.createdAt ? Math.floor((Date.now() - agent.createdAt) / 60000) : 0;
  document.getElementById('costDuration').textContent = elapsed + 'm';

  // ADD THIS: context % in cost footer
  const ctxUsed = agent.contextUsed || 0;
  const ctxWin  = agent.contextWindow || 0;
  const ctxPct  = ctxWin > 0 ? Math.min(100, Math.round((ctxUsed / ctxWin) * 100)) : 0;
  const ctxEl = document.getElementById('costContext');
  if (ctxEl) {
    ctxEl.textContent = ctxPct > 0 ? ctxPct + '% ctx' : '';
    ctxEl.style.color = ctxPct >= 90 ? '#ef4444' : ctxPct >= 70 ? '#f59e0b' : '#64748b';
  }
}
```

And in the HTML, find the cost tracker `<div class="cost-tracker">` and add:
```html
<div class="cost-item"><span class="cost-value" id="costContext" style="color:#64748b;"></span></div>
```

### Test Criteria for Change 1
- Spawn an agent and let it run for a few turns
- In grid view: a thin coloured bar appears at the bottom of the agent tile
- Bar is green when context is low (<70%), yellow 70-90%, red >90%
- In single view: cost footer shows e.g. "12% ctx" next to duration

---

## CHANGE 2: Soul Names on Machine Tile Chips (Left Panel)

### The Problem
`renderMachines()` (~line 1949) renders agent chips like this:
```javascript
${mAgents.map(a => `<span class="agent-chip ${a.status}">${esc(a.name)}: ${a.status}</span>`).join('')}
```
`a.name` is the truncated session ID (first 8 chars of UUID like "abc12345"). Soul names are not shown here even though they're shown in grid tiles.

### The Fix — 1 line in `public/mission-control.html`

Find `renderMachines()`. Find the agent chips line. Replace:
```javascript
${mAgents.map(a => `<span class="agent-chip ${a.status}">${esc(a.name)}: ${a.status}</span>`).join('')}
```
With:
```javascript
${mAgents.map(a => {
  const displayName = a.soulId ? getSoulName(a.soulId) : (a.name || a.id.substring(0, 8));
  return `<span class="agent-chip ${a.status}" title="${esc(a.id)}">${esc(displayName)}: ${a.status}</span>`;
}).join('')}
```

### Test Criteria for Change 2
- Spawn an agent with soul "farcake" selected
- In the left panel machine tile, the agent chip should say "Farcake: working" not "abc12345: working"
- `title` attribute still shows the full ID on hover for debugging

---

## CHANGE 3: Fisher2050 Status Panel

### The Problem
`FisherService` is running 4 cron jobs inside the main PIA process (built in Session 21). But there is ZERO visibility on whether it's running, when it last fired, or how to trigger it manually. This is a black box.

### What to build

#### Part A: New API file `src/api/routes/fisher.ts`

Create this file:

```typescript
/**
 * Fisher2050 Service Routes
 * Status and manual trigger endpoints for FisherService
 */
import { Router, Request, Response } from 'express';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('FisherAPI');

/**
 * GET /api/fisher/status
 * Returns current FisherService cron state
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { getFisherService } = await import('../../services/fisher-service.js');
    const svc = getFisherService();
    if (!svc) {
      res.json({ running: false, message: 'FisherService not initialized' });
      return;
    }
    res.json(svc.getStatus());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/fisher/run
 * Manually trigger Fisher2050 standup
 */
router.post('/run', async (req: Request, res: Response): Promise<void> => {
  try {
    const { getFisherService } = await import('../../services/fisher-service.js');
    const svc = getFisherService();
    if (!svc) {
      res.status(503).json({ error: 'FisherService not initialized' });
      return;
    }
    const { type = 'standup' } = req.body;
    const taskId = await svc.runOnDemand(
      type === 'summary' ? 'Run your evening summary now.' :
      type === 'ziggi'   ? 'Run a quality audit now as Ziggi.' :
      'Run your morning standup now.'
    );
    logger.info(`Fisher2050 manual trigger: ${type} -> task ${taskId}`);
    res.json({ success: true, taskId, type });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
```

#### Part B: Wire the route in `src/index.ts`

Find where other routes are registered (look for `app.use('/api/mc'`, `app.use('/api/souls'`, etc). Add:
```typescript
const { default: fisherRouter } = await import('./api/routes/fisher.js');
app.use('/api/fisher', fisherRouter);
```

#### Part C: Add `getStatus()` method to `src/services/fisher-service.ts`

Find the `FisherService` class. Add this method:

```typescript
getStatus(): {
  running: boolean;
  lastStandup: number | null;
  lastSummary: number | null;
  lastZiggi: number | null;
  lastEliyahu: number | null;
  nextStandup: string;
  nextSummary: string;
} {
  const now = new Date();
  const nextWeekday = (hour: number): string => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    // Skip to Monday if weekend
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.toLocaleString();
  };
  return {
    running: this.jobs.length > 0,
    lastStandup: this.lastStandup,
    lastSummary: this.lastSummary,
    lastZiggi: this.lastZiggi,
    lastEliyahu: this.lastEliyahu,
    nextStandup: nextWeekday(9),
    nextSummary: nextWeekday(18),
  };
}
```

And add private tracking fields to the class (at the top, with the other class fields):
```typescript
private lastStandup: number | null = null;
private lastSummary: number | null = null;
private lastZiggi: number | null = null;
private lastEliyahu: number | null = null;
```

Update each cron job callback to set these timestamps:
```typescript
// In the 9am cron:
this.lastStandup = Date.now();

// In the 6pm cron:
this.lastSummary = Date.now();

// In the 2am cron:
this.lastZiggi = Date.now();

// In the 6am cron:
this.lastEliyahu = Date.now();
```

#### Part D: Fisher2050 panel in `public/mission-control.html`

Find the left panel HTML. Currently it has:
1. `<div class="panel-header">Machines</div>`
2. `<div class="machine-list" id="machineList"></div>`
3. Browser Controller Panel (collapsible, at the bottom)

**Add this collapsible panel between the machine list and the browser controller panel:**

```html
<!-- Fisher2050 Service Panel -->
<div id="fisherPanel" style="border-top:1px solid #1a1a2a;">
  <div onclick="toggleFisherPanel()" style="padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">
    <span>Fisher2050</span>
    <div style="display:flex;align-items:center;gap:6px;">
      <span id="fisherDot" style="width:8px;height:8px;border-radius:50%;background:#484f58;display:inline-block;"></span>
    </div>
  </div>
  <div id="fisherBody" style="display:none;padding:8px 12px;font-size:11px;">
    <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#64748b;">Last standup</span>
        <span id="fisherLastStandup" style="color:#e2e8f0;">—</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#64748b;">Last summary</span>
        <span id="fisherLastSummary" style="color:#e2e8f0;">—</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#64748b;">Next standup</span>
        <span id="fisherNextStandup" style="color:#3fb950;font-size:10px;">—</span>
      </div>
    </div>
    <div style="display:flex;gap:6px;">
      <button onclick="fisherRunStandup()" style="flex:1;padding:4px 8px;border:1px solid #9b4dca;border-radius:4px;background:#1a0d2a;color:#bc8cff;font-size:10px;font-weight:700;cursor:pointer;">Standup</button>
      <button onclick="fisherRunSummary()" style="flex:1;padding:4px 8px;border:1px solid #2a2a3a;border-radius:4px;background:#0f0f18;color:#8b949e;font-size:10px;cursor:pointer;">Summary</button>
      <button onclick="fisherRunZiggi()" style="flex:1;padding:4px 8px;border:1px solid #d29922;border-radius:4px;background:#2a1f0f;color:#d29922;font-size:10px;cursor:pointer;">Ziggi</button>
    </div>
  </div>
</div>
```

**Add these JS functions** (anywhere in the script block, e.g. near the browser controller functions):

```javascript
// ── FISHER2050 SERVICE PANEL ──
let fisherPanelOpen = false;

function toggleFisherPanel() {
  fisherPanelOpen = !fisherPanelOpen;
  document.getElementById('fisherBody').style.display = fisherPanelOpen ? 'block' : 'none';
  if (fisherPanelOpen) fetchFisherStatus();
}

async function fetchFisherStatus() {
  try {
    const data = await api('/api/fisher/status');
    const dot = document.getElementById('fisherDot');
    if (dot) dot.style.background = data.running ? '#3fb950' : '#484f58';

    const fmt = ts => ts ? new Date(ts).toLocaleTimeString() : '—';
    const el = id => document.getElementById(id);

    if (el('fisherLastStandup'))  el('fisherLastStandup').textContent  = fmt(data.lastStandup);
    if (el('fisherLastSummary'))  el('fisherLastSummary').textContent  = fmt(data.lastSummary);
    if (el('fisherNextStandup'))  el('fisherNextStandup').textContent  = data.nextStandup || '—';
  } catch (e) {
    // Fisher not available (worker mode / not hub) — hide the panel
    const panel = document.getElementById('fisherPanel');
    if (panel) panel.style.display = 'none';
  }
}

async function fisherRunStandup() {
  try {
    await api('/api/fisher/run', { method: 'POST', body: { type: 'standup' } });
    showToast('Fisher2050 standup triggered');
    setTimeout(fetchFisherStatus, 1000);
  } catch (e) { showToast('Fisher run failed: ' + e.message); }
}

async function fisherRunSummary() {
  try {
    await api('/api/fisher/run', { method: 'POST', body: { type: 'summary' } });
    showToast('Fisher2050 summary triggered');
  } catch (e) { showToast('Fisher run failed: ' + e.message); }
}

async function fisherRunZiggi() {
  try {
    await api('/api/fisher/run', { method: 'POST', body: { type: 'ziggi' } });
    showToast('Ziggi quality audit triggered');
  } catch (e) { showToast('Fisher run failed: ' + e.message); }
}
```

**Also call `fetchFisherStatus()` on page init** — find the `window.addEventListener('DOMContentLoaded', ...)` block (near bottom of JS) and add:
```javascript
fetchFisherStatus(); // Check Fisher2050 service on load
```

### Test Criteria for Change 3
- Left panel shows a "FISHER2050" collapsible section below the machine list
- Clicking it expands to show last standup time, next standup time, 3 buttons
- On worker machines (`IS_HUB=false`): the panel hides itself (Fisher only runs on hub)
- "Standup" button triggers Fisher and shows a toast
- After triggering, "last standup" time updates

---

## TypeScript Check

After all changes, run:
```bash
npx tsc --noEmit --skipLibCheck
```
Expected: zero errors (excluding `dao-foundation-files/`).

---

## File Summary

| File | Change Type | What |
|---|---|---|
| `src/api/routes/mission-control.ts` | MODIFY | Add `contextUsed`, `contextWindow`, `soulId` to 3 agent serialization blocks + helper function |
| `src/services/fisher-service.ts` | MODIFY | Add `getStatus()` method + 4 timestamp fields |
| `src/api/routes/fisher.ts` | NEW | `GET /api/fisher/status` + `POST /api/fisher/run` |
| `src/index.ts` | MODIFY | Register `/api/fisher` route |
| `public/mission-control.html` | MODIFY | 4 changes: (a) `updateGridTileBody()` ctx bar, (b) cost footer ctx %, (c) machine chip soul names, (d) Fisher2050 panel HTML + JS |

---

## Context: Why These 3 Specifically

This was Eliyahu's synthesis recommendation after reading all 25 sessions (Feb 20) and auditing the full dashboard codebase. The full briefing is in `SESSION_JOURNAL_2026-02-20.md` Session 26.

Key reason these are prioritized:

1. **Context % bar** — Identified as priority #1 in Sessions 2 and 3 by Marc Nuri research and Context7 SDK docs. An agent at 95% context is about to collapse. Right now there is no way to see this in the dashboard. This is a safety feature.

2. **Soul names on machine chips** — Sessions 21 and 22 produced FisherService and 12 soul files. Every agent spawned with a soul shows up in the left panel with a meaningless UUID fragment. Usability fix.

3. **Fisher2050 panel** — Fisher is the heartbeat of the entire scheduled agent system. It runs 4 crons silently. Zero visibility. The "Run Now" button is particularly important for testing and for when Mic wants to manually trigger a standup without waiting for 9am.

---

## What NOT To Build In This Session

These are deferred per V1_DEFINITION.md:
- `agent_messages` table — separate spec in `research/ELIYAHU_END_OF_DAY_SPEC.md`
- Google Calendar integration — deferred to v2.0 per `V1_DEFINITION.md`
- Terminal output relay M2→M1 — architecture gap, not a UI fix, separate work item
- RAG layer for Eliyahu — deferred to v2.0 per `V1_DEFINITION.md`

Do not let scope expand. These 3 changes are the full scope.
