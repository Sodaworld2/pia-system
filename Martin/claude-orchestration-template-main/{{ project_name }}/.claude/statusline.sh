#!/bin/bash
# Status line for Claude Code - shows current context
PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")
TASK_COUNT=$(find "$PROJECT_ROOT/tasks/detail" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

echo "${BRANCH} | ${TASK_COUNT} active tasks"
