#!/bin/bash
INPUT=$(cat 2>/dev/null)
BLOCK=0
FILE_PATH=$(echo "$INPUT" | jq -r ".tool_input.file_path // .file_path // .path // \"\"" 2>/dev/null)

# Block modifying hook scripts (self-protection)
if [[ "$FILE_PATH" =~ \.claude/hooks/ ]] && [[ ! "$FILE_PATH" =~ \.d/ ]]; then
  echo "[BLOCKED: Cannot modify hook scripts directly. Use .d/ extensions.]" >&2
  exit 2
fi

# Block dangerous commands
if echo "$INPUT" | grep -qiE "rm\s+-rf|chmod\s+.*777|eval\s*\("; then
  BLOCK=1
fi
exit $BLOCK
