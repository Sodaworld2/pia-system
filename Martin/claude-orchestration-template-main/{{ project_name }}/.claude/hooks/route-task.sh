#!/bin/bash
# UserPromptSubmit hook - route tasks and inject delegation reminders
INPUT=$(cat 2>/dev/null)
# Pass through - routing logic can be extended
echo "$INPUT"
