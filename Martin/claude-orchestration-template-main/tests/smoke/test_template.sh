#!/bin/bash
# tests/smoke/test_template.sh - Validate template produces working project

set -e

TEMPLATE_DIR="${TEMPLATE_DIR:-$(dirname "$0")/../..}"
TEST_DIR="${TEST_DIR:-/tmp/smoke-test-$$}"

echo "=== Smoke Test: Template Validation ==="
echo "   Template: $TEMPLATE_DIR"
echo "   Test dir: $TEST_DIR"
echo ""

# Cleanup on exit
cleanup() {
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test 1: Copier copy works
echo "1. Testing copier copy..."
copier copy "$TEMPLATE_DIR" "$TEST_DIR" \
    --trust \
    --data project_name=smoke-test \
    --data project_description="Smoke test project" \
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
    --data include_pre_commit=true \
    --data enable_task_system=true \
    --data enable_cost_tracking=true

[[ -d "$TEST_DIR/smoke-test" ]] || { echo "FAIL: Project directory not created"; exit 1; }
echo "   OK: Project created"

cd "$TEST_DIR/smoke-test"

# Test 2: Required files exist
echo "2. Checking required files..."
required_files=(
    "CLAUDE.md"
    ".claude/settings.json"
    ".claude/agents/local-coder.md"
    ".claude/agents/code-sentinel.md"
    ".claude/agents/gemini-overseer.md"
    ".claude/hooks/pre-tool-use.sh"
    ".claude/hooks/pre-tool-use.d/00-core-security-gate.sh"
    ".claude/hooks/pre-tool-use.d/01-core-enforce-delegation.sh"
    ".env.template"
    "scripts/bootstrap.sh"
    "tasks/master.md"
    "tasks/templates/task_spec.md"
    ".gitignore"
)

for file in "${required_files[@]}"; do
    [[ -f "$file" ]] || { echo "FAIL: Missing: $file"; exit 1; }
done
echo "   OK: All required files present"

# Test 3: Jinja2 substitution worked
echo "3. Verifying variable substitution..."
if grep -q "{{ project_name }}" CLAUDE.md; then
    echo "FAIL: Unsubstituted Jinja2 variable in CLAUDE.md"
    exit 1
fi
if grep -q "smoke-test" CLAUDE.md; then
    echo "   OK: Project name substituted correctly"
else
    echo "FAIL: Project name not found in CLAUDE.md"
    exit 1
fi

# Test 4: Settings JSON is valid
echo "4. Validating settings.json..."
if ! jq . .claude/settings.json > /dev/null 2>&1; then
    echo "FAIL: settings.json is not valid JSON"
    exit 1
fi
echo "   OK: settings.json is valid JSON"

# Test 5: Scripts are executable
echo "5. Checking script permissions..."
[[ -x "scripts/bootstrap.sh" ]] || { echo "FAIL: bootstrap.sh not executable"; exit 1; }
[[ -x ".claude/hooks/pre-tool-use.sh" ]] || { echo "FAIL: pre-tool-use.sh not executable"; exit 1; }
echo "   OK: Scripts are executable"

# Test 6: Gitignore configured
echo "6. Checking .gitignore..."
grep -q "^\.env$" .gitignore || { echo "FAIL: .env not in .gitignore"; exit 1; }
echo "   OK: Gitignore configured correctly"

# Test 7: Hook dispatchers exist
echo "7. Checking hook dispatchers..."
dispatchers=(
    ".claude/hooks/pre-tool-use.sh"
    ".claude/hooks/post-tool-use.sh"
    ".claude/hooks/subagent-stop.sh"
    ".claude/hooks/user-prompt-submit.sh"
)
for d in "${dispatchers[@]}"; do
    [[ -f "$d" ]] || { echo "FAIL: Missing dispatcher: $d"; exit 1; }
done
echo "   OK: All dispatchers present"

echo ""
echo "=== All smoke tests passed! ==="
