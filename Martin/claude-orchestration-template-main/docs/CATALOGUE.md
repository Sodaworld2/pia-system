# Agent & Skill Catalogue

Complete reference for all agents and skills available in this template.

---

## Agents Overview

Agents are specialized Claude instances launched via the `Task` tool. Each has specific tools and instructions optimized for their role.

### Cost Legend

| Symbol | Meaning |
|--------|---------|
| FREE | Uses local Ollama (no cloud cost) |
| PAID | Uses cloud API (Gemini, OpenAI, Claude) |
| HYBRID | Starts FREE, escalates to PAID if needed |

---

## Coding Agents

### @local-coder
**Cost:** FREE (Ollama on local GPU)
**Enabled:** When `has_local_llm=true`

Primary coding agent. Drafts code using local Qwen model.

**When to use:**
- Writing new functions/classes
- Refactoring existing code
- Adding features
- Bug fixes with clear requirements

**Example:**
```
Add input validation to the user registration endpoint
```

**Tools:** Read, Grep, Glob, Edit, Write, `mcp__ollama__ollama_chat`

---

### @debug
**Cost:** HYBRID (FREE Ollama → PAID escalation)
**Enabled:** When `include_debug_agent=true`

Deep-dive debugging with autonomous test loops (Ralph Wiggum pattern).

**When to use:**
- Tests failing repeatedly
- Unclear root cause
- Need systematic investigation
- Multiple hypotheses to test

**Example:**
```
Tests keep failing with KeyError on 'user_id'. I've tried checking the payload structure.
```

**Features:**
- Runs iterative test loops
- Logs to task detail files
- Escalates to paid models if stuck
- Graph queries for call chain analysis

**Tools:** Read, Grep, Glob, Bash, Write, Task, `mcp__ollama__*`, `mcp__gemini__*`, `mcp__openai__*`

---

### @integration-check
**Cost:** FREE (local tools)
**Enabled:** When `include_integration_check=true`

Post-execution verification. Ensures new code is properly imported and wired.

**When to use:**
- After creating new modules/packages
- After significant refactors
- When you suspect orphaned code
- Before marking infrastructure tasks complete

**Example:**
```
Verify the new email service is imported in main.py and registered with the router
```

**Detects:**
- Orphaned files (created but never imported)
- Missing registrations
- Broken import chains

**Tools:** Read, Grep, Glob, Bash, Task, `mcp__ollama__*`, graph queries

---

### @janitor
**Cost:** HYBRID (FREE Ollama → PAID escalation)
**Enabled:** When `include_janitor=true`

Directory and codebase cleanup agent.

**When to use:**
- Consolidating scattered files
- Removing unused code
- Organizing project structure
- Post-refactor cleanup

**Example:**
```
Clean up the root directory - move scripts to scripts/, docs to docs/
```

**Features:**
- Phase-based cleanup (analyze → plan → execute)
- Dry-run mode (preview changes)
- Archive-first policy (never deletes without backup)
- Multi-model escalation for uncertain decisions

**Tools:** Read, Grep, Glob, Bash, Write, `mcp__ollama__*`, `mcp__gemini__*`

---

## Review Agents

### @code-sentinel
**Cost:** PAID (multi-model security)
**Enabled:** Always included

Multi-model security auditor. Runs Gemini, OpenAI, AND Grok analysis.

**When to use:**
- Reviewing authentication code
- Checking for injection vulnerabilities
- Validating secrets handling
- Before deploying security-sensitive changes

**Example:**
```
Review the OAuth implementation for security vulnerabilities
```

**Checks:**
- OWASP Top 10 vulnerabilities
- Secrets in code
- Injection points (SQL, XSS, command)
- Authentication/authorization flaws

**Tools:** Read, Grep, Glob, Task, `mcp__gemini__*`, `mcp__openai__*`, `mcp__grok__*`

---

### @gemini-overseer
**Cost:** PAID (Gemini Pro only)
**Enabled:** Always included

Single-model architecture reviewer using Gemini.

**When to use:**
- Quick architecture checks
- Design pattern validation
- Code quality review
- When full @overseer panel is overkill

**Example:**
```
Review this service architecture for coupling issues
```

**Tools:** Read, Grep, Glob, Task, `mcp__gemini__gemini-query`, `mcp__gemini__gemini-analyze-code`

---

### @openai-overseer
**Cost:** PAID (OpenAI GPT-4)
**Enabled:** Referenced in CLAUDE.md

Single-model reviewer using OpenAI.

**When to use:**
- Alternative perspective to Gemini
- When Gemini is unavailable
- Quick second opinion

**Example:**
```
Get OpenAI's take on this database schema design
```

**Tools:** Read, Grep, Glob, Task, `mcp__openai__openai_chat`

---

### @overseer
**Cost:** PAID (Premium - multi-model panel)
**Enabled:** When `include_multi_model_overseer=true`

