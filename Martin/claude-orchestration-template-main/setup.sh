#!/bin/bash
# Setup script for Claude Code Orchestration Template
# Run this BEFORE using copier to generate a project

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Claude Code Orchestration Template Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "Python 3 not found. Please install it first."
    echo "   sudo apt install python3 python3-pip python3-venv"
    exit 1
fi
echo "Python 3 found"

# Check for uvx availability (preferred - runs copier on-demand without install)
if command -v uvx &> /dev/null || [ -f ~/.local/bin/uvx ]; then
    USE_UVX=true
    echo "uvx found (will use for copier)"
else
    USE_UVX=false
fi

if [ "$USE_UVX" = false ]; then
    # Check for pipx, install if missing
    if ! command -v pipx &> /dev/null && [ ! -f ~/.local/bin/pipx ]; then
        echo "Installing pipx..."
        # Try apt first (most reliable on Debian/Ubuntu)
        if command -v apt &> /dev/null; then
            sudo apt install -y pipx
        else
            # Fallback to pip methods
            python3 -m pip install --user pipx 2>/dev/null || \
            pip3 install --user --break-system-packages pipx 2>/dev/null
        fi
    fi

    # Add ~/.local/bin to PATH if not already there
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
        export PATH="$HOME/.local/bin:$PATH"
        echo "Added ~/.local/bin to PATH"
    fi

    # Ensure pipx path is configured
    pipx ensurepath 2>/dev/null || ~/.local/bin/pipx ensurepath 2>/dev/null || true

    # Install copier via pipx
    if ! command -v copier &> /dev/null && [ ! -f ~/.local/bin/copier ]; then
        echo "Installing copier..."
        pipx install copier 2>/dev/null || ~/.local/bin/pipx install copier
    fi
    echo "Copier installed"
fi

# Check for git
if ! command -v git &> /dev/null; then
    echo "Installing git..."
    sudo apt install -y git
fi
echo "Git found"

# Check for Node.js (required for Claude Code)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    if command -v apt &> /dev/null; then
        # Install via NodeSource for recent version
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
    else
        echo "Please install Node.js manually: https://nodejs.org/"
    fi
fi
echo "Node.js found: $(node --version 2>/dev/null || echo 'not installed')"

# Check for Claude Code
if ! command -v claude &> /dev/null; then
    echo "Installing Claude Code CLI..."
    sudo npm install -g @anthropic-ai/claude-code
fi
echo "Claude Code installed"

# Install GitHub CLI
if ! command -v gh &> /dev/null; then
    echo "Installing GitHub CLI..."
    if command -v apt &> /dev/null; then
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt update && sudo apt install -y gh
    fi
fi
echo "GitHub CLI installed"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo ""
if [ "$USE_UVX" = true ]; then
    echo "  1. Create a project from this template:"
    echo "     uvx copier copy . ~/my-project --trust"
else
    echo "  1. Create a project from this template:"
    echo "     copier copy . ~/my-project --trust"
fi
echo ""
echo "  2. Start Claude Code:"
echo "     cd ~/my-project"
echo "     ./scripts/bootstrap.sh"
echo "     claude"
echo ""
echo "Reloading shell..."
exec bash
