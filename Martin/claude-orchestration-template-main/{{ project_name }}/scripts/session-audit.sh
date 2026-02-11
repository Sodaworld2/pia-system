#!/bin/bash
# Session audit - runs on Stop hook
PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# Log session end
echo "$(date -Iseconds) SESSION_END" >> "$PROJECT_ROOT/.claude/.state/sessions.log" 2>/dev/null || true

# Clean up temporary state
rm -f /tmp/claude-tool-history.log 2>/dev/null || true
