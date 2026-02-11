# Changelog

All notable changes to this template will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-02-04

### Added
- Initial template release
- **Core Orchestration**
  - Agent delegation system with hook enforcement
  - Cost-conscious routing (FREE local LLM -> PAID cloud APIs)
  - Session hygiene rules to prevent ghost code
- **Agents**
  - @local-coder: FREE code generation via Ollama
  - @code-sentinel: Multi-model security audit
  - @gemini-overseer: Single-model architecture review
  - @overseer: Multi-model panel (Gemini + OpenAI + Grok)
  - @debug: Deep-dive debugging with Ralph Wiggum pattern
  - @integration-check: Code wiring verification
  - @janitor: Codebase cleanup
- **Hook Dispatcher Pattern**
  - `.d/` directory structure for user extensions
  - Core hooks in numbered files (00-core-*.sh)
  - Custom hooks survive `copier update`
- **Secret Management**
  - `.env.template` with placeholder values
  - `bootstrap.sh` for first-time setup
  - Pre-commit secret scanning (detect-secrets)
- **Knowledge Graph** (optional)
  - `graph/schema.cypher` for fresh installs
  - `graph/migrations/` for schema evolution
  - `scripts/migrate-graph.sh` runner
- **Task System**
  - `tasks/master.md` backlog
  - `tasks/templates/` for task specs
  - Phase-based workflow (Planning -> Execution -> Completion)
- **Testing**
  - Smoke tests for template validation
  - Hook dispatcher tests
  - CI/CD workflow for GitHub Actions

### Known Limitations
- Bidirectional sync (project -> template) not yet implemented
- Graph MCP requires manual Memgraph setup
- Some agents require paid API keys (Gemini, OpenAI, Grok)
- DevContainer not yet included (deferred to 0.2.0)

## [Unreleased]

### Planned for 0.2.0
- Bidirectional sync support (`claude-template sync-up` CLI)
- Docker Compose for full stack (includes Memgraph)
- DevContainer configuration
- More granular conditional rendering
- Skill templates
