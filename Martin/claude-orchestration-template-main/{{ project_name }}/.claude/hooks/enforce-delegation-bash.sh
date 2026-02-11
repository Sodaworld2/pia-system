#!/bin/bash
# Enforce delegation for bash commands that might edit code
INPUT=$(cat 2>/dev/null)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)

# Whitelist safe commands
if echo "$COMMAND" | grep -qE "^(git|ls|pwd|cat|head|tail|grep|find|curl|echo|test|mkdir|cd|ssh|scp)"; then
    echo "$INPUT"
    exit 0
fi

# Block direct code editing via bash
if echo "$COMMAND" | grep -qE "(sed|awk|perl|ruby|python).*(>|>>)|cat.*>.*\.(py|js|ts|sh|go)"; then
    echo "BLOCKED: Use Edit/Write tools or delegate to agents" >&2
    exit 2
fi

echo "$INPUT"
