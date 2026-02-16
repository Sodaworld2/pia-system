# Claude Agent SDK — Complete Research Reference
## Compiled 2026-02-14 | PIA Mission Control

---

## Table of Contents
1. [Official Documentation](#1-official-documentation)
2. [Critical Bugs & Issues](#2-critical-bugs--issues)
3. [Permissions & Security Issues](#3-permissions--security-issues)
4. [Performance & Multi-Session Issues](#4-performance--multi-session-issues)
5. [Subagent & Orchestration Issues](#5-subagent--orchestration-issues)
6. [Streaming & Output Issues](#6-streaming--output-issues)
7. [Platform-Specific Issues (Windows)](#7-platform-specific-issues-windows)
8. [V2 API Limitations](#8-v2-api-limitations)
9. [Advanced Patterns & Code Examples](#9-advanced-patterns--code-examples)
10. [Multi-Agent / Orchestration Projects](#10-multi-agent--orchestration-projects)
11. [Blog Posts & Tutorials](#11-blog-posts--tutorials)
12. [Third-Party Tools & Integrations](#12-third-party-tools--integrations)
13. [Key Recommendations for PIA](#13-key-recommendations-for-pia)

---

## 1. Official Documentation

| Resource | URL | Key Content |
|---|---|---|
| SDK Overview | https://platform.claude.com/docs/en/agent-sdk/overview | Full intro, installation, core capabilities |
| TypeScript API Reference | https://platform.claude.com/docs/en/agent-sdk/typescript | Complete API surface, all Options fields |
| Quickstart Guide | https://platform.claude.com/docs/en/agent-sdk/quickstart | Step-by-step bug-fixing agent tutorial |
| Migration Guide | https://platform.claude.com/docs/en/agent-sdk/migration-guide | Breaking changes from claude-code-sdk to claude-agent-sdk |
| Permissions Guide | https://platform.claude.com/docs/en/agent-sdk/permissions | Permission modes, canUseTool callback, evaluation order |
| Hooks Guide | https://platform.claude.com/docs/en/agent-sdk/hooks | 12 hook event types, PreToolUse/PostToolUse patterns |
| Subagents Guide | https://platform.claude.com/docs/en/agent-sdk/subagents | Creating, invoking, tool restrictions, dynamic config |
| File Checkpointing | https://platform.claude.com/docs/en/agent-sdk/file-checkpointing | Tracking changes, rewindFiles(), limitations |
| Streaming Output | https://platform.claude.com/docs/en/agent-sdk/streaming-output | includePartialMessages, stream_event handling |
| Cost Tracking | https://platform.claude.com/docs/en/agent-sdk/cost-tracking | maxBudgetUsd, modelUsage breakdown, deduplication |
| MCP Integration | https://platform.claude.com/docs/en/agent-sdk/mcp | stdio/HTTP/SSE/SDK MCP servers, tool search |
| Structured Outputs | https://platform.claude.com/docs/en/agent-sdk/structured-outputs | JSON Schema output, Zod integration |
| Hosting Guide | https://platform.claude.com/docs/en/agent-sdk/hosting | Ephemeral/Long-Running/Hybrid patterns, container specs |
| Secure Deployment | https://platform.claude.com/docs/en/agent-sdk/secure-deployment | Security best practices |
| Context Windows | https://platform.claude.com/docs/en/build-with-claude/context-windows | 1M context beta, model limits |
| Models Overview | https://platform.claude.com/docs/en/about-claude/models/overview | All model IDs, capabilities, pricing |

### Key Migration Facts (from claude-code-sdk to claude-agent-sdk)
- Package rename: `@anthropic-ai/claude-code` -> `@anthropic-ai/claude-agent-sdk`
- **systemPrompt no longer defaults to Claude Code preset** — must explicitly set `{ type: "preset", preset: "claude_code" }`
- **settingSources no longer loaded by default** — must explicitly set `["project"]` to load CLAUDE.md

---

## 2. Critical Bugs & Issues

| # | Issue | URL | Impact | Status |
|---|---|---|---|---|
| 1 | SDK execution error in Agent SDK 0.2.27+ | https://github.com/anthropics/claude-code-action/issues/892 | P1 crash before API calls | Open |
| 2 | SDK 0.2.15 causes AJV validation error | https://github.com/anthropics/claude-code-action/issues/852 | All runs fail immediately | Open |
| 3 | model="default" fails with HTTP 404 | https://github.com/anthropics/claude-code/issues/13369 | Must specify explicit model | Open |
| 4 | License agreement blocks agent startup | https://github.com/anthropics/claude-code/issues/17373 | Agents can't confirm interactively | Open |
| 5 | Intermittent crash on PR review (exit code 1 after 150ms) | https://github.com/anthropics/claude-code-action/issues/853 | Retry logic essential | Open |

### Lesson: Pin SDK versions carefully. 0.2.15, 0.2.23, 0.2.27 all introduced regressions.

---

## 3. Permissions & Security Issues

| # | Issue | URL | Impact |
|---|---|---|---|
| 6 | `allowedTools` does not restrict built-in tools | https://github.com/anthropics/claude-agent-sdk-typescript/issues/115 | CRITICAL — no read-only agents possible |
| 7 | `allowed_tools` parameter ignored (Python) | https://github.com/anthropics/claude-agent-sdk-python/issues/361 | Same as #6, Python side |
| 8 | `allowed_tools=[]` (empty list) treated as falsy | https://github.com/anthropics/claude-agent-sdk-python/issues/523 | All tools available instead of none |
| 9 | `bypassPermissions` not supported during streaming | https://github.com/anthropics/claude-agent-sdk-python/issues/251 | Must set at creation time |
| 10 | V2 ignores permissionMode, cwd, allowedTools | https://github.com/anthropics/claude-agent-sdk-typescript/issues/176 | CRITICAL — use V1 only |
| 11 | Tool execution requires approval despite bypass | https://github.com/anthropics/claude-code/issues/14279 | V2 broken for headless |
| 12 | `--dangerously-skip-permissions` shows dialog every launch | https://github.com/anthropics/claude-code/issues/25503 | Set `skipDangerousModePermissionPrompt: true` in settings.json |
| 13 | Delegate mode teammates have no file access | https://github.com/anthropics/claude-code/issues/24307 | Multi-agent delegation broken |
| 14 | PreToolUse hook deny causes API 400 error | https://github.com/anthropics/claude-agent-sdk-typescript/issues/170 | Hook-based permission control broken |

### Lesson: Don't rely on allowedTools for security — built-in tools bypass it. Use canUseTool callback instead.

---

## 4. Performance & Multi-Session Issues

| # | Issue | URL | Impact |
|---|---|---|---|
| 15 | 12-second overhead per query() call | https://github.com/anthropics/claude-agent-sdk-typescript/issues/34 | CRITICAL — no hot process reuse |
| 16 | Daemon Mode feature request | https://github.com/anthropics/claude-agent-sdk-typescript/issues/33 | No persistent process pool |
| 17 | 20-30s per instance creation (Python) | https://github.com/anthropics/claude-agent-sdk-python/issues/333 | Same issue, Python side |
| 18 | Connection conflict — multiple agents same machine | https://github.com/anthropics/claude-code/issues/24631 | Set unique HOME dirs per agent |
| 19 | ENOENT + lock contention + OOM in multi-agent | https://github.com/anthropics/claude-agent-sdk-python/issues/513 | Pre-create log dirs, isolate HOME |
| 20 | Second query hangs after background Task | https://github.com/anthropics/claude-agent-sdk-python/issues/558 | Deadlock in multi-turn + background tasks |
| 21 | session_id doesn't isolate context in single client | https://github.com/anthropics/claude-agent-sdk-python/issues/560 | Each agent needs own client instance |

### Lesson: Budget ~12s startup per agent. Isolate agents with unique HOME dirs. Each agent needs its own client instance.

---

## 5. Subagent & Orchestration Issues

| # | Issue | URL | Impact |
|---|---|---|---|
| 22 | Async subagents error in streaming mode | https://github.com/anthropics/claude-agent-sdk-typescript/issues/130 | Async parallel subagents broken |
| 23 | Subagents don't stop when parent stops | https://github.com/anthropics/claude-agent-sdk-typescript/issues/132 | CRITICAL — orphan processes |
| 24 | Auto-terminate spawned processes on parent death | https://github.com/anthropics/claude-agent-sdk-typescript/issues/142 | Feature request — not implemented |
| 25 | Tool restrictions not enforced on subagent children | https://github.com/anthropics/claude-agent-sdk-typescript/issues/172 | Security boundary fails |
| 26 | Subagents can't inherit MCP (v0.2.23+) | https://github.com/anthropics/claude-agent-sdk-typescript/issues/158 | Custom tools don't propagate |
| 27 | AgentDefinition.tools intersected with Options.tools | https://github.com/anthropics/claude-agent-sdk-typescript/issues/163 | Sub-agents get fewer tools than intended |
| 28 | Sub-agents not registering (Python) | https://github.com/anthropics/claude-agent-sdk-python/issues/567 | Python orchestration affected |

### Lesson: Implement manual cleanup of child processes. Don't nest subagents. Sync subagents only.

---

## 6. Streaming & Output Issues

| # | Issue | URL | Impact |
|---|---|---|---|
| 29 | Race condition: write after end | https://github.com/anthropics/claude-agent-sdk-typescript/issues/148 | Streaming can crash |
| 30 | `thinking: { type: 'adaptive' }` silently disables thinking | https://github.com/anthropics/claude-agent-sdk-typescript/issues/168 | No thinking output |
| 31 | `(no content)` text blocks before thinking | https://github.com/anthropics/claude-agent-sdk-typescript/issues/153 | Filter empty blocks |
| 32 | AssistantMessage drops significant fields | https://github.com/anthropics/claude-agent-sdk-python/issues/562 | Missing metadata |
| 33 | ANTHROPIC_LOG=debug corrupts protocol | https://github.com/anthropics/claude-agent-sdk-typescript/issues/157 | Never use in production |
| 34 | U+2028/U+2029 breaks JSON parsing | https://github.com/anthropics/claude-agent-sdk-typescript/issues/137 | Sanitize MCP output |

---

## 7. Platform-Specific Issues (Windows)

| # | Issue | URL | Workaround |
|---|---|---|---|
| 35 | Console window appears per subprocess | https://github.com/anthropics/claude-agent-sdk-typescript/issues/103 | Feature request for windowsHide |
| 36 | WinError 193 — can't find claude.cmd | https://github.com/anthropics/claude-agent-sdk-python/issues/252 | Use explicit cli_path |
| 37 | spawn ENOENT in Docker | https://github.com/anthropics/anthropic-sdk-typescript/issues/865 | Use pathToClaudeCodeExecutable |
| 38 | CLAUDECODE env prevents SDK from hooks | https://github.com/anthropics/claude-agent-sdk-python/issues/573 | Strip CLAUDECODE from env |
| — | Long subagent prompts fail (>8191 chars) | Documented in subagents guide | Keep prompts short on Windows |
| — | Git Bash TTY incompatibility | Troubleshooting docs | Use PowerShell |

### PIA Fix Applied: Custom spawnClaudeCodeProcess + process.execPath + CLAUDECODE env strip + forward-slash cwd

---

## 8. V2 API Limitations

| # | Issue | URL | Missing Feature |
|---|---|---|---|
| 39 | V2 doesn't support systemPrompt | https://github.com/anthropics/claude-agent-sdk-typescript/issues/160 | No per-agent instructions |
| 40 | V2 doesn't support mcpServers | https://github.com/anthropics/claude-agent-sdk-typescript/issues/154 | No custom tools |
| 41 | V2 doesn't support plugins | https://github.com/anthropics/claude-agent-sdk-typescript/issues/171 | Despite docs claiming it |
| 42 | Session resume creates new session (Python) | https://github.com/anthropics/claude-agent-sdk-python/issues/555 | Session continuity broken |

### Verdict: V2 is unusable for production. V1 query() is the only stable path.

---

## 9. Advanced Patterns & Code Examples

### 9.1 File Checkpointing (Full Pattern)
```typescript
const opts = {
  enableFileCheckpointing: true,
  permissionMode: "acceptEdits" as const,
  extraArgs: { "replay-user-messages": null },
  env: { ...process.env, CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: "1" }
};
```
**Gotchas:**
- Only tracks Write, Edit, NotebookEdit — NOT Bash file modifications
- Must set BOTH config option AND env var
- "ProcessTransport not ready" error if calling rewindFiles() after stream completes — resume first

### 9.2 Streaming with Tool Status
```typescript
for await (const message of query({
  prompt: "task",
  options: { includePartialMessages: true }
})) {
  if (message.type === "stream_event") {
    const event = message.event;
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text); // real-time text
    }
    if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
      console.log(`[Using ${event.content_block.name}...]`);
    }
  }
}
```

### 9.3 Hooks Chain Pattern
```typescript
hooks: {
  PreToolUse: [
    { hooks: [rateLimiter] },         // 1st: rate limits
    { hooks: [authorizationCheck] },   // 2nd: permissions
    { hooks: [inputSanitizer] },       // 3rd: sanitize
    { hooks: [auditLogger] }           // 4th: log
  ],
  SubagentStart: [{ hooks: [subagentTracker] }],
  SubagentStop: [{ hooks: [subagentCompletionHandler] }],
  Notification: [{ hooks: [dashboardNotifier] }],
  SessionEnd: [{ hooks: [cleanupHandler] }]
}
```

### 9.4 Session Forking for Parallel Exploration
- **Issue:** https://github.com/anthropics/claude-agent-sdk-typescript/issues/88
- Use `forkSession: true` when resuming to branch conversations
- Fork a base session into N parallel investigation branches

### 9.5 In-Process MCP Server (Zero IPC Overhead)
```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const myTool = tool("analyze", "Analyze complexity",
  { filePath: z.string() },
  async (args) => ({ content: [{ type: "text", text: `Result: ${result}` }] })
);

const server = createSdkMcpServer({ name: "metrics", version: "1.0.0", tools: [myTool] });
```

### 9.6 Cost Tracker with Deduplication
```typescript
class CostTracker {
  private processedMessageIds = new Set<string>();
  processMessage(message: any) {
    if (message.type !== "assistant" || !message.usage) return;
    if (this.processedMessageIds.has(message.id)) return; // deduplicate!
    this.processedMessageIds.add(message.id);
    // track usage...
  }
}
```
**Rule:** All messages with same ID report identical usage — charge once per step.

### 9.7 Dynamic Agent Factory
```typescript
function createAgent(level: "basic" | "strict"): AgentDefinition {
  return {
    description: "Security reviewer",
    prompt: `You are a ${level === "strict" ? "strict" : "balanced"} reviewer...`,
    tools: ["Read", "Grep", "Glob"],
    model: level === "strict" ? "opus" : "sonnet"
  };
}
```

### 9.8 Complete Dashboard Options Template
```typescript
const dashboardOptions = {
  model: "claude-opus-4-6",
  systemPrompt: { type: "preset", preset: "claude_code", append: "Custom instructions" },
  agents: { /* subagent definitions */ },
  allowedTools: ["Read", "Grep", "Glob", "Task", "Bash"],
  disallowedTools: [],
  permissionMode: "default",
  canUseTool: async (tool, input) => { /* approval logic */ },
  mcpServers: { /* custom tools */ },
  maxBudgetUsd: 10.00,
  maxTurns: 100,
  includePartialMessages: true,
  enableFileCheckpointing: true,
  betas: ["context-1m-2025-08-07"],
  resume: "previous-session-id",
  settingSources: ["project"],
  fallbackModel: "claude-sonnet-4-5-20250929",
  hooks: { /* event hooks */ },
  sandbox: { enabled: true },
  cwd: "/path/to/project",
  env: { /* clean env without CLAUDECODE */ },
  spawnClaudeCodeProcess: (config) => { /* custom spawn */ },
};
```

---

## 10. Multi-Agent / Orchestration Projects

| Project | URL | What It Does |
|---|---|---|
| claude-flow | https://github.com/ruvnet/claude-flow | #1 ranked agent orchestration platform, swarm intelligence |
| claude-swarm | https://github.com/affaan-m/claude-swarm | Hackathon winner, task decomposition, parallel execution |
| claude-code-hooks-multi-agent-observability | https://github.com/disler/claude-code-hooks-multi-agent-observability | Real-time monitoring dashboard for parallel agents |
| claude-agent-server | https://github.com/dzhng/claude-agent-server | Run Claude Agent in sandbox, control via WebSocket |
| claude-agent-kit | https://github.com/JimLiu/claude-agent-kit | WebSocket bridge for multi-client chat |
| claude-code-by-agents | https://github.com/baryhuang/claude-code-by-agents | Multi-agent orchestration with @mentions |
| ccswarm | https://github.com/nwiizo/ccswarm | Multi-agent swarm tool |
| dmux | https://github.com/formkit/dmux | Terminal multiplexer for Claude agents |
| agent-of-empires | (community tool) | Git worktree + tmux isolation per agent |
| agents (wshobson) | https://github.com/wshobson/agents | 112 specialized agents, 16 orchestrators |
| claude-agent-sdk-demos | https://github.com/anthropics/claude-agent-sdk-demos | 7 official demo apps (1.4k stars) |

### Git Worktree + Tmux Pattern (Proven for Isolation)
- Gist: https://gist.github.com/andynu/13e362f7a5e69a9f083e7bca9f83f60a
- Each agent gets: own git worktree (isolated files) + tmux session (isolated terminal) + HOME dir (isolated config)

---

## 11. Blog Posts & Tutorials

| Title | URL | Key Content |
|---|---|---|
| Anthropic Engineering: Building Agents | https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk | Official design principles |
| Anthropic: Agent Skills | https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills | Dynamic skill loading |
| The Definitive Guide (Medium) | https://datapoetica.medium.com/the-definitive-guide-to-the-claude-agent-sdk-building-the-next-generation-of-ai-69fda0a0530f | Comprehensive Feb 2026 guide |
| The Complete Guide (Nader Dabit) | https://nader.substack.com/p/the-complete-guide-to-building-agents | Full code patterns, all features |
| AGNT.gg Cheatsheet | https://agnt.gg/articles/claude-agent-sdk-cheatsheet | Quick-reference all patterns |
| Common Pitfalls | https://liruifengv.com/posts/claude-agent-sdk-pitfalls-en/ | 5 critical pitfalls + fixes |
| DataCamp Tutorial | https://www.datacamp.com/tutorial/how-to-use-claude-agent-sdk | Step-by-step projects |
| Skywork Best Practices | https://skywork.ai/blog/claude-agent-sdk-best-practices-ai-agents-2025/ | Production CI/CD patterns |
| Kanaries Build Guide | https://docs.kanaries.net/topics/AICoding/build-claude-code-with-claude-agent-sdk | Build Claude-Code-like agent |
| Agent Teams Guide | https://claudefa.st/blog/guide/agents/agent-teams | Multi-session orchestration |
| SitePoint Agent Teams | https://www.sitepoint.com/anthropic-claude-code-agent-teams/ | Team lead coordination |
| Understanding Full Stack | https://alexop.dev/posts/understanding-claude-code-full-stack/ | SDK architecture deep-dive |
| PubNub Subagent Practices | https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/ | Subagent best practices |
| MS Semantic Kernel Integration | https://devblogs.microsoft.com/semantic-kernel/build-ai-agents-with-claude-agent-sdk-and-microsoft-agent-framework/ | Enterprise agent framework |

---

## 12. Third-Party Tools & Integrations

| Tool | URL | What It Does |
|---|---|---|
| Langfuse | https://langfuse.com/integrations/frameworks/claude-agent-sdk | Tracing, cost tracking |
| LangSmith | https://docs.langchain.com/langsmith/trace-claude-agent-sdk | Trace SDK executions |
| Datadog | https://www.datadoghq.com/blog/claude-code-monitoring/ | Monitoring, alerts |
| Promptfoo | https://www.promptfoo.dev/docs/providers/claude-agent-sdk/ | Agent testing/evaluation |
| claude-code-sdk-ts (Fluent API) | https://github.com/instantlyeasy/claude-code-sdk-ts | Chainable API wrapper |
| Go SDK (Unofficial) | https://pkg.go.dev/github.com/clsx524/claude-agent-sdk-go | Go port |

### NPM Package
- **URL:** https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
- **Version:** 0.2.42
- **Weekly downloads:** 1.85M+

### GitHub Repositories
- **TypeScript SDK:** https://github.com/anthropics/claude-agent-sdk-typescript
- **Python SDK:** https://github.com/anthropics/claude-agent-sdk-python

---

## 13. Key Recommendations for PIA Mission Control

### Must Do (Critical)
1. **Use V1 `query()` only** — V2 is broken for production (issues #160, #154, #171, #176)
2. **Pin SDK version** — don't auto-update (regressions in 0.2.15, 0.2.23, 0.2.27)
3. **Set explicit model names** — never use "default" (issue #13369)
4. **Implement orphan process cleanup** — subagents don't auto-terminate (issues #132, #142)
5. **Set maxTurns always** — agents never timeout on their own (hosting guide)
6. **Use canUseTool for permissions** — allowedTools whitelist is broken (issue #115)

### Should Do (Stability)
7. **Set `settingSources: ['project']`** — loads CLAUDE.md (migration guide)
8. **Set `enableFileCheckpointing: true` + env var** — enables rollback
9. **Set `fallbackModel`** — graceful degradation on errors
10. **Set `maxBudgetUsd`** — hard per-session cost cap
11. **Filter empty text blocks** — "(no content)" before thinking (issue #153)
12. **Don't use ANTHROPIC_LOG=debug in production** — corrupts protocol (issue #157)
13. **Each agent needs own client instance** — session_id doesn't isolate (issue #560)

### Could Do (Enhancement)
14. **`includePartialMessages: true`** — real-time streaming to dashboard
15. **Session forking** — parallel exploration from common base
16. **In-process MCP servers** — custom dashboard tools with zero IPC
17. **Hooks for observability** — PreToolUse, SubagentStart, Notification
18. **`betas: ['context-1m-2025-08-07']`** — 1M context for large codebases
19. **Structured output** — JSON Schema for programmatic agent responses

### Windows-Specific
20. **Custom spawnClaudeCodeProcess** — required (process.execPath)
21. **Strip CLAUDECODE env var** — required (nested session detection)
22. **Forward-slash cwd** — required (backslash stripping bug)
23. **Keep subagent prompts < 8191 chars** — Windows command line limit
24. **Use PowerShell not Git Bash** — TTY incompatibility

---

*Research compiled by Claude Opus 4.6 | February 14, 2026*
*Total references: 50+ issues, 15+ tutorials, 10+ open-source projects, 6+ integrations*
