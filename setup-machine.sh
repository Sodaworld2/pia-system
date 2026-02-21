#!/bin/bash
# setup-machine.sh — Initialize machine identity in PIA fleet
# Run ONCE on any fresh clone or new machine joining the fleet
# Safe to re-run — asks before overwriting

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IDENTITY_FILE="$REPO_ROOT/MACHINE_IDENTITY.local.md"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${BLUE}=== PIA Fleet — Machine Identity Setup ===${NC}\n"

# ── Step 1: Detect hostname ──────────────────────────────────────────────────
HOSTNAME_RAW=$(hostname)
HOSTNAME=$(echo "$HOSTNAME_RAW" | tr '[:lower:]' '[:upper:]')
echo "Detected hostname: ${YELLOW}$HOSTNAME${NC}"

# ── Step 2: Match FLEET table ────────────────────────────────────────────────
# THIS TABLE MUST STAY IN SYNC WITH:
#   src/config.ts (FLEET const)
#   CLAUDE.md (Fleet Table)
#   PIA_ARCHITECTURE.md (Current Fleet)

case "$HOSTNAME" in
  IZZIT7)
    ROLE="HUB (M1)"; MACHINE_NAME="Izzit7 (M1 Hub)"
    TAILSCALE_IP="100.73.133.3"; HUB_URL="http://localhost:3000"; MODE="hub"
    RUNS="Fisher2050, Tim Buc, Eliyahu, Ziggi, Cortex, CalendarSpawn, full dashboard"
    DOES_NOT_RUN="N/A — this is the hub"
    ;;
  SODA-MONSTER-HUNTER)
    ROLE="WORKER (M2)"; MACHINE_NAME="soda-monster-hunter (M2)"
    TAILSCALE_IP="100.127.165.12"; HUB_URL="http://100.73.133.3:3000"; MODE="local"
    RUNS="API (port 3000), WebSocket, HubClient, SQLite DB, agent executor"
    DOES_NOT_RUN="Fisher2050, Tim Buc, Eliyahu, Ziggi, Cortex, scheduled crons"
    ;;
  SODA-YETI)
    ROLE="WORKER (M3)"; MACHINE_NAME="soda-yeti (M3)"
    TAILSCALE_IP="100.102.217.69"; HUB_URL="http://100.73.133.3:3000"; MODE="local"
    RUNS="API (port 3000), WebSocket, HubClient, SQLite DB, agent executor"
    DOES_NOT_RUN="Fisher2050, Tim Buc, Eliyahu, Ziggi, Cortex, scheduled crons"
    ;;
  *)
    echo -e "${YELLOW}WARNING: Hostname '$HOSTNAME' is not in the FLEET table.${NC}"
    echo ""
    echo "To add this machine to the fleet:"
    echo "  1. Edit src/config.ts — add entry to FLEET const"
    echo "  2. Edit CLAUDE.md — add row to Fleet Table"
    echo "  3. Edit PIA_ARCHITECTURE.md — add row to Current Fleet"
    echo "  4. Re-run this script"
    echo ""
    read -p "Continue with manual setup? (y/n) " -n 1 -r; echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
    read -p "Machine name: " MACHINE_NAME
    read -p "Role (hub/local): " MODE
    read -p "Tailscale IP: " TAILSCALE_IP
    read -p "Hub URL [http://100.73.133.3:3000]: " HUB_URL
    HUB_URL="${HUB_URL:-http://100.73.133.3:3000}"
    ROLE="MANUAL ($MODE)"
    RUNS="Unknown — set up manually"
    DOES_NOT_RUN="Unknown — set up manually"
    ;;
esac

echo -e "\n${GREEN}Identity resolved:${NC}"
echo "  Role:    $ROLE"
echo "  Mode:    $MODE"
echo "  IP:      $TAILSCALE_IP"
echo "  Hub:     $HUB_URL"

# ── Step 3: Handle existing file ─────────────────────────────────────────────
if [ -f "$IDENTITY_FILE" ]; then
  echo -e "\n${YELLOW}MACHINE_IDENTITY.local.md already exists.${NC}"
  read -p "Overwrite? (y/n) " -n 1 -r; echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Kept existing file."; cat "$IDENTITY_FILE"; exit 0
  fi
fi

# ── Step 4: Write identity file ──────────────────────────────────────────────
cat > "$IDENTITY_FILE" << EOF
# Machine Identity — DO NOT COMMIT (gitignored)

## Who Am I
- **Hostname:** $HOSTNAME
- **Machine:** $MACHINE_NAME
- **Role:** $ROLE
- **Mode:** $MODE
- **Tailscale IP:** $TAILSCALE_IP

