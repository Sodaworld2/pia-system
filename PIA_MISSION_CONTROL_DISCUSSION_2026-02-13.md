# PIA Mission Control — Design Discussion Backup
**Date:** 2026-02-13
**Participants:** Mic (human) + Claude (AI)

---

## Summary

PIA (Project Intelligence Agent) is being redesigned around its **core purpose**: a **Claude Code fleet manager** — mission control for supervising multiple Claude Code CLI agents across 6 machines from a single terminal.

**Architecture decision: Hybrid** (API engine + PTY for full Claude Code access)
**UX: CLI for action, browser dashboard for monitoring**
**Control modes: Manual (1/2/3 quick-response) + Auto (PIA supervisor decides)**

---

## Discussion Journal

### Q1: Can PIA create a new CLI/Terminal? What's the difference?

**Context:** User wants to understand PIA's current terminal capabilities and terminology.

**Findings:**
- PIA **can** create new terminal sessions via `POST /api/sessions` (spawns PTY with node-pty)
- PIA **can** run one-off commands via `POST /api/exec` or orchestrator's `run_command` tool
- PIA **can** stream terminal I/O in real-time over WebSocket

**Terminology clarified:**
- **Terminal** = the window/interface/PTY session (the container)
- **CLI** = a command-line program that runs inside a terminal (e.g. git, npm)
- **Shell** = the interpreter (PowerShell, bash) that runs in the terminal

**Current PIA terminal architecture:**
- `src/tunnel/pty-wrapper.ts` — Low-level PTY management (node-pty)
- `src/tunnel/websocket-server.ts` — Real-time terminal streaming
- `src/api/routes/sessions.ts` — REST API for session lifecycle
- `src/api/routes/exec.ts` — Simple one-shot command execution
- `src/orchestrator/autonomous-worker.ts` — AI-driven tool loop (Claude runs commands autonomously)

---

### Q2: Can one agent control another agent's Claude Code CLI? (Permission delegation)

**Context:** User is currently talking to Claude Code CLI where only the human can approve actions. They want PIA to be able to:
1. Spawn a Claude Code CLI terminal on a remote machine
2. Have a "supervisor agent" watch that terminal's output
3. When the remote Claude CLI asks for permission (e.g. "Allow bash command?"), the supervisor agent answers automatically — no human needed for every prompt

**This is: Agent-to-Agent orchestration with permission delegation.**

**Current chain:** `Human -> Claude CLI -> approves -> work`
**Desired chain:** `Human -> PIA Supervisor Agent -> spawns Claude CLI on Machine B -> supervisor reads output -> supervisor auto-approves/denies -> work happens autonomously`

**What PIA has today:**
- Can spawn PTY terminals (including on remote machines via relay)
- Can stream terminal output in real-time via WebSocket
- Can send keystrokes to terminal sessions

**What's missing (new capabilities needed):**
- **Prompt detector** — parse Claude CLI output to recognize permission/approval questions
- **Supervisor agent loop** — an AI agent that watches the stream, decides approve/deny, and sends response
- **Policy/rules engine** — what the supervisor is allowed to approve (safety guardrails)
- **Cross-machine Claude CLI spawning** — reliably starting `claude` CLI on remote machines via PIA

---

### Q3: Refined UX — Mission Control Terminal with Manual/Auto modes

**Context:** User refined the vision. Not just full autonomy — they want a **hybrid control model** with two modes and quick-response UX.

**Two modes per spawned session:**
1. **Manual mode** — Claude CLI prompts get forwarded to the user's terminal. User answers with quick keystrokes (1, 2, 3) instead of switching windows.
2. **Auto mode** — PIA supervisor agent handles prompts automatically. User can flip between modes.

**Quick-response UX in terminal:**
When a spawned Claude CLI asks a question, the user sees it formatted with numbered options:
```
[Machine-2/Claude] Wants to run: npm test
  [1] Allow   [2] Deny   [3] Allow all similar

[Machine-2/Claude] Which approach?
  [1] Option A   [2] Option B   [3] Type custom answer...
```

**Key UX principles:**
- User stays in ONE terminal (mission control) and manages multiple spawned Claude sessions
- Quick keyboard shortcuts (1/2/3) for fast responses — no full typing needed
- Toggle between manual and auto mode per session
- Text input option for when Claude asks open-ended questions
- This is a **terminal multiplexer with AI-aware prompt forwarding**

**Analogy:** Like a tmux/screen but specifically designed for supervising multiple Claude Code CLI instances, with smart prompt detection and quick-answer UI.

---

### Q4: What IS PIA? — Core identity discussion

**Key realization: Mission control for AI agents IS PIA's core purpose.**

Everything else (dashboard, DB, orchestrator, souls, work sessions) is supporting infrastructure for this central concept.

**PIA = the tech lead layer between human and worker agents**

