#!/bin/bash
# SubagentStart hook: Push to agent stack and append agent_start event
# Input JSON: agent_type, agent_id, possibly model and description
# Also stores prompt for Learning Lite routing history

STATE_DIR="${CLAUDE_STATE_DIR:-/home/martin/clawdbot-home/.claude/.state}"
HOOKS_DIR="${CLAUDE_HOOKS_DIR:-/home/martin/clawdbot-home/.claude/hooks}"
AGENT_STACK="$STATE_DIR/agent_stack.txt"
LEGACY_LOG="$STATE_DIR/agent-usage.log"
LOCK_FILE="$AGENT_STACK.lock"
PROMPTS_DIR="$STATE_DIR/agent_prompts"

mkdir -p "$STATE_DIR" "$PROMPTS_DIR" 2>/dev/null || exit 0

# Read full JSON input (may be multi-line)
input=$(cat 2>/dev/null)
[ -z "$input" ] && exit 0

# DEBUG: Log raw input to see all available fields
echo "$(date -Iseconds) RAW_INPUT: $input" >> "$STATE_DIR/hook-debug.log" 2>/dev/null

# Extract fields from input JSON
agent_id=$(echo "$input" | jq -r '.agent_id // ""' 2>/dev/null)
agent_type=$(echo "$input" | jq -r '.agent_type // ""' 2>/dev/null)
model=$(echo "$input" | jq -r '.model // ""' 2>/dev/null)
description=$(echo "$input" | jq -r '.description // ""' 2>/dev/null)

# Require agent_id and agent_type
[ -z "$agent_id" ] || [ -z "$agent_type" ] && exit 0

# Get timestamps
timestamp=$(date -Iseconds)
unix_timestamp=$(date +%s)
session_id="${CLAUDE_SESSION_ID:-unknown}"

# Push to agent stack (atomic with flock)
(
  flock -x 200
  echo "${agent_id}:${agent_type}:${unix_timestamp}" >> "$AGENT_STACK"
) 200>"$LOCK_FILE" 2>/dev/null || exit 0

# Store prompt for Learning Lite (used by SubagentStop to record routing)
# Try description first, fall back to checking for prompt field
prompt_text="$description"
if [ -z "$prompt_text" ] || [ "$prompt_text" = " " ]; then
  prompt_text=$(echo "$input" | jq -r '.prompt // ""' 2>/dev/null)
fi
if [ -n "$prompt_text" ] && [ "$prompt_text" != " " ]; then
  echo "$prompt_text" > "$PROMPTS_DIR/${agent_id}.prompt" 2>/dev/null || true
fi

# Build event JSON (escape special chars in description)
escaped_desc=$(echo "$description" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')
event=$(printf '{"ts":"%s","hook":"agent_start","session_id":"%s","agent_id":"%s","agent_type":"%s","model":"%s","description":"%s"}' \
  "$timestamp" "$session_id" "$agent_id" "$agent_type" "$model" "$escaped_desc")

# Append to events.jsonl via helper
echo "$event" | "$HOOKS_DIR/append-event.sh" 2>/dev/null || true

# Legacy log for backward compatibility
echo "$timestamp AGENT_START: $agent_id ($agent_type)" >> "$LEGACY_LOG" 2>/dev/null || true

exit 0
