# Contributing to Claude Code Orchestration Template

Thank you for considering contributing to this template!

## How to Contribute

### Reporting Issues

1. **Search existing issues** first to avoid duplicates
2. **Use the issue template** when available
3. **Include details**:
   - Copier version (`copier --version`)
   - What you tried (exact commands)
   - What you expected
   - What actually happened
   - Any error messages

### Suggesting Improvements

1. **Open a discussion** for larger changes before starting work
2. **Keep scope focused** - one feature per PR
3. **Consider backward compatibility** - changes should not break existing projects

### Submitting Changes

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-improvement`
3. **Make your changes**
4. **Test thoroughly**:
   ```bash
   # Run smoke tests
   ./tests/smoke/test_template.sh

   # Test with copier
   copier copy ./template /tmp/test-project --trust
   cd /tmp/test-project/your-project
   ./scripts/bootstrap.sh
   ```
5. **Commit with clear messages**
6. **Submit a Pull Request**

## Development Setup

```bash
# Clone the repo
git clone https://github.com/YOUR-USERNAME/claude-orchestration-template
cd claude-orchestration-template

# Install dependencies
pip install copier pre-commit

# Install pre-commit hooks
pre-commit install

# Run tests
./tests/smoke/test_template.sh
```

## Code Style

### Shell Scripts
- Use `#!/bin/bash` shebang
- Quote variables: `"$VAR"` not `$VAR`
- Use `set -e` for error handling
- Add comments for non-obvious logic

### Jinja2 Templates
- Keep logic minimal in templates
- Use clear variable names
- Test conditional rendering in both true/false states

### Documentation
- Use clear, simple language
- Include examples where helpful
- Keep README focused on quick start

## What We're Looking For

### Good Contributions
- Bug fixes with tests
- Documentation improvements
- New agent configurations
- Hook examples
- CI/CD improvements

### Needs Discussion First
- New dependencies
- Changes to core hook structure
- New Copier questions
- Breaking changes

### Currently Out of Scope (Deferred to v0.2+)
- Bidirectional sync (project -> template)
- Docker Compose stack
- Multiple template levels

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
