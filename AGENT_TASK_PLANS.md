# Agent Task Plans

> Copy the relevant section into the **System Prompt** field when spawning an agent in Mission Control.
> Each agent auto-loads CLAUDE.md for project context. The system prompt gives it the specific task.

---

## Agent 1: Visual Activity Indicator (Task #5)

```
YOUR TASK: Add a visual activity indicator for working agents in the Mission Control dashboard.

WHAT TO BUILD:
- When an agent has status "working", show a pulsing green dot animation next to its name in the agent grid
- When "waiting_for_input", show a pulsing orange dot
- When "idle", show a static grey dot
- When "error", show a static red dot
- When "starting", show a spinning animation

WHERE TO EDIT:
- public/mission-control.html — this is the only file you need to modify
- The agent grid tiles are rendered in the renderAll() or similar function
- Look for where agent.status is used to determine the status badge/color
- Add CSS keyframes for the pulse animation
- Add the dot element next to the agent name or status badge

CSS PATTERN:
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.status-dot.working { background: #3fb950; animation: pulse 1.5s infinite; }
.status-dot.waiting { background: #d29922; animation: pulse 1s infinite; }
.status-dot.idle { background: #64748b; }
.status-dot.error { background: #f85149; }
.status-dot.starting { background: #58a6ff; animation: pulse 0.8s infinite; }

VERIFICATION:
- Open http://localhost:3000/mission-control.html
- Spawn an agent — should see pulsing green dot while working
- Kill it — dot should turn grey (idle/done)
- The dots should be visible in the grid view tiles
```

---

## Agent 2: MCP Server Support (Task #6)

```
YOUR TASK: Add MCP server support to agent sessions so agents can use MCP tools.

CONTEXT:
The Claude Agent SDK's query() function supports an `mcpServers` option that lets you attach MCP servers to an agent session. This is NOT currently passed through — it's a gap in agent-session.ts.

WHAT TO BUILD:

1. In src/mission-control/agent-session.ts:
   - Add `mcpServers` to the AgentSessionConfig interface:
     mcpServers?: Array<{
       name: string;
       transport: 'stdio' | 'sse' | 'http';
       command?: string;
       args?: string[];
       url?: string;
     }>;
   - In runSdkMode(), add mcpServers to queryOptions if configured:
     if (session.config.mcpServers?.length) {
       queryOptions.mcpServers = session.config.mcpServers;
     }

2. In src/api/routes/mission-control.ts:
   - Add `mcpServers` to the destructured body in POST /api/mc/agents
   - Pass it through to mgr.spawn()

3. In public/mission-control.html:
   - Add an "MCP Servers" section to the spawn modal (collapsible, under Advanced)
   - A textarea where users can paste JSON config for MCP servers
   - Parse and validate the JSON before sending to API

VERIFICATION:
- npx tsc --noEmit --skipLibCheck — no new errors
- Spawn an agent with mcpServers in the API body — should not crash
- The MCP section should appear in the spawn modal
```

---

## Agent 3: Verify Streaming Fix (Task #8)

```
YOUR TASK: Verify that the streaming line-breaking fix works correctly.

CONTEXT:
There was a bug where SDK streaming output showed each word on its own line. The fix uses an accumulator pattern that buffers partial tokens until newline characters.

WHAT TO TEST:
1. Open http://localhost:3000/mission-control.html
2. Spawn a new agent in SDK mode with Auto approval
3. Give it a task like: "Write a short paragraph explaining what TypeScript is."
4. Watch the output — it should appear as flowing sentences, NOT one-word-per-line
5. Try a task that uses tools: "Read the package.json file and tell me the project name"
6. Tool calls like [Using Read...] should appear on their own lines
7. Multi-paragraph responses should split at actual line breaks

IF THE FIX WORKS:
- Report "STREAMING FIX VERIFIED" in your output
- Note any edge cases you observe

IF IT'S STILL BROKEN:
- Describe exactly what you see
- Check the streamingAccum logic in the mc:output handler in mission-control.html
- The accumulator should buffer text until \n, show a live preview of the current partial line
```

---

## Agent 4: Server Restart + Smoke Test (Task #9)

```
YOUR TASK: Restart the PIA server and run a smoke test of all recent changes.

STEPS:
1. Run: npx tsc --noEmit --skipLibCheck
   - Should have zero errors in src/ (ignore dao-foundation-files/ errors)

2. The server should be running via npm run dev (tsx watch auto-restarts)
   - If not running, start it: npm run dev

3. Test the auto-approved prompt visibility:
   - POST to /api/mc/agents with approvalMode: "auto" and a task
   - Watch if auto-approved prompts appear in the WebSocket feed
   - Check the prompts endpoint: GET /api/mc/prompts

4. Test the file search endpoint:
   - GET /api/files/search?q=pia&root=C:\Users\mic\Downloads
   - Should return matching directories

5. Test agent lifecycle:
   - Spawn agent → verify it starts
   - Send follow-up → verify it responds
   - Kill agent → verify it stops

REPORT: List each test as PASS or FAIL with a one-line description.
```

---

## Agent 5: Browser Agent Research + Prototype (Task #7)

```
YOUR TASK: Research and prototype a browser control agent using Playwright MCP.

CONTEXT:
We decided to build a dedicated browser agent (not mixed with code agents) that can:
- Navigate web pages
- Fill forms, click buttons
- Take screenshots
- Run visual tests on HTML that other agents create

RESEARCH PHASE:
1. Check if @anthropic-ai/claude-agent-sdk supports mcpServers with Playwright MCP
2. Find the Playwright MCP server package (likely @anthropic-ai/mcp-playwright or similar)
3. Understand the transport type needed (stdio vs sse)

PROTOTYPE:
1. Create a file: src/browser-agent/browser-session.ts
2. It should be a simplified version of agent-session.ts that:
   - Always includes Playwright MCP server in its mcpServers config
   - Uses a system prompt focused on browser interaction
   - Has methods: navigate(url), screenshot(), click(selector), fill(selector, value)
3. Add a test endpoint: POST /api/browser/navigate { url }

DO NOT:
- Modify the existing agent-session.ts
- Add browser features to the main Mission Control dashboard yet
- Install packages without listing them first

OUTPUT: A working browser-session.ts that can be spawned and navigate to a URL.
```