Architecture:
```
Human (the boss)
  +-- PIA (mission control / tech lead)
        |-- Claude CLI on Machine 1
        |-- Claude CLI on Machine 2
        |-- Claude CLI on Machine 3
        |-- Claude CLI on Machine 4
        |-- Claude CLI on Machine 5
        +-- Claude CLI on Machine 6
```

**Design principles identified:**
1. The terminal UX IS the product — quick-response (1/2/3) must be faster than switching windows
2. Session awareness — PIA should understand context, categorize prompts, prioritize, batch similar ones
3. Auto-mode policy is the differentiator — the "Intelligence" in "Project Intelligence Agent"

**Daily usage vision:**
- **CLI** for quick control and responding to agent prompts (keyboard-driven)
- **Browser dashboard** for overview, monitoring, reading journals/history
- **6 machines** in the fleet — user wants to control all terminals across all machines
- **Journals** — ability to read what each machine/agent has been working on

---

### Q5: Scope — Claude CLIs only (not general terminals)

PIA is specifically a **Claude Code fleet manager**. Opinionated about what it controls. This simplifies design because Claude CLI output has predictable patterns.

---

### Q6: Architecture decision — PTY vs API vs Hybrid

**Decision: Hybrid approach.**

- **API is the engine** — PIA talks to Claude API directly (like autonomous-worker already does). Clean control, no fragile terminal parsing, PIA owns permissions.
- **Terminal is the dashboard** — PIA renders activity into a terminal-like view so the user sees what looks like a Claude Code session, but PIA is driving underneath.

**Why hybrid is better:**
- No prompt detection/parsing needed in API mode — PIA originates prompts, doesn't intercept them
- Quick-response buttons (1/2/3) are generated by PIA when its policy says "ask human"
- Terminal view is a rendering of API activity, not a raw PTY stream
- Can still spawn real PTY for edge cases where direct terminal access is needed

**Existing code to build on:**
- `src/orchestrator/autonomous-worker.ts` — already does the Claude API tool loop
- `src/tunnel/pty-wrapper.ts` + `websocket-server.ts` — for terminal rendering/streaming
- `src/api/routes/sessions.ts` — session lifecycle management

---

### Q7: Pros/Cons deep-dive on all three approaches

User requested honest pros/cons before committing. Full analysis provided:

**Option A (PTY):** Leverages Claude Code's full tool suite for free, but terminal parsing is fragile.
- Pros: Full Claude Code experience, free upgrades from Anthropic, each agent looks like what user already uses
- Cons: Fragile terminal parsing, hacky permission interception, error recovery hard, latency

**Option B (API):** Total control and clean data, but must reimplement Claude Code's tools.
- Pros: Total control, clean structured data, fast, already partially exists (autonomous-worker), custom tools
- Cons: Lose Claude Code features (MCP, slash commands, hooks, CLAUDE.md), must reimplement everything, maintenance burden

**Option C (Hybrid):** Best of both but most complex to build and maintain.
- Pros: Control when needed (API), full Claude Code when needed (PTY), best logging, can evolve
- Cons: Most complex, two systems to maintain, UX inconsistency risk, "fake" terminal view could confuse

**My recommendation was PTY-first** to avoid reimplementing Claude Code. **User chose Hybrid** — build both from the start.

**Decision: Hybrid confirmed. Two execution modes:**
1. API mode — for standard, well-defined tasks (PIA drives the tool loop)
2. PTY mode — for complex/exploratory work (real Claude Code CLI, PIA watches and responds)

---

## Conversation Insights & Themes

### The Trust Model (graduated trust)
- Level 0: Human approves everything (status quo)
- Level 1: Human approves with quick buttons (1/2/3 — faster)
- Level 2: Auto-approve safe stuff, escalate risky stuff
- Level 3: Full auto — supervisor handles everything
- User can slide between levels PER SESSION

### The Tech Lead Analogy
PIA is what a tech lead does — assigns work, checks in on questions, approves/redirects, keeps the bigger picture. But for AI agents instead of junior devs.

### Critical Design Decisions Still Needed
- Auto-mode safety policy (what to approve vs escalate)
- Cross-machine deployment mechanism (Tailscale? SSH? PIA relay?)
- How API-mode and PTY-mode sessions look different in the UI
- Phase 1 scope (minimum viable mission control)

---

## Key Files in Current Codebase

| File | Purpose | Reuse for Mission Control |
|------|---------|--------------------------|
| `src/orchestrator/autonomous-worker.ts` | Claude API tool loop | API-mode agent execution |
| `src/tunnel/pty-wrapper.ts` | PTY session management | PTY-mode agent execution |
| `src/tunnel/websocket-server.ts` | Real-time streaming | Live terminal view + prompt forwarding |
| `src/api/routes/sessions.ts` | Session lifecycle API | Agent session management |
| `src/api/routes/exec.ts` | One-shot commands | Quick command execution |
| `src/db/database.ts` | SQLite database | Journal storage, agent state |
| `public/visor.html` | Dashboard with xterm.js | Reference for mission control dashboard |
| `MASTER_DASHBOARD.html` | Fleet overview mockup | Reference for fleet view |
