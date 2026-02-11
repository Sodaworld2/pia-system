#!/bin/bash
# Core hook: Track agent completion for delegation enforcement
# Logs agent completion with duration tracking

INPUT=$(cat 2>/dev/null)
[ -z "$INPUT" ] && exit 0

PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
STATE_DIR="$PROJECT_ROOT/.claude/.state"
LOG_FILE="$STATE_DIR/agent-usage.log"
AGENT_STACK="$STATE_DIR/agent_stack.txt"

mkdir -p "$STATE_DIR" 2>/dev/null || exit 0

# Extract agent info
agent_id=$(echo "$INPUT" | jq -r '.agent_id // ""' 2>/dev/null)
agent_type=$(echo "$INPUT" | jq -r '.agent_type // .subagent_type // "unknown"' 2>/dev/null)
timestamp=$(date -Iseconds)
unix_timestamp=$(date +%s)

[ -z "$agent_id" ] && exit 0

# Find and remove from stack, calculate duration
duration_ms=0
if [ -f "$AGENT_STACK" ]; then
  line=$(grep "^${agent_id}:" "$AGENT_STACK" 2>/dev/null | head -1)
  if [ -n "$line" ]; then
    grep -v "^${agent_id}:" "$AGENT_STACK" > "$AGENT_STACK.tmp" 2>/dev/null
    mv "$AGENT_STACK.tmp" "$AGENT_STACK" 2>/dev/null || rm -f "$AGENT_STACK.tmp"
    
    # Parse start timestamp and calculate duration
    start_ts=$(echo "$line" | cut -d: -f3)
    if [ -n "$start_ts" ] && [ "$start_ts" -gt 0 ] 2>/dev/null; then
      duration_ms=$(( (unix_timestamp - start_ts) * 1000 ))
    fi
  fi
fi

# Log completion
echo "$timestamp AGENT_COMPLETED: $agent_id ($agent_type) duration=${duration_ms}ms" >> "$LOG_FILE" 2>/dev/null

exit 0
