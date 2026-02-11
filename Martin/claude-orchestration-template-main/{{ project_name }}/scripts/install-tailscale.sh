#!/bin/bash
# Install Tailscale - zero-config VPN for secure remote access
# https://tailscale.com

set -euo pipefail

echo "=== Installing Tailscale ==="
echo ""
echo "Tailscale creates a secure mesh network between your devices."
echo "Use it to access local LLMs, databases, and services from anywhere."
echo ""

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "Detected: Linux"
    echo "Running official install script..."
    curl -fsSL https://tailscale.com/install.sh | sh

    echo ""
    echo "Starting Tailscale..."
    sudo tailscale up

elif [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Detected: macOS"

    if command -v brew &> /dev/null; then
        echo "Installing via Homebrew..."
        brew install --cask tailscale
        echo ""
        echo "Open Tailscale from Applications and sign in."
    else
        echo "Homebrew not found. Install from: https://tailscale.com/download/mac"
        open "https://tailscale.com/download/mac"
    fi

else
    echo "Unknown OS: $OSTYPE"
    echo "Visit https://tailscale.com/download for installation instructions."
    exit 1
fi

echo ""
echo "=== Tailscale Installation Complete ==="
echo ""
echo "Next steps:"
echo "1. Sign in with your Tailscale account (or create one)"
echo "2. Authorize this device"
echo "3. Access other devices on your tailnet by name"
echo ""
echo "Example: If you have a GPU server named 'gpu-vm01':"
echo "  curl http://gpu-vm01:11434/api/tags  # Access Ollama"
echo ""
echo "Manage devices at: https://login.tailscale.com/admin/machines"
