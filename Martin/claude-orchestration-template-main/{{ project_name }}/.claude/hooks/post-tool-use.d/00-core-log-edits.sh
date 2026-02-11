#!/bin/bash
# Core hook: Log all edit/write operations
INPUT=$(cat 2>/dev/null)
PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOG_FILE="$PROJECT_ROOT/.claude/.state/edit-history.log"

mkdir -p "$(dirname "$LOG_FILE")"

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .file_path // "unknown"' 2>/dev/null)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null)

echo "$(date -Iseconds) $TOOL $FILE_PATH" >> "$LOG_FILE"
