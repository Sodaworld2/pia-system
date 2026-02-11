# Workflow Guide

How to use this template's features day-to-day.

## Core Concept: Delegated Development

This template enforces a **delegation-first** workflow. You (the Lead Engineer) orchestrate work by delegating to specialized agents rather than writing code directly.

```
You (Orchestrator)
    ↓ delegate
Specialized Agents (@local-coder, @debug, etc.)
    ↓ produce
Code, Analysis, Reviews
    ↓ you review
Approved Output
```

**Why?** This pattern:
- Routes work to cost-appropriate models (FREE local LLM vs PAID cloud)
- Enforces separation of concerns (security reviews separate from coding)
- Creates audit trails (all agent calls logged)
- Prevents "ghost code" (hallucinated changes that weren't committed)

---

## The Cost-Conscious Waterfall

Work flows through tiers, starting FREE and escalating only when needed:

```
Tier 0 (FREE, Zero API calls)
├── /consider:* thinking models (pure prompt enhancement)
└── Decision: Can I solve this with structured thinking?
    ↓ no
Tier 1 (FREE, Local Ollama)
├── @local-coder - Code generation/drafting
├── @local-orchestrator - Task routing, loop detection
├── @lite-general - File reading, searches, test running
├── @local-git - Commit messages, PR summaries
└── Decision: Is local model sufficient?
    ↓ no
Tier 2 (FREE, Specialized Agents)
├── @code-sentinel - Security audit (multi-model)
├── @archivist - Knowledge management
└── Decision: Need external validation?
    ↓ yes
Tier 3 (PAID, Single-Model Review)
├── @gemini-overseer - Quick architecture check
├── @openai-overseer - Alternate perspective
└── Decision: High-stakes decision?
    ↓ yes
Tier 4 (PAID, Multi-Model Panel)
└── @overseer - Gemini + OpenAI + Grok + Opus synthesis
```

---

## Daily Workflow

### Starting a Session

```bash
cd your-project
claude
```

Claude will:
1. Read `CLAUDE.md` for project context
2. Load hooks from `.claude/settings.json`
3. Check `tasks/master.md` for current priorities

### Working on Tasks

**1. Check the backlog:**
```
What's the current task priority?
```

**2. Start a task:**
```
Let's work on [task name]
```

Claude will:
- Move the task to "In Progress" in `tasks/master.md`
- Create/update spec in `tasks/detail/`
- Delegate coding to appropriate agents

**3. Complete a task:**
```
This task is complete, let's wrap up
```

Claude will:
- Run verification checks
- Move task to "Done"
- Archive spec to `tasks/done/`

### The One Task Rule

**Complete ONE task per session, then start fresh.**

Why? Context accumulates and degrades:
- Earlier conversation pollutes understanding
- "Ghost code" (hallucinated changes) becomes more likely
- Fresh sessions have clean context

```bash
# After completing a task
git add . && git commit -m "feat: completed task"
# Start new session
claude
```

---

## Delegation Patterns

### Code Changes → @local-coder

```
Add error handling to the webhook parser
```

Claude delegates to @local-coder (FREE on Ollama), reviews output, presents to you.

### Debugging → @debug

```
Tests keep failing with KeyError, I've tried 3 fixes
```

Claude delegates to @debug which runs autonomous test loops until resolved or escalates.

### Security Review → @code-sentinel

```
Review the auth module for vulnerabilities
```

Claude delegates to @code-sentinel which runs Gemini + OpenAI + Grok security analysis.

### Architecture Decisions → @overseer

```
Should we use WebSockets or SSE for real-time updates?
```

Claude delegates to @overseer for multi-model architecture review with synthesis.

### Git Operations → @local-git

```
Commit these changes with a good message
```

Claude delegates to @local-git (FREE) to generate commit message.

---

## Hook Enforcement

Hooks automatically enforce the workflow:

### PreToolUse Hooks (Before Actions)

| Hook | What It Does |
|------|--------------|
| Security Gate | Blocks dangerous commands (`rm -rf`, `chmod 777`) |
| Enforce Delegation | Blocks direct code edits unless agent ran first |
| Block Local-Coder Model | Prevents `model` param to @local-coder (would waste Claude tokens) |

### PostToolUse Hooks (After Actions)

| Hook | What It Does |
|------|--------------|
| Log Edits | Records all file modifications |
| Track Model Calls | Logs API usage for cost tracking |

### SubagentStop Hooks (After Agents)

| Hook | What It Does |
|------|--------------|
| Track Agents | Records agent completion for audit |

---

## Extending Hooks

Add custom hooks without modifying template files:

```bash
# Create your hook
cat > .claude/hooks/pre-tool-use.d/50-my-check.sh << 'EOF'
#!/bin/bash
# Block writes to production config
if echo "$TOOL_INPUT" | grep -q "production.json"; then
    echo '{"decision": "block", "reason": "Cannot modify production config"}' | jq -c .
    exit 0
fi
echo '{"decision": "allow"}' | jq -c .
EOF
chmod +x .claude/hooks/pre-tool-use.d/50-my-check.sh
```

Hooks in `.d/` directories run in numeric order (00, 01, 50, etc.).

---

## Task Management

### Task Lifecycle

```
Backlog (tasks/master.md ## Backlog)
    ↓ select
In Progress (tasks/master.md ## In Progress)
    ↓ create spec
tasks/detail/[task-name].md
    ↓ complete & verify
Done (tasks/master.md ## Done)
    ↓ archive
tasks/done/[task-name].md
```

### Task Spec Template

Every task gets a spec file with:
- **Requirements** - What needs to be done
- **Success Criteria** - How to verify completion
- **Execution Log** - What was actually done
- **Verification** - Test results, deployment status

---

## Session Hygiene

### Signs of Context Rot

- Claude references changes it "made earlier" but `git status` shows nothing
- Repeated attempts at the same fix
- Confusion about current file state

### Recovery

```bash
# Check actual state
git status
git diff

# If context is polluted, commit and restart
git add . && git commit -m "checkpoint: saving progress"
claude  # Fresh session
```

---

## Cost Monitoring

If cost tracking is enabled, monitor usage:

```bash
# View agent usage log
cat /tmp/claude-agent-usage.log

# View model API calls
cat /tmp/model-calls.log
```

**Healthy session:**
- Many `ollama:*` calls (FREE)
- Few `claude:*` or `gemini:*` calls (PAID)

**Unhealthy session:**
- @local-coder calls showing `claude:haiku` (should be Ollama)
- Excessive @overseer calls (expensive)

---

## Quick Reference

| Want to... | Say... |
|------------|--------|
| Start a task | "Let's work on [task]" |
| Write code | "Add [feature] to [file]" |
| Debug issue | "This is failing with [error]" |
| Security review | "Review [file] for vulnerabilities" |
| Architecture decision | "Should we [option A] or [option B]?" |
| Commit changes | "Commit with message about [what changed]" |
| End session | "Task complete, let's wrap up" |
