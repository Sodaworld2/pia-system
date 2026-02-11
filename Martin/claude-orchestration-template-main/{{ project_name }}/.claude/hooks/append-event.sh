#!/bin/bash
# Usage: echo '{"ts":"...","hook":"..."}' | ./append-event.sh
# Atomically appends JSON event to events.jsonl using flock
# Also dual-writes to SQLite memory.db via Python (background, non-blocking)

STATE_DIR="${CLAUDE_STATE_DIR:-/home/martin/clawdbot-home/.claude/.state}"
EVENTS_FILE="$STATE_DIR/events.jsonl"
LOCK_FILE="$EVENTS_FILE.lock"

mkdir -p "$STATE_DIR" 2>/dev/null || exit 0

EVENT=$(cat)
[ -z "$EVENT" ] && exit 0

# Primary: JSONL (backward compatible)
(
  flock -x 200
  echo "$EVENT" >> "$EVENTS_FILE"
) 200>"$LOCK_FILE" 2>/dev/null || exit 0

# Secondary: SQLite (background, non-blocking)
echo "$EVENT" | python3 "$STATE_DIR/memory.py" append 2>/dev/null &

exit 0
