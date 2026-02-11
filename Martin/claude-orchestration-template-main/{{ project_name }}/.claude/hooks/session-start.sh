#!/bin/bash
# SessionStart dispatcher - runs all hooks in session-start.d/
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_DIR="$SCRIPT_DIR/session-start.d"

if [ -d "$HOOK_DIR" ]; then
    for hook in "$HOOK_DIR"/*.sh; do
        [ -x "$hook" ] && "$hook"
    done
fi
exit 0
