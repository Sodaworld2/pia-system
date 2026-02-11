#!/bin/bash
# Enforce skill usage for specific operations
# Blocks direct tool usage when a skill should be used instead
#
# Rules:
# 1. Block TaskCreate tool -> redirect to /create-task skill
# 2. Block Write to prompts/*.md -> redirect to /create-prompt skill
#
# Hook receives JSON via stdin with tool info
# Exit 0 = allow, Exit 2 = block with message

INPUT=$(cat 2>/dev/null)

# Extract tool name from hook input
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)

# Rule 1: Block TaskCreate tool entirely
if [[ "$TOOL_NAME" == "TaskCreate" ]]; then
    echo "" >&2
    echo "============================================" >&2
    echo "BLOCKED: Use /create-task skill instead!" >&2
    echo "============================================" >&2
    echo "Tool: $TOOL_NAME" >&2
    echo "" >&2
    echo "The /create-task skill ensures:" >&2
    echo "  - Proper task structure" >&2
    echo "  - Pipeline alignment" >&2
    echo "  - Detail file creation" >&2
    echo "============================================" >&2
    exit 2
fi

# Rule 2: Block Write to prompts/*.md files
if [[ "$TOOL_NAME" == "Write" ]]; then
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .file_path // ""' 2>/dev/null)

    [[ -z "$FILE_PATH" || "$FILE_PATH" == "null" ]] && exit 0

    # Resolve to absolute path for consistent matching
    RESOLVED_PATH=$(realpath -m "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")

    # Check if path matches prompts/*.md or prompts/**/*.md
    if [[ "$RESOLVED_PATH" =~ /prompts/[^/]+\.md$ ]] || \
       [[ "$RESOLVED_PATH" =~ /prompts/.+/[^/]+\.md$ ]]; then
        echo "" >&2
        echo "============================================" >&2
        echo "[WARNING] Use /create-prompt skill instead!" >&2
        echo "============================================" >&2
        echo "File: $FILE_PATH" >&2
        echo "" >&2
        echo "The /create-prompt skill ensures:" >&2
        echo "  - Proper prompt template structure" >&2
        echo "  - Pre-flight teaming checks" >&2
        echo "  - Integration planning" >&2
        echo "============================================" >&2
        exit 0  # Warn only, don't block (skills need Write access)
    fi
fi

# All other cases: allow
exit 0
