#!/bin/bash
# Dispatcher for PostToolUse hooks
# Template-managed - do not modify directly
# Add custom hooks to ./post-tool-use.d/ directory

HOOK_DIR="$(dirname "$0")/post-tool-use.d"

# Exit if directory doesn't exist
[[ ! -d "$HOOK_DIR" ]] && exit 0

# Capture stdin for passing to each hook
INPUT=$(cat)

# Run all executable scripts in order
for script in "$HOOK_DIR"/*.sh; do
    [[ -x "$script" ]] || continue
    echo "$INPUT" | "$script"
    exit_code=$?
    # Stop on first failure (non-zero exit)
    [[ $exit_code -ne 0 ]] && exit $exit_code
done

exit 0
