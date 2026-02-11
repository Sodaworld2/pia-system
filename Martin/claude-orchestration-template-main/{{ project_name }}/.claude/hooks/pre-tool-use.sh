#!/bin/bash
# Dispatcher for PreToolUse hooks
# Template-managed - do not modify directly
# Add custom hooks to ./pre-tool-use.d/ directory

HOOK_DIR="$(dirname "$0")/pre-tool-use.d"

# Exit if directory doesn't exist
[[ ! -d "$HOOK_DIR" ]] && exit 0

# Capture stdin for passing to each hook
INPUT=$(cat)

# Run all executable scripts in order
for script in "$HOOK_DIR"/*.sh; do
    [[ -x "$script" ]] || continue
    # Pass input to each hook via stdin, capture modified output
    OUTPUT=$(echo "$INPUT" | "$script")
    exit_code=$?
    # Stop on first failure (non-zero exit)
    if [[ $exit_code -ne 0 ]]; then
        echo "$OUTPUT"
        exit $exit_code
    fi
    # Use modified output as input for next hook
    INPUT="$OUTPUT"
done

# Output final result
echo "$INPUT"
exit 0
