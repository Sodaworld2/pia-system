#!/bin/bash
# Core hook: Task routing and delegation injection
# Injects <system_instruction> directives for agent delegation
# Uses cumulative logic - all matching directives are output

INPUT=$(cat 2>/dev/null)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)

# Skip empty or very short prompts
[ ${#PROMPT} -lt 10 ] && exit 0

DIRECTIVES=""

# Security-sensitive tasks
if echo "$PROMPT" | grep -qiE "security|vulnerability|credential|password|auth|secret|api.?key|token"; then
  DIRECTIVES="${DIRECTIVES}
- SECURITY: You MUST delegate to @code-sentinel for security review before any changes."
fi

# Architecture/complex tasks
if echo "$PROMPT" | grep -qiE "architect|design|refactor|complex|integration|migration"; then
  DIRECTIVES="${DIRECTIVES}
- ARCHITECTURE: You MUST delegate to @local-orchestrator for routing (FREE on local LLM)."
fi

# Code generation tasks
if echo "$PROMPT" | grep -qiE "implement|create|build|write.*code|new.*feature|add.*function"; then
  DIRECTIVES="${DIRECTIVES}
- CODE: You MUST delegate to @local-coder for code drafting (FREE on local LLM)."
fi

# Stuck/debugging tasks
if echo "$PROMPT" | grep -qiE "stuck|error|fail|doesn.t work|broken|debug|not working"; then
  DIRECTIVES="${DIRECTIVES}
- DEBUGGING: You MUST delegate to @local-orchestrator first (FREE), then @gemini-overseer only if still stuck."
fi

# Knowledge/notes tasks
if echo "$PROMPT" | grep -qiE "note|obsidian|vault|remember|knowledge|document"; then
  DIRECTIVES="${DIRECTIVES}
- KNOWLEDGE: You MUST delegate to @archivist for vault management (FREE)."
fi

# Git operations (commit, PR, branch)
if echo "$PROMPT" | grep -qiE "commit|pull.?request|\bPR\b|branch|git"; then
  DIRECTIVES="${DIRECTIVES}
- GIT: You MUST delegate to @local-git for commit messages, PR summaries, branch names (FREE on local LLM)."
fi

# Research/exploration tasks
if echo "$PROMPT" | grep -qiE "research|explore|investigate|brainstorm|option|compare|which.*should"; then
  DIRECTIVES="${DIRECTIVES}
- RESEARCH: You MUST delegate to @gemini-overseer with gemini-brainstorm (PAID - use sparingly)."
fi

# Output accumulated directives in XML format
if [ -n "$DIRECTIVES" ]; then
  cat << XMLEOF
<system_instruction>
ROLE: You are the Lead Engineer (Orchestrator).
CONSTRAINT: You are FORBIDDEN from editing code files directly.
REQUIRED: You MUST delegate coding tasks to specialized agents.
WORKFLOW: 1) Analyze request 2) Delegate to appropriate agent 3) Review output before presenting to user

DETECTED TASK TYPES:${DIRECTIVES}
</system_instruction>
XMLEOF
fi

exit 0