## What I Run
- Runs: $RUNS
- Does NOT run: $DOES_NOT_RUN

## My Rules
$(if [ "$MODE" = "hub" ]; then
cat << 'RULES'
- I am M1 — the controller and brain of the fleet
- I coordinate all worker machines
- I am the ONLY machine that pushes to GitHub
- Fisher2050, Tim Buc, Eliyahu run on me
RULES
else
cat << 'RULES'
- I receive commands from M1 hub
- I run agents locally when hub commands me
- I send heartbeat to M1 every 30s
- I do NOT run scheduling or intelligence services
- I do NOT push to GitHub
- If M1 is offline, I go idle
RULES
fi)

## The Fleet
| Machine | Role | IP | Repo |
|---|---|---|---|
| Izzit7 (M1) | Hub | 100.73.133.3 | C:\Users\mic\Downloads\pia-system |
| soda-monster-hunter (M2) | Worker | 100.127.165.12 | C:\Users\User\Documents\GitHub\pia-system |
| soda-yeti (M3) | Worker | 100.102.217.69 | C:\Users\User\Documents\GitHub\pia-system |

## Auto-Generated
- Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- Script: setup-machine.sh
- This file survives git pull (gitignored). Regenerate anytime with: bash setup-machine.sh
EOF

echo -e "\n${GREEN}✓ Created MACHINE_IDENTITY.local.md${NC}"

# ── Step 5: Verify .gitignore ────────────────────────────────────────────────
if grep -q "MACHINE_IDENTITY.local.md" "$REPO_ROOT/.gitignore" 2>/dev/null; then
  echo -e "${GREEN}✓ .gitignore is correct — file will NOT be committed${NC}"
else
  echo -e "${RED}⚠ WARNING: MACHINE_IDENTITY.local.md is NOT in .gitignore!${NC}"
  echo "  Add it now with: echo 'MACHINE_IDENTITY.local.md' >> .gitignore"
fi

# ── Step 6: Verify .env basics ───────────────────────────────────────────────
ENV_FILE="$REPO_ROOT/.env"
echo ""
if [ -f "$ENV_FILE" ]; then
  echo -e "${GREEN}✓ .env exists${NC}"
  if grep -q "PIA_SECRET_TOKEN" "$ENV_FILE"; then
    echo -e "${GREEN}✓ PIA_SECRET_TOKEN found${NC}"
  else
    echo -e "${YELLOW}⚠ PIA_SECRET_TOKEN missing from .env${NC}"
  fi
  if grep -q "ANTHROPIC_API_KEY" "$ENV_FILE"; then
    echo -e "${GREEN}✓ ANTHROPIC_API_KEY found${NC}"
  else
    echo -e "${YELLOW}⚠ ANTHROPIC_API_KEY missing — agents cannot think without this${NC}"
  fi
  if [ "$MODE" = "local" ]; then
    if grep -q "PIA_HUB_URL" "$ENV_FILE"; then
      echo -e "${GREEN}✓ PIA_HUB_URL found${NC}"
    else
      echo -e "${YELLOW}⚠ PIA_HUB_URL missing — add: PIA_HUB_URL=$HUB_URL${NC}"
    fi
  fi
else
  echo -e "${YELLOW}⚠ No .env file found. Create one with:${NC}"
  echo ""
  if [ "$MODE" = "hub" ]; then
    echo "  PIA_SECRET_TOKEN=pia-local-dev-token-2024"
    echo "  PIA_JWT_SECRET=pia-jwt-secret-2024"
    echo "  ANTHROPIC_API_KEY=sk-ant-..."
  else
    echo "  PIA_MODE=local"
    echo "  PIA_SECRET_TOKEN=pia-local-dev-token-2024   # must match M1"
    echo "  PIA_JWT_SECRET=pia-jwt-secret-2024           # must match M1"
    echo "  PIA_HUB_URL=$HUB_URL"
    echo "  ANTHROPIC_API_KEY=sk-ant-...                 # required for agents"
  fi
fi

# ── Step 7: Next steps ───────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}=== Next Steps ===${NC}"
if [ "$MODE" = "hub" ]; then
  echo "  npm install && npm run dev"
  echo "  Dashboard: http://localhost:3000/mission-control.html"
else
  echo "  npm install && npm run dev"
  echo "  Watch for: [HubClient] Connected to Hub"
  echo "  Verify on M1: SODA-MONSTER-HUNTER/SODA-YETI shows green in dashboard"
fi
echo ""
echo -e "${GREEN}Setup complete. Run 'npm run dev' to start.${NC}\n"
