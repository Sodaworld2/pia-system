#!/bin/bash
# Dispatcher for UserPromptSubmit hooks
# Template-managed - do not modify directly
# Add custom hooks to ./user-prompt-submit.d/ directory

HOOK_DIR="$(dirname "$0")/user-prompt-submit.d"

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
