#!/bin/bash
# PostToolUse hook - track model API calls for cost awareness
INPUT=$(cat 2>/dev/null)
PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOG_FILE="$PROJECT_ROOT/.claude/.state/model-calls.log"

mkdir -p "$(dirname "$LOG_FILE")"

TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null)
MODEL=$(echo "$INPUT" | jq -r '.tool_input.model // "default"' 2>/dev/null)

echo "$(date -Iseconds) $TOOL model=$MODEL" >> "$LOG_FILE"
