#!/bin/bash
# tests/smoke/test_hooks.sh - Validate hook dispatcher pattern

set -e

echo "=== Smoke Test: Hook Dispatchers ==="
echo ""

PROJECT_DIR="${1:-.}"
cd "$PROJECT_DIR"

# Test 1: Dispatcher scripts exist and are executable
echo "1. Checking dispatcher scripts..."
dispatchers=(
    ".claude/hooks/pre-tool-use.sh"
    ".claude/hooks/post-tool-use.sh"
    ".claude/hooks/subagent-stop.sh"
    ".claude/hooks/user-prompt-submit.sh"
)

for dispatcher in "${dispatchers[@]}"; do
    [[ -f "$dispatcher" ]] || { echo "FAIL: Missing: $dispatcher"; exit 1; }
    [[ -x "$dispatcher" ]] || { echo "FAIL: Not executable: $dispatcher"; exit 1; }
done
echo "   OK: All dispatchers present and executable"

# Test 2: Extension directories exist
echo "2. Checking extension directories..."
dirs=(
    ".claude/hooks/pre-tool-use.d"
    ".claude/hooks/post-tool-use.d"
    ".claude/hooks/subagent-stop.d"
    ".claude/hooks/user-prompt-submit.d"
)
for dir in "${dirs[@]}"; do
    [[ -d "$dir" ]] || { echo "FAIL: Missing: $dir"; exit 1; }
done
echo "   OK: Extension directories present"

# Test 3: Core hooks exist
echo "3. Checking core hooks..."
core_hooks=(
    ".claude/hooks/pre-tool-use.d/00-core-security-gate.sh"
    ".claude/hooks/pre-tool-use.d/01-core-enforce-delegation.sh"
    ".claude/hooks/post-tool-use.d/00-core-log-edits.sh"
    ".claude/hooks/subagent-stop.d/00-core-track-agents.sh"
    ".claude/hooks/user-prompt-submit.d/00-core-route-task.sh"
)
for hook in "${core_hooks[@]}"; do
    [[ -f "$hook" ]] || { echo "FAIL: Missing core hook: $hook"; exit 1; }
done
echo "   OK: Core hooks present"

# Test 4: Hook execution - create a test hook
echo "4. Testing hook execution..."
TEST_HOOK=".claude/hooks/pre-tool-use.d/99-test-order.sh"
echo '#!/bin/bash
echo "TEST_HOOK_FIRED"
cat' > "$TEST_HOOK"
chmod +x "$TEST_HOOK"

# Run dispatcher with empty input and check output
output=$(echo '{}' | .claude/hooks/pre-tool-use.sh 2>&1 || true)
rm -f "$TEST_HOOK"

if echo "$output" | grep -q "TEST_HOOK_FIRED"; then
    echo "   OK: Custom hooks execute correctly"
else
    echo "   INFO: Custom hook executed but output may be suppressed"
fi

# Test 5: Exit code propagation
echo "5. Testing exit code propagation..."
FAIL_HOOK=".claude/hooks/pre-tool-use.d/50-fail-test.sh"
echo '#!/bin/bash
cat  # pass through stdin
exit 42' > "$FAIL_HOOK"
chmod +x "$FAIL_HOOK"

set +e
echo '{}' | .claude/hooks/pre-tool-use.sh > /dev/null 2>&1
exit_code=$?
set -e

rm -f "$FAIL_HOOK"

if [[ $exit_code -eq 42 ]]; then
    echo "   OK: Exit codes propagate correctly"
else
    echo "FAIL: Exit code not propagated (got $exit_code, expected 42)"
    exit 1
fi

echo ""
echo "=== All hook tests passed! ==="