Full multi-model architecture review panel.

**When to use:**
- High-stakes architectural decisions
- Major refactoring plans
- Technology selection
- System design review

**Example:**
```
Review the proposed microservices split - is this the right approach?
```

**Panel:**
- Gemini Pro (pattern/structure focus)
- OpenAI GPT-4 (logic/flow focus)
- Grok (devil's advocate, if enabled)
- Claude Opus (synthesis)

**Tools:** Read, Grep, Glob, Task, `mcp__gemini__*`, `mcp__openai__*`, `mcp__grok__*`

---

## Utility Agents

### @local-orchestrator
**Cost:** FREE (Ollama)
**Enabled:** Referenced (requires Ollama)

Routes ambiguous tasks and detects stuck loops.

**When to use:**
- Unclear which agent should handle a task
- Suspected infinite loop
- Need task decomposition

**Example:**
```
I'm stuck - help me figure out what's wrong
```

**Tools:** Read, Glob, `mcp__ollama__ollama_chat`

---

### @lite-general
**Cost:** FREE (Ollama)
**Enabled:** Referenced (requires Ollama)

General-purpose agent for simple tasks.

**When to use:**
- File reading and exploration
- Running tests
- Simple searches
- Quick lookups

**Example:**
```
Find all files that import the UserService class
```

**Tools:** Read, Grep, Glob, Bash, `mcp__ollama__ollama_chat`

---

### @local-git
**Cost:** FREE (Ollama)
**Enabled:** Referenced (requires Ollama)

Git operations with locally-generated messages.

**When to use:**
- Commit messages
- PR summaries
- Branch names
- Changelog entries

**Example:**
```
Commit these changes with a descriptive message
```

**Tools:** Bash, `mcp__ollama__ollama_chat`

---

### @archivist
**Cost:** FREE (Claude session)
**Enabled:** Referenced

Knowledge curator for notes and documentation.

**When to use:**
- Managing Obsidian vault
- Creating documentation
- Organizing knowledge

**Example:**
```
Add a note about the webhook retry logic to my vault
```

**Tools:** Read, Grep, Glob, Edit, Task

---

## Agent Selection Guide

| Task Type | Primary Agent | Fallback |
|-----------|---------------|----------|
| Write new code | @local-coder | Claude direct |
| Debug failing tests | @debug | @local-coder |
| Verify integration | @integration-check | Manual grep |
| Security review | @code-sentinel | @gemini-overseer |
| Quick architecture check | @gemini-overseer | @openai-overseer |
| Major design decision | @overseer | @gemini-overseer |
| Cleanup files | @janitor | Manual |
| Git operations | @local-git | Claude direct |
| Simple lookups | @lite-general | Read tool |

---

## Skills Reference

Skills are invoked with `/skill-name` syntax.

### Configuration Skills

| Skill | Purpose |
|-------|---------|
| `/create-hook` | Create new Claude Code hooks |
| `/create-skill` | Create new skills |
| `/create-subagent` | Create new agent definitions |
| `/create-slash-command` | Create slash commands |
| `/create-mcp-servers` | Create MCP server integrations |

### Workflow Skills

| Skill | Purpose |
|-------|---------|
| `/create-task` | Create task with spec file |
| `/create-plan` | Create project/phase plans |
| `/create-prompt` | Create prompts for agent execution |
| `/run-prompt` | Execute prompts with teaming checks |
| `/todo` | List and manage tasks |

### Thinking Skills (Zero Cost)

| Skill | Purpose |
|-------|---------|
| `/consider:pareto` | 80/20 analysis |
| `/consider:first-principles` | Break down to fundamentals |
| `/consider:inversion` | Solve backwards |
| `/consider:5-whys` | Root cause analysis |
| `/consider:occams-razor` | Simplest explanation |

### Research Skills

| Skill | Purpose |
|-------|---------|
| `/research:deep-dive` | Comprehensive investigation |
| `/research:technical` | Implementation approaches |
| `/research:options` | Compare alternatives |
| `/research:feasibility` | Reality check |

### Debugging Skills

| Skill | Purpose |
|-------|---------|
| `/debug` | Expert debugging methodology |
| `/debug-like-expert` | Deep analysis mode |

---

## Adding Custom Agents

Create a new agent definition:

```bash
cat > .claude/agents/my-agent.md << 'EOF'
# My Custom Agent

Purpose: [What this agent does]

## Instructions

[Detailed instructions for the agent]

## Tools Available

- Read, Grep, Glob
- [Other tools as needed]

## When to Use

- [Scenario 1]
- [Scenario 2]
EOF
```

Reference it in `CLAUDE.md` agent table.

---

## Adding Custom Skills

Create a skill in `.claude/skills/`:

```bash
mkdir -p .claude/skills/my-skill
cat > .claude/skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: What this skill does
---

# My Skill

Instructions for the skill...
EOF
```

Invoke with `/my-skill`.
