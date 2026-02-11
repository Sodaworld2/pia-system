#!/bin/bash
# Core hook: Enforce delegation for coding tasks
INPUT=$(cat 2>/dev/null)

PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
STATE_DIR="${CLAUDE_STATE_DIR:-$PROJECT_ROOT/.claude/.state}"
AGENT_LOG="$STATE_DIR/agent-usage.log"

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .file_path // .path // ""' 2>/dev/null)

[[ -z "$FILE_PATH" || "$FILE_PATH" == "null" ]] && { echo "$INPUT"; exit 0; }

# Resolve symlinks
RESOLVED_PATH=$(realpath -m "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")
FILE_PATH="$RESOLVED_PATH"

# WHITELIST: System configuration
if [[ "$FILE_PATH" =~ \.claude/ ]] || [[ "$FILE_PATH" =~ CLAUDE\.md$ ]]; then
    echo "$INPUT"
    exit 0
fi

# Case-insensitive extension matching
shopt -s nocasematch
EXT="${FILE_PATH##*.}"

# WHITELIST: Non-code files
case "$EXT" in
    md|txt|log|csv|yaml|yml|json)
        echo "$INPUT"
        exit 0
        ;;
esac

# CODE FILES: Require agent delegation
CODE_EXTENSIONS="sh|bash|py|python|js|javascript|ts|typescript|jsx|tsx|go|rs|rb|pl|php|java|c|cpp|h|hpp|cs"

if [[ "$EXT" =~ ^($CODE_EXTENSIONS)$ ]]; then
    if [[ -f "$AGENT_LOG" ]]; then
        AGENT_RAN=$(grep -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}.*AGENT_COMPLETED" "$AGENT_LOG" 2>/dev/null | tail -1)
        if [[ -n "$AGENT_RAN" ]]; then
            echo "$INPUT"
            exit 0
        fi
    fi

    echo "" >&2
    echo "============================================" >&2
    echo "BLOCKED: Delegate coding tasks to agents!" >&2
    echo "============================================" >&2
    echo "File: $FILE_PATH" >&2
    echo "Use Task tool with subagent_type=local-coder" >&2
    echo "============================================" >&2
    exit 2
fi

echo "$INPUT"
exit 0
