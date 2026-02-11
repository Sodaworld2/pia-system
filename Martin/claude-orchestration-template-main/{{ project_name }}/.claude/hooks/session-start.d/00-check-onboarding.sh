#!/bin/bash
# Check if onboarding is needed on session start

set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
ONBOARDED_FLAG="$PROJECT_ROOT/.claude/.state/onboarded"

# If already onboarded, skip
if [ -f "$ONBOARDED_FLAG" ]; then
    exit 0
fi

NEEDS_ONBOARDING=false
REASONS=()

# Check 1: No PLAN.md exists (project not initialized)
if [ ! -f "$PROJECT_ROOT/PLAN.md" ]; then
    NEEDS_ONBOARDING=true
    REASONS+=("No project plan found")
fi

# Check 2: No tasks in master.md
if [ ! -f "$PROJECT_ROOT/tasks/master.md" ]; then
    NEEDS_ONBOARDING=true
    REASONS+=("No task backlog found")
fi

if [ "$NEEDS_ONBOARDING" = true ]; then
    mkdir -p "$PROJECT_ROOT/.claude/.state"
    cat << 'EOF'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Welcome! This project needs initial setup.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run /onboard to configure your project.

This will:
  1. Set up network access (Tailscale)
  2. Configure local LLM and review APIs
  3. Interview you about your project
  4. Create an initial project plan

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF
fi

exit 0
