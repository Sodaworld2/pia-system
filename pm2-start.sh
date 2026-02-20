#!/bin/bash
# Start PIA under PM2 (use this instead of npm run dev for production)
# Run: bash pm2-start.sh

cd "$(dirname "$0")"

# Kill any existing npm run dev
pkill -f "tsx watch src/index.ts" 2>/dev/null || true

# Start under PM2
pm2 start ecosystem.config.cjs

# Save PM2 process list (survives reboot)
pm2 save

echo "PIA started under PM2. Use 'pm2 logs pia-hub' to view logs."
echo "Use 'pm2 stop pia-hub' to stop."
echo "Use 'pm2 restart pia-hub' to restart."
