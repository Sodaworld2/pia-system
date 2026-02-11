# Claude Code Orchestration Template

A portable template for Claude Code projects with agent delegation, cost-conscious routing, and multi-model review capabilities.

## Quick Start

```bash
# Clone and run setup
git clone https://github.com/voronerd/claude-orchestration-template.git
cd claude-orchestration-template
./setup.sh
source ~/.bashrc

# Create your project
copier copy . ~/my-project --trust
cd ~/my-project
./scripts/bootstrap.sh

# Start Claude Code
claude
```

That's it. The `setup.sh` script installs prerequisites (pipx, copier, etc.) and the `bootstrap.sh` sets up your project.

## Prerequisites & Infrastructure

### Required

| Requirement | Purpose |
|-------------|---------|
| [Claude Code CLI](https://claude.ai/code) | Core AI assistant (includes API access) |
| Python 3.10+ | Bootstrap scripts |
| Bash shell | Hook execution (Linux/macOS/WSL2) |

Note: Claude Code already has your Anthropic API key configured - no additional setup needed.

### Optional Infrastructure

The template supports additional infrastructure for enhanced capabilities:

| Infrastructure | Required For | Setup Complexity |
|----------------|--------------|------------------|
| **Ollama** | @local-coder, @lite-general, @local-git (FREE local LLM) | Low - `curl -fsSL https://ollama.ai/install.sh \| sh` |
| **Memgraph** | Knowledge graph MCP, code analysis | Medium - Docker or native install |
| **Gemini API** | @gemini-overseer, multi-model review | Low - API key only |
| **OpenAI API** | @openai-overseer, multi-model review | Low - API key only |
| **xAI/Grok API** | @grok agent in review panel | Low - API key only |

### Cost Tiers

The template routes work through a cost-conscious waterfall:

```
Tier 0 (FREE): Local Ollama models (qwen2.5-coder, etc.)
    ↓ if unavailable
Tier 1 (PAID): Claude Haiku for simple tasks
    ↓ if complex
Tier 2 (PAID): Claude Sonnet/Opus for complex tasks
```

**Without Ollama:** All coding tasks use Claude API (higher cost)
**With Ollama:** Most coding tasks use local GPU (zero cloud cost)

### Platform Notes

| Platform | Status | Notes |
|----------|--------|-------|
| Linux | ✅ Full support | Native |
| macOS | ✅ Full support | Native |
| Windows | ⚠️ WSL2 required | Hooks are bash scripts |
| Docker | ✅ DevContainer | Included if enabled |

## What's Included

### Core Features

- **Agent Delegation System**: Enforces code delegation to specialized agents
- **Hook Enforcement**: PreToolUse/PostToolUse hooks for safety and tracking
- **Cost-Conscious Routing**: Waterfall from FREE (local LLM) to PAID (cloud APIs)
- **Session Hygiene**: Prevents ghost code and context rot

### Agents (Conditional)

| Agent | Included By Default | Purpose |
|-------|---------------------|---------|
| @local-coder | If `has_local_llm` | FREE code generation via Ollama |
| @debug | Yes | Deep-dive debugging with test loops |
| @integration-check | Yes | Verify code wiring |
| @janitor | Yes | Codebase cleanup |
| @overseer | If `include_multi_model_overseer` | Multi-model architecture review |
| @code-sentinel | Yes | Security audit |

### Optional Features

- DevContainer configuration
- Pre-commit hooks for secret scanning
- Knowledge graph integration (Memgraph)
- Task management system

## Configuration

During `copier copy`, you'll be asked about:

### Required
- `project_name`: Your project identifier
- `project_description`: Brief description
- `admin_username`: Primary admin user

### Infrastructure
- `has_local_llm`: Do you have Ollama/vLLM?
- `ollama_endpoint`: URL for local LLM
- `has_guardrails_proxy`: Using a proxy for LLM requests?
- `has_knowledge_graph`: Using Memgraph for code analysis?

### Features
- `include_multi_model_overseer`: Enable Gemini + OpenAI + Grok panel?
- `include_debug_agent`: Include @debug agent?
- `include_devcontainer`: Include DevContainer?
- `enable_cost_tracking`: Track API costs?

## Onboarding Guide

After running `copier copy`, follow these steps:

### Step 1: Navigate and Bootstrap

```bash
cd my-new-project
./scripts/bootstrap.sh
```

The bootstrap script will:
- Set up your `.env` file
- Offer to install the `cc` alias for `claude`
- Make hooks executable

### Step 2: Initialize Git

```bash
git init
git add .
git commit -m "Initial project from claude-orchestration-template"
```

### Step 3: Start Claude Code

```bash
cc  # or 'claude'
```

On first run, you'll see the **interactive onboarding** prompt. Say `/onboard` to:
1. Configure network access (Tailscale)
2. Set up local LLM (Ollama) if available
3. Describe your project
4. Generate an initial plan

### Optional: Enhanced Features

For multi-model code review, add these to `.env`:

| Key | Where to Get It | Purpose |
|-----|-----------------|---------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) | @gemini-overseer |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) | @openai-overseer |

### Optional: Local LLM (Ollama)

For FREE code generation instead of using Claude API:

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull coding model
ollama pull qwen2.5-coder:32b
```

### Setup Comparison

| Setup | Cost | What You Get |
|-------|------|--------------|
| **Minimal** | Claude API only | Works out of the box |
| **With Ollama** | FREE coding | Local LLM handles code generation |
| **Full** | Multi-model | Gemini + OpenAI for reviews |

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Hooks not firing | `chmod +x .claude/hooks/*.sh` |
| Git auth prompts | `gh auth login && gh auth setup-git` |
| Ollama not connecting | `ollama serve` |

## Updating from Template

When the template is updated:

```bash
cd my-new-project
copier update --trust
```

Your customizations in protected directories are preserved:
- `.claude/hooks/*.d/` - Your custom hook extensions
- `tasks/detail/` - Your active tasks
- `tasks/done/` - Your completed tasks
- `.env` - Your secrets

## Extending Hooks

Add custom hooks without modifying template-managed files:

```bash
# Create extension directory
mkdir -p .claude/hooks/pre-tool-use.d

# Add your custom hook (numbered for ordering)
cat > .claude/hooks/pre-tool-use.d/50-my-custom.sh << 'EOF'
#!/bin/bash
# Your custom logic here
echo "Custom hook fired" >&2
exit 0
EOF
chmod +x .claude/hooks/pre-tool-use.d/50-my-custom.sh
```

Hooks in `.d/` directories are run by the dispatcher in numeric order.

## Project Structure

```
my-new-project/
├── .claude/
│   ├── settings.json      # Hook configuration
│   ├── agents/            # Subagent definitions
│   ├── skills/            # Custom skills
│   └── hooks/             # Enforcement hooks
│       ├── enforce-delegation.sh   # Template-managed
│       └── pre-tool-use.d/         # Your extensions
├── tasks/
│   ├── master.md          # Task backlog
│   ├── detail/            # Active task specs
│   ├── done/              # Completed tasks
│   └── templates/         # Task templates
├── scripts/
│   └── bootstrap.sh       # First-time setup
├── .env.template          # Secret placeholders
├── .gitignore
├── CLAUDE.md              # Project instructions
└── README.md
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the template repository
2. Make your changes
3. Test with `copier copy ./template /tmp/test-project --trust`
4. Submit a pull request
