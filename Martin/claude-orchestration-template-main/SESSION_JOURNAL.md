# Session Journal: Martin's Orchestration System Setup
**Date:** 2026-02-10
**User:** mic

---

## Objective
Test and set up Martin's Claude Code orchestration template system.

---

## What is Martin's Orchestration System?

A Claude Code project template that provides:
- **Agent Delegation** - Claude orchestrates, specialized agents do the work
- **Cost-Conscious Routing** - FREE local LLM (Ollama) → PAID Claude API waterfall
- **Hook Enforcement** - Prevents direct code edits, enforces delegation
- **Multi-Model Review** - Optional Gemini/OpenAI/Grok reviewers
- **Task Management** - Structured task tracking with phases

---

## Steps Completed

### 1. Explored the Template
- Location: `C:\Users\mic\Downloads\claude-orchestration-template-main`
- Template uses **Copier** for project scaffolding
- Contains Jinja2 templates that render based on configuration choices

### 2. Attempted Copier Setup (Issues on Windows)
- Installed `copier` via pip
- **Problem:** Copier failed on Windows due to:
  - Jinja2 templated folder name `{{ project_name }}` not recognized
  - Windows reserved filename `nul` causing git errors
  - Bash scripts incompatible with native Windows

### 3. Manual Template Rendering (Workaround)
- Manually copied template files from `{{ project_name }}` folder
- Created Python script to render all `.jinja` files
- Successfully created project at:
  ```
  C:\Users\mic\AppData\Local\Temp\claude\test-orchestration-project
  ```

### 4. Installed WSL2 Ubuntu
```bash
wsl --install -d Ubuntu
```
- Required because hooks are bash scripts
- Ubuntu installed successfully

### 5. Installed Ollama on Windows
```bash
winget install Ollama.Ollama
```
- Version: 0.15.4
- Size: 1.17GB installer

### 6. Pulled Coding Model
- **Model:** `qwen2.5-coder:7b`
- **Size:** 4.7GB
- **Reason:** User has RTX 3070 Ti with 8GB VRAM (32B model needs ~18GB)
- Pulled via API: `curl -X POST http://localhost:11434/api/pull -d '{"name": "qwen2.5-coder:7b"}'`

### 7. Configured MCP Server
Created `.mcp.json` in project:
```json
{
  "ollama": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "ollama-mcp"],
    "env": {
      "OLLAMA_HOST": "http://localhost:11434"
    }
  }
}
```

### 8. Created Local Coder Agent
Wrote `.claude/agents/local-coder.md` configured for `qwen2.5-coder:7b`

### 9. Stopped Ollama
```bash
powershell -Command "Get-Process -Name '*ollama*' | Stop-Process -Force"
```

---

## What Was Installed

| Component | Version | Location |
|-----------|---------|----------|
| Copier | 9.11.3 | pip (user) |
| WSL2 Ubuntu | Latest | Windows Subsystem |
| Ollama | 0.15.4 | Windows native |
| qwen2.5-coder:7b | Q4_K_M | `~/.ollama/models` |

---

## Project Structure Created

```
C:\Users\mic\AppData\Local\Temp\claude\test-orchestration-project\
├── .claude/
│   ├── settings.json          # Hook configuration
│   ├── agents/                 # 16 agent definitions
│   │   ├── local-coder.md     # FREE coding via Ollama
│   │   ├── debug.md           # Deep-dive debugging
│   │   ├── janitor.md         # Codebase cleanup
│   │   ├── code-sentinel.md   # Security audits
│   │   └── ... (12 more)
│   ├── skills/                 # 13 skills
│   │   ├── create-plans/
│   │   ├── create-hooks/
│   │   ├── onboard/
│   │   └── ...
│   └── hooks/                  # Bash enforcement hooks
│       ├── pre-tool-use.sh
│       ├── post-tool-use.sh
│       ├── session-start.sh
│       └── ...
├── .mcp.json                   # Ollama MCP config
├── .env                        # Environment variables
├── CLAUDE.md                   # Project instructions
├── tasks/
│   ├── master.md              # Task backlog
│   └── templates/
└── scripts/
    └── bootstrap.sh
```

---

## Key Agents Available

| Agent | Purpose | Cost |
|-------|---------|------|
| @local-coder | Code generation via Ollama | FREE |
| @debug | Debugging with test loops | FREE → PAID |
| @integration-check | Verify code wiring | FREE |
| @janitor | Codebase cleanup | FREE → PAID |
| @code-sentinel | Security audits | PAID |
| @gemini-overseer | Gemini review | PAID |
| @openai-overseer | OpenAI review | PAID |

---

## How to Use

### Start Ollama (when needed)
- Click Ollama in Start menu, OR
- Run: `ollama serve`

### Launch Claude Code

**Option A: Windows (no hooks)**
```cmd
cd "C:\Users\mic\AppData\Local\Temp\claude\test-orchestration-project"
claude
```

**Option B: WSL (full hooks support)**
```bash
wsl -d Ubuntu
cd /mnt/c/Users/mic/AppData/Local/Temp/claude/test-orchestration-project
claude
```

### Test Commands
- `run onboarding` - Interactive setup
- Ask for code - Should route to @local-coder

---

## Known Limitations

1. **Windows Native:** Hooks don't fire (they're bash scripts)
2. **8GB VRAM:** Can only run 7B model, not 32B like Martin's setup
3. **Temp Location:** Project is in temp folder - may get cleaned up

---

## Recommended Next Steps

1. **Move project** to permanent location:
   ```
   C:\Users\mic\Downloads\pia-system\my-orchestration-project
   ```

2. **Set up Ubuntu WSL** properly (first launch requires username/password)

3. **Test the workflow** with a simple coding task

4. **Optional:** Add API keys for multi-model review:
   - `GEMINI_API_KEY` for @gemini-overseer
   - `OPENAI_API_KEY` for @openai-overseer

---

## References

- Template Source: https://github.com/voronerd/claude-orchestration-template
- Ollama: https://ollama.com
- Ollama MCP: https://github.com/rawveg/ollama-mcp
- Claude Code MCP Docs: https://docs.anthropic.com/en/docs/claude-code/mcp

---

## Session Stats

- Duration: ~1 hour
- Background tasks: 4 (all completed)
- Files created: ~200 (template + rendered)
- Models downloaded: 1 (4.7GB)
