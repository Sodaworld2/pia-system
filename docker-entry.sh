#!/bin/sh
set -e

# ============================================================
# PIA System - Docker Entrypoint
# ============================================================

# Create data directory if it does not exist
if [ ! -d "/app/data" ]; then
    echo "[pia-entry] Creating /app/data directory..."
    mkdir -p /app/data
fi

echo "[pia-entry] Starting PIA system (mode=${PIA_MODE:-hub})..."

# Run the application
exec node dist/index.js
