#!/bin/bash
# Install 'cc' alias for claude command
# Run once after setting up your project

set -euo pipefail

ALIAS_LINE="alias cc='claude'"
SHELL_RC=""

# Detect shell config file
if [ -n "${ZSH_VERSION:-}" ] || [ "$SHELL" = "/bin/zsh" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bash_aliases" ]; then
    SHELL_RC="$HOME/.bash_aliases"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -f "$HOME/.profile" ]; then
    SHELL_RC="$HOME/.profile"
else
    echo "Could not find shell config file (.zshrc, .bashrc, .bash_aliases, or .profile)"
    echo "Add this line manually to your shell config:"
    echo "  $ALIAS_LINE"
    exit 1
fi

# Check if alias already exists
if grep -q "alias cc=" "$SHELL_RC" 2>/dev/null; then
    echo "Alias 'cc' already exists in $SHELL_RC"
    grep "alias cc=" "$SHELL_RC"
    exit 0
fi

# Add the alias
echo "" >> "$SHELL_RC"
echo "# Claude Code alias (added by install-alias.sh)" >> "$SHELL_RC"
echo "$ALIAS_LINE" >> "$SHELL_RC"

echo "Added to $SHELL_RC:"
echo "  $ALIAS_LINE"
echo ""
echo "To use immediately, run:"
echo "  source $SHELL_RC"
echo ""
echo "Or just open a new terminal."
echo ""
echo "Now you can start Claude Code with just: cc"
