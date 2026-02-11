---
name: onboard
description: Interactive setup wizard for new projects. Configures API keys, infrastructure, and creates initial project plan.
---

# Onboard Skill

Interactive onboarding wizard that guides users through project setup.

## Overview

This skill walks through:
1. **Environment Check** - Current setup status
2. **Network Setup** - Tailscale for remote access
3. **Infrastructure** - Ollama, Gemini, OpenAI (optional)
4. **Verification** - Confirm everything works
5. **Project Interview** - What are you building?
6. **Research Plan** - Generate initial investigation tasks
7. **Task Creation** - Populate backlog
8. **Summary** - Central planning doc and next steps

Note: Anthropic API key is already configured (you're running Claude Code).

## Instructions

When this skill is invoked, follow this sequence:

### Phase 1: Welcome & Environment Check

First, check the current setup state:

```bash
# Check if .env exists
[ -f .env ] && echo "ENV_EXISTS=true" || echo "ENV_EXISTS=false"

# Check Ollama connectivity
curl -s --max-time 2 ${OLLAMA_ENDPOINT:-http://localhost:11434}/api/tags >/dev/null 2>&1 && echo "OLLAMA_REACHABLE=true" || echo "OLLAMA_REACHABLE=false"
```

Display welcome message:

```
Welcome to your new Claude Code project!

I'll help you get everything configured and create an initial plan
for your project. This takes about 5 minutes.

Current status:
- .env file: [exists/missing]
- Local LLM (Ollama): [connected/not detected]
```

### Phase 2: Network & Connectivity

**Question: Tailscale Setup**
```
Do you have Tailscale installed?
(Tailscale is a zero-config VPN that lets you securely access machines on your network from anywhere)

Options:
- Yes, already installed
- No, install it now
- Skip (I don't need remote access)
```

If "install it now":
```bash
./scripts/install-tailscale.sh
```

Or manually:
```bash
# Linux
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# macOS
brew install --cask tailscale
```

After installation, Tailscale lets you access:
- Local LLMs on home servers (e.g., `http://gpu-server:11434`)
- Development databases
- Internal services

### Phase 3: Infrastructure Configuration

Use AskUserQuestion to gather infrastructure settings:

**Question 1: Local LLM Setup**
```
Do you have a local LLM available (Ollama)?

Options:
- Yes, running on localhost:11434 (default)
- Yes, on a different endpoint
- No, I'll use Claude for everything (higher cost)
```

If different endpoint, ask for URL and update .env.

**Question 2: Multi-Model Review (Optional)**
```
Do you want multi-model code review capabilities?
This uses Gemini/OpenAI APIs for architecture and security reviews.

Options:
- Yes, I have API keys for Gemini and/or OpenAI
- No, Claude-only is fine for now
```

If yes, ask for each key:
- GEMINI_API_KEY (aistudio.google.com)
- OPENAI_API_KEY (platform.openai.com)
- XAI_API_KEY (console.x.ai) - optional

### Phase 4: Verify Configuration

Run verification checks:

```bash
# Test Ollama if enabled
if [ -n "$OLLAMA_ENDPOINT" ]; then
  curl -s "$OLLAMA_ENDPOINT/api/tags" | jq -r '.models[0].name' && echo "Ollama: OK"
fi

# Check hooks are executable
ls -la .claude/hooks/*.sh | head -3
```

Display summary:
```
Configuration Summary:
- Local LLM: [connected to localhost:11434 / not configured]
- Gemini API: [configured / not configured]
- OpenAI API: [configured / not configured]
- Hooks: [executable]
```

### Phase 5: Project Interview

Interview the user about their project. This is conversational - let them describe things in their own words. After each question, offer:
- "Tell me more" to explore deeper
- "That's enough, let's move on" to proceed

**Question 1: The Problem**
```
What problem are you trying to solve?

Don't worry about technical details yet - just describe the pain point
or opportunity you're addressing.
```

**Question 2: Who Is It For?**
```
Who will use this?

Options:
- Just me (personal tool)
- My team/company (internal tool)
- End users/customers (product)
- Other developers (library/API)
```

**Question 3: What Does Success Look Like?**
```
Imagine it's working perfectly. What can you do that you couldn't before?

Describe the ideal outcome in concrete terms.
```

**Question 4: Current State**
```
Where are you starting from?

Options:
- Blank slate (greenfield)
- Have some code already
- Existing system to modify
- Just exploring ideas
```

**Question 5: First Step (Optional)**
```
What's the smallest useful thing we could build first?

Or say "skip" and we'll figure it out together.
```

**After Interview:**
```
Thanks! I have a good picture now.

Want to explore this more deeply before we start coding?

Options:
- Yes, let's do research first (/research:deep-dive)
- Yes, let's create a detailed plan (/create-plan)
- No, let's just start building
```

If they want research, guide them:
```
To kick off deep research, say:

  /research:deep-dive [your topic]

For example:
  /research:deep-dive weather APIs for CLI tools
  /research:deep-dive best practices for Python CLIs

This will investigate options, tradeoffs, and recommendations
before we commit to an approach.
```

### Phase 6: Generate Research Plan

Based on the interview, create an initial research plan using `/create-plan`:

Create file `PLAN.md` with:

```markdown
# Project: {{ project_name }}

## The Problem
{{ problem from interview }}

## Who Is It For
{{ who is it for }}

## What Success Looks Like
{{ success description from interview }}

## Tech Stack
Python

## Current State
{{ current state from interview }}

---

## Phase 0: Research & Discovery

If the domain is unfamiliar, start here:

```
/research:deep-dive [your topic]
```

### Research Questions
- What approaches exist for this problem?
- What libraries/tools are available?
- What are the tradeoffs?

---

## Phase 1: First Working Version

### Goal
{{ first step from interview, or "Get something working end-to-end" }}

### Tasks
- [ ] {{ generated based on project type }}

### Done When
- Can demonstrate basic functionality
- Core flow works even if rough

---

## Future Phases
(To be defined after Phase 1)

---

## Commands Reference

| Command | When to Use |
|---------|-------------|
| `/research:deep-dive [topic]` | Explore unfamiliar territory |
| `/create-plan` | Build detailed phase plan |
| `/todo` | See current task list |
| `/consider:first-principles` | Break down complex problems |
```

### Phase 7: Create Task Entries

Add initial tasks to `tasks/master.md`:

```markdown
## Backlog

### Research (if needed)
- [ ] [RESEARCH] Explore: {{ problem domain }}

### First Version
- [ ] [FEAT] {{ first step or "Get basic version working" }}
```

Keep it minimal - the user can expand after research.

### Phase 8: Summary & Next Steps

Display final summary:

```
Setup Complete!

Project: {{ project_name }}
Problem: {{ problem from interview }}
For: {{ who is it for }}
Success: {{ what success looks like }}

Created:
- PLAN.md (project roadmap)
- tasks/master.md (initial backlog)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

What would you like to do next?

📚 RESEARCH FIRST (recommended for new domains)
   /research:deep-dive [topic]
   Example: "/research:deep-dive weather APIs for Python CLI"

📋 CREATE DETAILED PLAN
   /create-plan
   Walks through phases, milestones, and success criteria

🚀 START BUILDING
   Just describe what you want to build and I'll help

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tip: If you're unsure where to start, try:
  "What's the simplest way to get {{ first step }} working?"

Tip: Each session, complete ONE task, commit, then start fresh.
This prevents context rot and keeps work focused.

Happy building!
```

## Invocation

This skill can be invoked:
- Manually: `/onboard`
- Automatically: On first session if .env is incomplete (via SessionStart hook)

## Files Modified

- `.env` - Infrastructure endpoints (Ollama, Gemini, OpenAI)
- `PLAN.md` - Project roadmap (created)
- `tasks/master.md` - Initial tasks added
- `docs/DECISIONS.md` - Tech decisions (created if needed)
