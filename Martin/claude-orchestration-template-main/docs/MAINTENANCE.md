# Template Maintenance Guide

This document helps Claude (or humans) maintain and update this template.

## Quick Reference

| Task | Files to Modify | Tests to Run |
|------|-----------------|--------------|
| Add new agent | `{{ project_name }}/.claude/agents/`, `copier.yaml` (if conditional) | `test_template.sh` |
| Add new hook | `{{ project_name }}/.claude/hooks/*.d/` | `test_hooks.sh` |
| Add Copier question | `copier.yaml` | `test_template.sh` |
| Add migration | `graph/migrations/` | `test_template.sh` |
| Update core hook | `{{ project_name }}/.claude/hooks/*.d/00-core-*.sh` | `test_hooks.sh` |

---

## Architecture

### How Copier Works

1. User runs `copier copy <template> <dest>`
2. Copier reads `copier.yaml` for questions
3. User answers questions (or accepts defaults)
4. Copier renders `.jinja` files with answers
5. Files copied to destination (without `.jinja` suffix)
6. Answers saved to `.copier-answers.yml` in destination

### File Types

| Suffix | Meaning | Example |
|--------|---------|---------|
| `.jinja` | Templated file - variables substituted | `CLAUDE.md.jinja` |
| (none) | Static file - copied as-is | `tasks/templates/task_spec.md` |
| In `_exclude` | Never copied/updated | `.claude/hooks/*.d/*.sh` (user extensions) |

### Directory: `{{ project_name }}/`

This is a Copier "subdirectory" - it becomes the project root. The `{{ project_name }}` folder itself is renamed to the user's chosen project name.

---

## Component Map

```
template/
├── copier.yaml              # Template config (questions, excludes)
├── {{ project_name }}/      # Becomes project root
│   ├── .claude/
│   │   ├── settings.json.jinja    # TEMPLATED - has variables
│   │   ├── agents/
│   │   │   ├── local-coder.md.jinja  # CONDITIONAL - only if has_local_llm
│   │   │   ├── code-sentinel.md      # STATIC - always included
│   │   │   └── gemini-overseer.md    # STATIC - always included
│   │   ├── hooks/
│   │   │   ├── pre-tool-use.sh       # DISPATCHER - runs .d/ scripts
│   │   │   └── pre-tool-use.d/
│   │   │       ├── 00-core-*.sh      # TEMPLATE-MANAGED
│   │   │       └── 50-*.sh           # USER-OWNED (excluded from sync)
│   │   └── skills/                   # STATIC - generic
│   ├── CLAUDE.md.jinja               # TEMPLATED - main instructions
│   ├── .env.template.jinja           # TEMPLATED - environment vars
│   ├── scripts/
│   │   ├── bootstrap.sh.jinja        # TEMPLATED - setup script
│   │   └── migrate-graph.sh.jinja    # TEMPLATED - graph migrations
│   ├── graph/
│   │   ├── schema.cypher             # STATIC - full schema
│   │   └── migrations/               # STATIC - incremental changes
│   └── tasks/templates/              # STATIC - task templates
├── tests/smoke/                      # Test suite
├── .github/workflows/                # CI
└── README.md                         # User docs
```

### Ownership Rules

| Pattern | Owner | On `copier update` |
|---------|-------|-------------------|
| `*.jinja` -> `*` | Template | Overwritten (with merge) |
| `.claude/hooks/*.d/00-core-*.sh` | Template | Overwritten |
| `.claude/hooks/*.d/[^0]*` | User | PRESERVED (in _exclude) |
| `.env` | User | PRESERVED (in _exclude) |
| `tasks/detail/*` | User | PRESERVED (in _exclude) |
| `tasks/done/*` | User | PRESERVED (in _exclude) |

---

## Change Procedures

### Adding a New Agent

1. Create agent file: `{{ project_name }}/.claude/agents/my-agent.md`
2. If agent should be conditional:
   - Add question to `copier.yaml`:
     ```yaml
     include_my_agent:
       type: bool
       default: false
       help: "Include my-agent? (requires SOME_API_KEY)"
     ```
   - Rename file to `.md.jinja` and wrap in conditional:
     ```
     {% if include_my_agent %}
     ---
     name: my-agent
     ...
     ---
     [agent content]
     {% endif %}
     ```
3. Update smoke tests if needed
4. Document in README.md

### Adding a New Core Hook

1. Create hook in `{{ project_name }}/.claude/hooks/[type].d/`
2. Use numbered prefix: `00-core-[name].sh` for template-managed
3. Make executable: `chmod +x`
4. Update `test_hooks.sh` with new expected files
5. Document behavior in CLAUDE.md.jinja

### Adding a Copier Question

1. Add to `copier.yaml`:
   ```yaml
   my_variable:
     type: str  # or bool, int, float
     default: "default_value"
     help: "User-facing description"
     # Optional:
     when: "{{ some_condition }}"  # Conditional display
     validator: "{% if not my_variable %}Required{% endif %}"
     secret: true  # For sensitive values
   ```
