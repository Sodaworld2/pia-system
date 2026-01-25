# START HERE - For the Agent on RTX 5090

Welcome! This document gets you building PIA immediately.

---

## Quick Context

**What is PIA?**
A system to control 43+ AI agents across multiple machines from one dashboard (including your phone).

**What's already done?**
- Design and mockups (HTML files in this repo)
- Research on existing solutions (KNOWLEDGE_BASE.md)
- Architecture decision: Use Claude-Flow as foundation
- Detailed sprint plan with 25 tickets (SPRINT_PLAN.md)

**What you're building?**
- CLI Tunnel (control Claude from browser/phone)
- Fleet Dashboard (see all 43 agents)
- Central Hub (aggregate multiple machines)
- Mobile PWA (phone control)
- Auto-Healer (auto-update documentation)

---

## Your First Commands

```bash
# 1. Navigate to project
cd C:\Users\mic\Downloads\pia-system

# 2. Initialize project (PIA-001)
mkdir -p src/{api,tunnel,hub,local,healer,db,utils}
mkdir -p public/{css,js,assets}
npm init -y

# 3. Install dependencies
npm install claude-flow@v3alpha node-pty ws express socket.io better-sqlite3 chokidar
npm install -D typescript @types/node @types/ws @types/express @types/better-sqlite3 eslint prettier

# 4. Initialize TypeScript
npx tsc --init

# 5. Verify Claude-Flow works
npx claude-flow --list
```

---

## Key Files to Read

| File | What It Contains |
|------|------------------|
| `SPRINT_PLAN.md` | **MOST IMPORTANT** - Full implementation details for every ticket |
| `TICKETS.md` | Track your progress, update status as you work |
| `KNOWLEDGE_BASE.md` | Research on existing solutions, patterns, failures to avoid |
| `ANALYSIS_AND_RECOMMENDATIONS.md` | Why we chose this architecture |
| `implementation_plan.md` | Original design document |

---

## Ticket Workflow

1. **Read** the ticket in SPRINT_PLAN.md (search for ticket ID like "PIA-001")
2. **Update** TICKETS.md status to "🔄 IN PROGRESS"
3. **Implement** following the acceptance criteria
4. **Test** according to the verification steps
5. **Commit** with ticket ID: `git commit -m "feat(PIA-001): project initialization"`
6. **Update** TICKETS.md status to "✅ DONE"
7. **Move** to next ticket

---

## Implementation Order

**Start with these (sequential)**:
```
PIA-001 → PIA-003 → PIA-004 → PIA-005
```

**Then these can run in parallel**:
```
PIA-002 (Claude-Flow) ─┐
PIA-006 (REST API) ────┼── After PIA-003
PIA-019 (Watcher) ─────┘
```

**Dashboard (after API)**:
```
PIA-007 → PIA-008 → PIA-009 → PIA-010 → PIA-011
```

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     YOUR CUSTOM UI                          │
│  public/index.html, fleet.html, tunnel.html, mobile.html   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   PIA BACKEND (src/)                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ API     │ │ Tunnel  │ │ Hub     │ │ Healer  │           │
│  │ Server  │ │ (PTY+WS)│ │ (Aggr.) │ │ (Watch) │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 CLAUDE-FLOW (npm package)                   │
│            60+ agents, swarm coordination, MCP              │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                    OLLAMA (RTX 5090)                        │
│              Local AI - zero cost inference                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

The schema is in SPRINT_PLAN.md under PIA-003. Key tables:
- `machines` - Registered machines
- `agents` - Running agents
- `sessions` - CLI tunnel sessions
- `session_output` - Terminal output buffer
- `tasks` - Task tracking
- `alerts` - System alerts

---

## WebSocket Protocol

See SPRINT_PLAN.md under PIA-005. Quick reference:
```javascript
// Client sends
{ type: 'auth', payload: { token: 'xxx' } }
{ type: 'subscribe', payload: { sessionId: 'abc' } }
{ type: 'input', payload: { data: 'hello\n' } }

// Server sends
{ type: 'output', payload: 'terminal output' }
{ type: 'agent:update', payload: { id, status, progress } }
```

---

## Testing Your Work

After each phase, verify:

**Phase 1**:
```bash
# PTY works
node -e "const pty = require('node-pty'); const p = pty.spawn('echo', ['hello']); p.onData(d => console.log(d));"

# WebSocket works
wscat -c ws://localhost:3001
```

**Phase 2**:
- Open http://localhost:3000 in browser
- Verify tiles render
- Verify real-time updates

**Phase 3**:
- Start PIA on two machines
- Verify both appear in Hub

---

## Common Issues

**node-pty won't install on Windows**:
```bash
npm install --global windows-build-tools
npm install node-pty
```

**Claude-Flow not found**:
```bash
npx claude-flow@v3alpha init
```

**Ollama not responding**:
```bash
# Make sure Ollama is running
ollama serve
# Then pull a model
ollama pull llama3:70b
```

---

## Commit Messages

Follow this format:
```
feat(PIA-XXX): short description

- Detail 1
- Detail 2

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

Examples:
- `feat(PIA-001): initialize project structure`
- `feat(PIA-004): implement PTY wrapper for CLI capture`
- `fix(PIA-005): handle WebSocket reconnection`

---

## When You're Done

1. All 25 tickets marked ✅ DONE in TICKETS.md
2. All tests pass
3. Dashboard works with 43 agents
4. Mobile PWA installable
5. Push to GitHub: `git push origin main`

---

## Questions?

Everything you need is in:
- **SPRINT_PLAN.md** - Implementation details
- **KNOWLEDGE_BASE.md** - Research and patterns
- **Mockup HTML files** - Visual reference

**Good luck! Build something amazing.**

---

*This is PIA - your Project Intelligence Agent*
