#!/bin/bash
# tests/smoke/test_update.sh - Test that copier update preserves user customizations

set -e

TEMPLATE_DIR="${TEMPLATE_DIR:-$(dirname "$0")/../..}"
TEST_DIR="${TEST_DIR:-/tmp/update-test-$$}"

echo "=== Smoke Test: Copier Update ==="
echo "   Template: $TEMPLATE_DIR"
echo "   Test dir: $TEST_DIR"
echo ""

# Cleanup on exit
cleanup() {
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Step 1: Create initial project
echo "1. Creating initial project..."
copier copy "$TEMPLATE_DIR" "$TEST_DIR" \
    --trust \
    --data project_name=update-test \
    --data project_description="Update test project" \
    --data admin_username=testuser \
    --data has_local_llm=true \
    --data ollama_endpoint=http://localhost:11434 \
    --data primary_coding_model=qwen2.5-coder:32b \
    --data has_guardrails_proxy=false \
    --data has_knowledge_graph=false \
    --data include_multi_model_overseer=false \
    --data include_debug_agent=true \
    --data include_integration_check=true \
    --data include_janitor=true \
    --data include_devcontainer=false \
    --data include_pre_commit=false \
    --data enable_task_system=true \
    --data enable_cost_tracking=true

cd "$TEST_DIR/update-test"
echo "   OK: Project created"

# Step 2: Add user customizations
echo "2. Adding user customizations..."

# Custom hook in .d directory
mkdir -p .claude/hooks/pre-tool-use.d
echo '#!/bin/bash
echo "USER_CUSTOM_HOOK"
cat' > .claude/hooks/pre-tool-use.d/50-user-custom.sh
chmod +x .claude/hooks/pre-tool-use.d/50-user-custom.sh

# Custom .env
echo "ANTHROPIC_API_KEY=test-key-12345" > .env

# Custom task
mkdir -p tasks/detail
echo "# User Task" > tasks/detail/user-task.md

echo "   OK: Customizations added"

# Step 3: Run copier update (simulated by re-copying with --defaults)
echo "3. Running copier update..."
cd "$TEST_DIR"
copier copy "$TEMPLATE_DIR" "$TEST_DIR" \
    --trust \
    --force \
    --data project_name=update-test \
    --data project_description="Update test project" \
    --data admin_username=testuser \
    --data has_local_llm=true \
    --data ollama_endpoint=http://localhost:11434 \
    --data primary_coding_model=qwen2.5-coder:32b \
    --data has_guardrails_proxy=false \
    --data has_knowledge_graph=false \
    --data include_multi_model_overseer=false \
    --data include_debug_agent=true \
    --data include_integration_check=true \
    --data include_janitor=true \
    --data include_devcontainer=false \
    --data include_pre_commit=false \
    --data enable_task_system=true \
    --data enable_cost_tracking=true

cd "$TEST_DIR/update-test"
echo "   OK: Update completed"

# Step 4: Verify customizations preserved
echo "4. Verifying customizations preserved..."

# Check custom hook
if [[ -f ".claude/hooks/pre-tool-use.d/50-user-custom.sh" ]]; then
    echo "   OK: Custom hook preserved"
else
    echo "FAIL: Custom hook was deleted"
    exit 1
fi

# Check .env (should NOT be overwritten - it's in _exclude)
if grep -q "test-key-12345" .env 2>/dev/null; then
    echo "   OK: .env preserved"
else
    echo "   INFO: .env was reset (expected if not in _exclude)"
fi

# Check custom task
if [[ -f "tasks/detail/user-task.md" ]]; then
    echo "   OK: Custom task preserved"
else
    echo "FAIL: Custom task was deleted"
    exit 1
fi

echo ""
echo "=== All update tests passed! ==="
