#!/bin/bash
# SubagentStop hook - log agent completion
INPUT=$(cat 2>/dev/null)
PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOG_FILE="$PROJECT_ROOT/.claude/.state/agent-usage.log"

mkdir -p "$(dirname "$LOG_FILE")"

AGENT=$(echo "$INPUT" | jq -r '.subagent_type // .agent_type // "unknown"' 2>/dev/null)
echo "$(date -Iseconds) AGENT_COMPLETED $AGENT" >> "$LOG_FILE"
