# PIA System Analysis: How It Works, What's Broken, How to Fix It
**Date:** February 13, 2026
**Author:** Claude Opus 4.6 (Machine #1 Agent)

---

## Part 1: How the System Works Today

### Current Architecture
```
YOU (mic) <-> Claude Code CLI <-> PIA VISOR (localhost:3000)
                  |                       |
                  |                       +-> Machine #3 (100.102.217.69:3000)
                  |                             |-> PTY Sessions (PowerShell/Bash)
                  |                             |-> DAO Backend (port 5003)
                  |                             +-> SQLite DB
                  |
                  +-> Permission Prompt (EVERY action)
                        |-> "Allow Bash: curl ...?" [y/n]
                        |-> "Allow Write: file.ts?" [y/n]
                        |-> "Allow Edit: component.tsx?" [y/n]
```

### The Permission Bottleneck Problem
Every single tool call requires your manual approval:
- `curl` to send commands to Machine #3 PTY -> **needs approval**
- `curl` to read PTY output -> **needs approval**
- Writing files locally -> **needs approval**
- Running Node.js scripts -> **needs approval**

For a single "deploy and test" operation that takes 5 automated steps, you need to click approve **5+ times**. For a full build cycle (write code, transfer, build, test, fix, re-test), that's **15-30 approvals**.

This defeats the purpose of autonomous multi-machine orchestration.

---

## Part 2: Options to Overcome the Permission Bottleneck

### Option A: Claude Code Permission Settings (Quick Win)

**How it works:** Claude Code has a settings file where you can pre-approve specific tool patterns.

**Implementation:**
```json
// ~/.claude/settings.json
{
  "permissions": {
    "allow": [
      "Bash(curl*100.102.217.69*)",
      "Bash(node*)",
      "Bash(npm*)",
      "Bash(npx*)",
      "Write(**/pia-system/**)",
      "Edit(**/pia-system/**)",
      "Read(**)"
    ]
  }
}
```

Or use `--dangerously-skip-permissions` flag when launching Claude Code:
```bash
claude --dangerously-skip-permissions
```

**Pros:**
- Zero code to write
- Works right now
- Stays within Claude Code ecosystem

**Cons:**
- The `--dangerously-skip-permissions` is all-or-nothing (no granular control)
- Pattern-based permissions can be too broad or too narrow
- Still bound to Claude Code CLI (must have it running)
- No structured reporting back to PIA dashboard
- Claude Code context window limits still apply (we hit them twice already)

**Effort:** 5 minutes
**Risk:** Medium (over-permissive could allow unintended actions)

---

### Option B: Claude API Orchestrator (Recommended - Task #35)

**How it works:** Build a thin Node.js service that calls the Claude API directly with custom tool definitions. No permission prompts because YOU define what tools are available and what safety guardrails exist.

**Architecture:**
```
PIA VISOR Dashboard
    |
    +-> "Deploy test fixes to Machine #3"
           |
           v
    Orchestrator Service (Node.js)
    |-- Anthropic SDK (@anthropic-ai/sdk)
    |-- Tool Definitions:
    |     |-- pty_send(sessionId, command)     -> sends to remote PTY
    |     |-- pty_read(sessionId)              -> reads PTY output
    |     |-- write_file(machine, path, content) -> writes file on any machine
    |     |-- read_file(machine, path)          -> reads file from any machine
    |     |-- run_command(machine, command)      -> exec command, return output
    |     |-- browse(url)                        -> screenshot + analysis
    |     +-- report_progress(status, message)   -> updates dashboard
    |
    |-- Safety Guardrails (in code, not prompts):
    |     |-- Path restrictions (no writing to system dirs)
    |     |-- Command blocklist (no rm -rf, no force push)
    |     |-- Budget limits ($X per session)
    |     |-- Rollback capability (git stash before changes)
    |     +-- Audit log (every action recorded)
    |
    +-- Cost Tracker
          |-- Input/output token counting
          +-- Per-session spending cap
```

**Example flow (no human approval needed):**
```
1. User clicks "Fix Tests" in PIA VISOR
2. Dashboard sends POST /api/orchestrator/task
   Body: { task: "Fix the 2 failing test files on Machine #3" }
3. Orchestrator calls Claude API with tool definitions
4. Claude decides: "I need to read the route files first"
   -> tool_use: read_file(machine3, "backend/src/routes/proposals.ts")
5. Orchestrator executes tool, returns result to Claude
6. Claude decides: "Now I need to write the fixed test"
   -> tool_use: write_file(machine3, "backend/src/routes/proposals.test.ts", content)
7. Orchestrator writes file (via PTY or direct API), returns success
8. Claude decides: "Run the tests"
   -> tool_use: run_command(machine3, "npx vitest run ...")
9. Orchestrator runs command, returns output
10. Claude sees "5 passed" -> tool_use: report_progress("completed", "All 5 tests passing")
11. Dashboard updates with green status
```

**Minimal implementation (~200 lines):**
```typescript
// orchestrator.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools = [
  {
    name: 'pty_send',
    description: 'Send a command to a PTY session on a remote machine',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        command: { type: 'string' },
        machineIp: { type: 'string', default: '100.102.217.69' }
      },
      required: ['sessionId', 'command']
    }
  },
  {
    name: 'pty_read',
    description: 'Read the output buffer of a PTY session',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        machineIp: { type: 'string', default: '100.102.217.69' },
        lastN: { type: 'number', default: 30 }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'write_file',
    description: 'Write a file to a remote machine via its API',
    input_schema: {
      type: 'object',
      properties: {
        machineIp: { type: 'string' },
        filePath: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['machineIp', 'filePath', 'content']
    }
  },
  {
    name: 'report_progress',
    description: 'Report progress back to the PIA dashboard',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['working', 'completed', 'failed'] },
        message: { type: 'string' }
      },
      required: ['status', 'message']
    }
  }
];

async function executeTask(taskDescription: string) {
  const messages = [{ role: 'user', content: taskDescription }];

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',  // fast + capable
      max_tokens: 4096,
      tools,
      messages,
      system: `You are a PIA orchestrator agent. Execute tasks on remote machines
               via PTY sessions. Machine #3 IP: 100.102.217.69.
               DAO project is at C:/Users/User/Documents/GitHub/DAOV1.`
    });

    // If no tool use, we're done
    if (response.stop_reason === 'end_of_turn') {
      return response.content;
    }

    // Execute each tool call
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const result = await executeTool(block.name, block.input);
        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: block.id, content: result }]
        });
      }
    }
  }
}
```

**Pros:**
- Full autonomy - zero permission prompts
- Custom safety guardrails YOU control
- Reports progress to PIA dashboard in real-time
- No context window limits (fresh context per task)
- Can use cheaper models (Sonnet) for routine tasks, Opus for complex ones
- Cost tracking built-in
- Works from any machine (not tied to Claude Code CLI)

**Cons:**
- Need to build it (~2-4 hours for v1)
- Need to handle API costs (but with budget caps)
- Need to add `POST /api/files/write` endpoint to Machine #3 PIA (for direct file writes)
- Debugging is harder (no interactive CLI)

**Effort:** 2-4 hours for v1
**Risk:** Low (safety guardrails are in YOUR code)

---

### Option C: MCP-Based Agent Protocol

**How it works:** Register PIA itself as an MCP server that Claude Code connects to. The MCP server exposes high-level tools like `pty_execute`, `deploy_file`, `run_tests` that handle the multi-step operations internally.

**Implementation:**
```json
// .mcp.json on Machine #1
{
  "pia-agent": {
    "type": "http",
    "url": "http://localhost:3000/mcp",
    "tools": [
      "pty_execute",
      "deploy_file",
      "run_tests",
      "machine_status"
    ]
  }
}
```

The MCP server handles the complexity:
- `pty_execute(machine, command)` -> sends to PTY, waits for output, returns clean result
- `deploy_file(machine, path, content)` -> handles base64 encoding, transfer, verification
- `run_tests(machine, testPattern)` -> runs tests, parses output, returns pass/fail

**Pros:**
- Stays within Claude Code ecosystem
- MCP is a standard protocol with growing support
- High-level tools reduce the number of permission prompts (1 instead of 5)
- Tools can be auto-approved in Claude Code settings

**Cons:**
- Still need Claude Code running
- MCP tools still need initial approval (unless auto-approved)
- More complex to build than Option B
- MCP protocol has limitations (no streaming, no long-running tasks)

**Effort:** 4-6 hours
**Risk:** Low

---

### Option D: Hooks-Based Auto-Approval

**How it works:** Use Claude Code's hook system to auto-approve tool calls that match safe patterns.

**Implementation:**
```javascript
// .claude/hooks/pre-tool-use.cjs
module.exports = async ({ tool, input }) => {
  // Auto-approve curl to our machines
  if (tool === 'Bash' && input.command?.includes('100.102.217.69')) {
    return { decision: 'approve' };
  }
  // Auto-approve file writes to our project
  if (tool === 'Write' && input.file_path?.includes('pia-system')) {
    return { decision: 'approve' };
  }
  // Everything else needs manual approval
  return { decision: 'ask' };
};
```

**Pros:**
- Simple to implement
- Fine-grained control per tool + argument pattern
- Stays within Claude Code

**Cons:**
- Hooks may not support pre-approval (depends on Claude Code version)
- Pattern matching can have gaps
- Still tied to Claude Code CLI

**Effort:** 30 minutes
**Risk:** Medium

---

### Option E: Hybrid Approach (Best of Both Worlds)

**Phase 1 (Today):** Use Option A (Claude Code permissions) for immediate relief
**Phase 2 (This week):** Build Option B (API Orchestrator) for autonomous task execution
**Phase 3 (Future):** Option C (MCP server) for when Claude Code supports it natively

The orchestrator (Option B) would be triggered from the PIA VISOR dashboard:
```
[PIA Dashboard] -> "Run Task" button -> POST /api/orchestrator/run
                                          |
                                          v
                                    Orchestrator picks up task
                                    Claude API loop (no permissions)
                                    Reports back to dashboard
                                    Dashboard shows real-time progress
```

---

## Part 3: Comparison Matrix

| Criteria | A: Settings | B: API Orchestrator | C: MCP Server | D: Hooks |
|----------|-------------|---------------------|---------------|----------|
| Build effort | 5 min | 2-4 hrs | 4-6 hrs | 30 min |
| Autonomy level | Medium | Full | High | Medium |
| Safety control | Low | High | Medium | Medium |
| Dashboard integration | No | Yes | Partial | No |
| Cost tracking | No | Yes | No | No |
| Context limits | Yes | No | Yes | Yes |
| Multi-model support | No | Yes | No | No |

---

## Part 4: Other System Improvements

### File Transfer API
**Current:** 3-step base64 dance through PTY
**Proposed:** Direct REST API endpoint on each machine

```typescript
// Add to Machine #3 PIA server
router.post('/api/files/write', (req, res) => {
  const { path, content, encoding } = req.body;
  // Safety: validate path is within allowed directories
  fs.writeFileSync(path, content, encoding || 'utf8');
  res.json({ success: true, size: content.length });
});

router.get('/api/files/read', (req, res) => {
  const { path } = req.query;
  const content = fs.readFileSync(path, 'utf8');
  res.json({ content, size: content.length });
});
```

### Clean Command Execution API
**Current:** PTY with ANSI escape codes, VT100 sequences
**Proposed:** Clean exec endpoint for scripted operations

```typescript
router.post('/api/exec', async (req, res) => {
  const { command, cwd, timeout } = req.body;
  const { stdout, stderr, exitCode } = await exec(command, { cwd, timeout });
  res.json({ stdout, stderr, exitCode, timestamp: new Date() });
});
```

### PTY Output Cleaning
**Current:** Raw buffer with `[?25l`, `[93m`, `[37m` escape codes
**Proposed:** Server-side ANSI stripping

```typescript
router.get('/api/sessions/:id/clean', (req, res) => {
  const session = getSession(req.params.id);
  const clean = stripAnsi(session.buffer);
  res.json({ output: clean, lines: clean.split('\n') });
});
```

---

## Part 5: Recommendation

**For your use case, I recommend building the Claude API Orchestrator (Option B).**

Reasons:
1. You're already doing multi-machine operations that need 15-30 approvals per cycle
2. The PIA VISOR dashboard is the natural place to trigger and monitor tasks
3. You want cost control (per-session budgets with cheaper models for routine work)
4. You need context continuity (our conversations keep hitting context limits)
5. Safety guardrails in code are more reliable than pattern-matching permissions

The orchestrator turns PIA from a "dashboard you watch while Claude Code works" into a "command center where you dispatch tasks and they execute autonomously."

**Estimated build time for v1:** 2-4 hours
**Model cost per task:** ~$0.05-0.50 depending on complexity (Sonnet for routine, Opus for complex)

---

## Part 6: Future Builds & System Improvement Roadmap

### Phase 1: Foundation (This Week)
**Goal:** Remove bottlenecks, make the system self-operating

#### 1.1 Claude API Orchestrator v1
- **What:** Node.js service that calls Claude API with custom tools (pty_send, pty_read, write_file, run_command)
- **Why:** Eliminates the 15-30 permission approvals per build cycle
- **How:** ~200 lines of TypeScript using `@anthropic-ai/sdk`, integrated into PIA VISOR as `/api/orchestrator/run`
- **Deliverable:** "Run Task" button on dashboard that dispatches work autonomously

#### 1.2 File Transfer API
- **What:** `POST /api/files/write` and `GET /api/files/read` endpoints on every machine
- **Why:** Current 3-step base64 PTY dance is fragile and slow
- **How:** Simple Express routes with path validation (restrict to project dirs)
- **Deliverable:** `curl -X POST machine:3000/api/files/write -d '{"path":"...","content":"..."}'`

#### 1.3 Clean Exec API
- **What:** `POST /api/exec` endpoint that runs commands and returns clean stdout/stderr
- **Why:** PTY output has ANSI escape codes that break parsing
- **How:** Node.js `child_process.exec()` wrapper with timeout and cwd support
- **Deliverable:** Clean JSON responses: `{ stdout, stderr, exitCode }`

---

### Phase 2: Intelligence Layer (Next 2 Weeks)
**Goal:** Make PIA smart enough to self-heal and self-improve

#### 2.1 Task Queue with Priority & Dependencies
- **What:** SQLite-backed task queue with priorities, dependencies, and retry logic
- **Why:** Currently tasks are ad-hoc; no way to queue work or handle failures automatically
- **How:**
  ```
  tasks table: id, title, priority, status, depends_on, assigned_machine, retry_count
  orchestrator polls for next available task
  failed tasks retry with exponential backoff
  ```
- **Deliverable:** Task queue UI in PIA dashboard, auto-retry on failure

#### 2.2 Agent Memory & Context Persistence
- **What:** Persistent memory store for agent sessions (what was done, what worked, what failed)
- **Why:** Every new Claude Code session starts fresh - we lose all context from previous sessions (we've hit context limits twice already)
- **How:**
  ```
  memories table: id, session_id, category, content, embeddings
  Categories: "file_structure", "patterns_learned", "errors_encountered", "decisions_made"
  On new session: load relevant memories as system prompt context
  ```
- **Deliverable:** Agents remember past work, don't repeat mistakes, resume where they left off

#### 2.3 Multi-Model Task Routing
- **What:** Intelligent routing of tasks to the cheapest capable model
- **Why:** Not every task needs Opus ($15/M input). Many tasks can use Sonnet ($3/M) or Haiku ($0.25/M)
- **How:**
  ```
  Task complexity analysis:
  - Simple file edits, formatting -> Haiku ($0.25/M tokens)
  - Code generation, testing -> Sonnet ($3/M tokens)
  - Architecture, complex debugging -> Opus ($15/M tokens)

  Auto-escalation: if Haiku/Sonnet fails, retry with next model up
  ```
- **Deliverable:** 60-80% cost reduction on routine operations

#### 2.4 Auto-Healer v2
- **What:** Proactive health monitoring with automatic remediation
- **Why:** Current auto-healer is basic; needs to handle common failure patterns
- **How:**
  ```
  Monitor:
  - Server health (port 5003 responding?)
  - Build status (TypeScript compiling?)
  - Test status (all tests passing?)
  - Disk space, memory usage

  Auto-remediate:
  - Server down -> restart via PTY
  - Build fails -> analyze error, apply fix
  - Tests fail -> run fix cycle
  - Disk full -> clean node_modules cache
  ```
- **Deliverable:** Self-healing system that stays green without human intervention

---

### Phase 3: Wireframe Features (Weeks 3-4)
**Goal:** Build the missing features from the wireframe spec

#### 3.1 Security Tab
- **What:** IP tracking, security events, block/allow lists
- **Why:** Wireframe spec has this as a core tab, currently not implemented
- **How:**
  ```
  Backend:
  - Track all incoming IPs with geolocation
  - Event categorization (login, API call, suspicious)
  - Block/allow list management
  - Rate limiting per IP

  Frontend:
  - IP table with country flags, last seen, request count
  - Event timeline with severity coloring
  - Block/allow toggle per IP
  - Geo map visualization (optional)
  ```
- **Deliverable:** Security tab matching wireframe spec

#### 3.2 Network Topology Map
- **What:** Visual map of machine-to-machine communication
- **Why:** Wireframe shows this as a key visualization
- **How:**
  ```
  - D3.js or vis.js force-directed graph
  - Nodes = machines, edges = communication channels
  - Real-time updates (which machines are talking)
  - Click node to see machine details
  - Color coding: green=healthy, yellow=degraded, red=offline
  ```
- **Deliverable:** Interactive network topology in PIA VISOR

#### 3.3 Health Dashboard Expansion
- **What:** 6-card layout with CPU, Memory, Disk, Network, Uptime, Processes
- **Why:** Current health tab is minimal; wireframe shows rich health cards
- **How:**
  ```
  Backend:
  - POST /api/machines/:id/metrics (push model from each machine)
  - Metrics: cpu_percent, memory_used, memory_total, disk_used,
             disk_total, network_in, network_out, uptime, process_count

  Frontend:
  - 6 cards with sparkline graphs (last 1 hour)
  - Alert thresholds (red when CPU > 90%, disk > 85%)
  - Historical data (click card to see 24h graph)
  ```
- **Deliverable:** Rich health dashboard matching wireframe spec

#### 3.4 Chat Sidebar
- **What:** Machine-to-machine and user-to-machine messaging
- **Why:** Wireframe shows chat as a core feature
- **How:**
  ```
  Backend:
  - WebSocket or SSE for real-time messages
  - Messages table: id, from_machine, to_machine, content, timestamp
  - Channel support (broadcast, direct, group)

  Frontend:
  - Sidebar with machine list (online/offline indicators)
  - Message thread per machine
  - Agent activity stream (what agents are doing right now)
  ```
- **Deliverable:** Chat sidebar matching wireframe spec

---

### Phase 4: Advanced Capabilities (Month 2)
**Goal:** Transform PIA from a dashboard into an autonomous development platform

#### 4.1 CI/CD Pipeline Integration
- **What:** Git-triggered build/test/deploy pipelines
- **Why:** Currently all builds are manual via PTY; need automated pipelines
- **How:**
  ```
  - Git webhook listener (POST /api/webhooks/git)
  - Pipeline definitions (YAML or JSON):
    stages:
      - name: build
        command: npm run build
        machine: machine-3
      - name: test
        command: npx vitest run
        machine: machine-3
      - name: deploy
        command: pm2 restart dao
        machine: machine-3
        requires: [build, test]

  - Pipeline dashboard in PIA VISOR
  - Status badges per stage (pending, running, passed, failed)
  ```
- **Deliverable:** Push-to-deploy pipelines

#### 4.2 Multi-Agent Collaboration
- **What:** Multiple AI agents working on different tasks simultaneously across machines
- **Why:** Currently one agent works sequentially; parallel agents would be faster
- **How:**
  ```
  Agent roles:
  - Coder: writes code (Machine #3)
  - Tester: runs tests and reports (Machine #3)
  - Reviewer: reviews code quality (Machine #1)
  - Deployer: handles deployment (Machine #3)
  - Monitor: watches for issues (Machine #1)

  Coordination:
  - Agent bus (already partially built) for inter-agent messaging
  - Task dependencies prevent conflicts
  - Lock system for file access (prevent two agents editing same file)
  ```
- **Deliverable:** Parallel agent execution with coordination

#### 4.3 Knowledge Base & Documentation Generator
- **What:** Auto-generated docs from code analysis, API specs, architecture diagrams
- **Why:** Documentation is always stale; AI can keep it current
- **How:**
  ```
  - Analyze codebase structure, routes, types
  - Generate OpenAPI spec from Express routes
  - Generate architecture diagrams (Mermaid)
  - Generate README sections
  - Auto-update on every commit (via CI/CD pipeline)
  ```
- **Deliverable:** Living documentation that stays in sync with code

#### 4.4 Cost Dashboard & Budget Management
- **What:** Real-time AI spending tracker with budget alerts
- **Why:** API costs can spiral without visibility
- **How:**
  ```
  Track per-request:
  - Model used, input/output tokens, cost
  - Which task/agent triggered it
  - Success/failure (failed calls still cost money)

  Dashboard:
  - Daily/weekly/monthly spending charts
  - Per-model breakdown
  - Per-task cost attribution
  - Budget alerts (email/webhook when 80% of budget used)
  - Auto-pause when budget exceeded
  ```
- **Deliverable:** Cost control dashboard in PIA VISOR

---

### Phase 5: Production Readiness (Month 3+)
**Goal:** Make PIA deployable as a product

#### 5.1 Authentication & Multi-User
- **What:** User accounts, API keys, role-based access
- **Why:** Currently anyone on the Tailscale network can access everything
- **How:** JWT auth, user table, role system (admin, developer, viewer)

#### 5.2 Audit Trail
- **What:** Complete log of every action taken by humans and agents
- **Why:** Need accountability for what changed, when, and by whom
- **How:** Event sourcing pattern - every action is an immutable event

#### 5.3 Disaster Recovery
- **What:** Automated backups, restore procedures, failover
- **Why:** Single machine failure shouldn't lose data
- **How:** Scheduled SQLite backups, git snapshots, machine health failover

#### 5.4 Plugin System
- **What:** Allow third-party extensions to PIA
- **Why:** Different teams need different tools
- **How:** Plugin API with hooks, routes, and UI panels

---

## Part 7: What Would PIA Look Like in 6 Months?

```
PIA v2.0 - The Autonomous Development Platform

Developer (you):
  "Build a new API endpoint for user profiles with tests and documentation"

PIA:
  1. Creates task in queue with subtasks:
     - [ ] Design API schema (Claude Haiku - $0.01)
     - [ ] Write route handler (Claude Sonnet - $0.15)
     - [ ] Write tests (Claude Sonnet - $0.10)
     - [ ] Run tests (Machine #3 - free)
     - [ ] Generate API docs (Claude Haiku - $0.01)
     - [ ] Code review (Claude Opus - $0.25)
     - [ ] Deploy to staging (Machine #3 - free)

  2. Dispatches agents across machines:
     - Coder agent writes handler and tests on Machine #3
     - Tester agent runs tests, reports results
     - Reviewer agent checks quality, suggests improvements
     - Deployer agent deploys to staging

  3. Reports back in 5-10 minutes:
     "Done. New /api/users/:id endpoint deployed to staging.
      5 tests passing. API docs updated. Total cost: $0.52"

  4. You review the PR, click merge.
```

No permission prompts. No context window limits. No 3-step base64 file transfers. Just describe what you want and PIA builds it.

---

*Analysis by Claude Opus 4.6 | Machine #1 (hub/izzit7) | February 13, 2026*