2. Use in templates: `{{ my_variable }}`
3. Test with `copier copy` using `--data my_variable=test`
4. Document in README.md Configuration table

### Adding a Graph Migration

1. Find next migration number: `ls graph/migrations/`
2. Create: `graph/migrations/NNN_description.cypher`
3. Use `IF NOT EXISTS` for idempotency:
   ```cypher
   CREATE INDEX IF NOT EXISTS ON :NewLabel(property);
   ```
4. Update `graph/schema.cypher` with same changes (keep in sync)
5. Test: Create project, run `./scripts/migrate-graph.sh`

---

## Testing

### Local Testing

```bash
# Full smoke test
./tests/smoke/test_template.sh

# Hook tests only (on existing project)
./tests/smoke/test_hooks.sh /tmp/test-project/your-project

# Update test
./tests/smoke/test_update.sh

# Test specific Copier options
copier copy . /tmp/test --trust \
  --data project_name=test \
  --data has_local_llm=true \
  --data include_multi_model_overseer=true
```

### CI Matrix

CI tests multiple configurations:
- **Minimal**: `has_local_llm=false`, `include_multi_model_overseer=false`
- **With Local LLM**: `has_local_llm=true`, `include_multi_model_overseer=false`
- **Full**: All features enabled

All configurations must pass before merge.

---

## Release Process

1. **Update version** in `copier.yaml`:
   ```yaml
   # Add if not present
   _version: "0.2.0"
   ```

2. **Update `CHANGELOG.md`**:
   ```markdown
   ## [0.2.0] - YYYY-MM-DD
   ### Added
   - New feature X
   ### Fixed
   - Bug Y
   ```

3. **Run all tests**:
   ```bash
   ./tests/smoke/test_template.sh
   ./tests/smoke/test_hooks.sh /tmp/smoke-test-*/ci-test
   ./tests/smoke/test_update.sh
   ```

4. **Commit**: `git commit -am "chore: prepare v0.2.0 release"`

5. **Tag**: `git tag -a v0.2.0 -m "Release v0.2.0"`

6. **Push**: `git push origin main --tags`

7. **Verify**: `copier copy gh:USER/REPO /tmp/verify --trust`

---

## Common Pitfalls

### Jinja2 in Markdown Code Blocks

**Problem**: `{{ }}` in code blocks gets interpreted as Jinja.

**Solution**: Use raw blocks:
```
{% raw %}
```bash
echo "{{ this_is_literal }}"
```
{% endraw %}
```

Or escape: `{{ "{{" }} variable {{ "}}" }}`

### JSON in Jinja Templates

**Problem**: Jinja `{% if %}` inside JSON breaks formatting.

**Solution**: Keep conditionals at line/block level, not inside values:
```json
{% if has_local_llm %}
  {
    "matcher": "Task",
    "hooks": [...]
  }{% endif %}
```

### Files That Must Stay in Sync

| File A | File B | Relationship |
|--------|--------|--------------|
| `graph/schema.cypher` | `graph/migrations/*.cypher` | Schema = sum of migrations |
| `copier.yaml` questions | `.jinja` file usage | All used vars must be defined |
| `README.md` Config table | `copier.yaml` | Documentation must match |
| Test expected files | Actual template files | Tests verify what exists |

### Breaking Changes to Avoid

1. **Renaming Copier questions** - Breaks `.copier-answers.yml` in existing projects
2. **Removing hooks from `.d/`** - May break user workflows
3. **Changing exclusion patterns** - May overwrite user files on update
4. **Non-idempotent migrations** - Breaks re-runs on same database

### Safe Change Patterns

1. **Adding** new questions - Safe (new projects get default)
2. **Adding** new files - Safe (doesn't affect existing)
3. **Deprecating** questions - Add `deprecated: true`, keep working
4. **Changing defaults** - Document in CHANGELOG, existing projects unaffected
5. **Adding** to `_exclude` - Safe (more protection)

---

## Debugging Copier Issues

### Template Not Rendering

Check:
1. File has `.jinja` suffix
2. Variable is defined in `copier.yaml`
3. Variable name matches exactly (case-sensitive)
4. No typos in `{{ variable_name }}`

### Conditional Not Working

Check:
1. `when:` condition syntax (Jinja2)
2. Referenced variable exists and has expected value
3. Boolean comparison: `{{ var }}` not `{{ var == true }}`

### Files Being Overwritten

Check:
1. Pattern is in `_exclude` list
2. Pattern matches correctly (glob syntax)
3. File is in correct location relative to pattern

### Hook Not Running

Check:
1. Script is executable (`chmod +x`)
2. Dispatcher exists and is executable
3. Script has correct shebang (`#!/bin/bash`)
4. Script is in correct `.d/` directory
