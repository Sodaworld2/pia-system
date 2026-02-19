# PIA Machine Setup & Management Guide

## Overview

PIA runs as a hub/spoke system across multiple machines connected via Tailscale VPN.

| Machine | Role | Tailscale IP | OS |
|---|---|---|---|
| M1 — Izzit7 | **Hub** (runs dashboard + DB) | 100.73.133.3 | Windows 11 Pro |
| M2 — soda-monster-hunter | **Worker** (spoke) | 100.127.165.12 | Windows 11 Pro |
| M3 — soda-yeti | **Worker** (spoke) | 100.102.217.69 | Windows 11 Pro |

---

## Cold Start: Getting Everything Running Again

### Step 1: Start Tailscale (all machines)
Tailscale should auto-start with Windows. Verify:
```powershell
tailscale status
```
All machines should show as "active". If not, open Tailscale from the system tray and sign in.

### Step 2: Start the Hub (M1)
```powershell
cd C:\Users\mic\Downloads\pia-system
npm run dev
```
Wait for: `API server running at http://0.0.0.0:3000`

### Step 3: Start Workers (M2, M3)
On each worker machine:
```powershell
cd C:\Users\mic\Downloads\pia-system   # or wherever PIA is installed
npm run dev
```
Wait for: `Connected to hub at http://100.73.133.3:3000`

### Step 4: Verify
Open dashboard: http://localhost:3000/mission-control.html
- All machines should appear in the Target Machine dropdown
- Each machine should show its projects in the project picker

### Quick Health Check
```bash
# From M1 (hub)
curl http://localhost:3000/api/health
curl http://localhost:3000/api/machines

# From any machine to hub
curl http://100.73.133.3:3000/api/health
```

---

## First-Time Machine Setup

### Prerequisites (all machines)

1. **Node.js 20+**: https://nodejs.org
2. **Git**: https://git-scm.com
3. **Tailscale**: https://tailscale.com/download — sign in to same account
4. **Anthropic API key**: Set as `ANTHROPIC_API_KEY` environment variable

### Step-by-Step for a New Worker

#### 1. Open Firewall for Tailscale
```powershell
# Run as Administrator
New-NetFirewallRule -Name 'Allow-All-Tailscale' -DisplayName 'Allow All Tailscale' -Direction Inbound -RemoteAddress 100.64.0.0/10 -Action Allow
```

#### 2. Open PIA Server Ports
```powershell
New-NetFirewallRule -Name 'PIA-Server' -DisplayName 'PIA Server' -Direction Inbound -LocalPort 3000,3001 -Protocol TCP -Action Allow
```

#### 3. Enable SSH (optional but recommended)
```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

#### 4. Clone PIA
```powershell
cd C:\Users\%USERNAME%\Downloads
git clone https://github.com/Sodaworld2/pia-system.git
cd pia-system
npm install
```

#### 5. Create .env File
Create `C:\Users\%USERNAME%\Downloads\pia-system\.env`:
```env
PIA_MODE=local
PIA_MACHINE_NAME=your-machine-name
PIA_HUB_URL=http://100.73.133.3:3000
PIA_SECRET_TOKEN=pia-fleet-token-2024
PORT=3000
WS_PORT=3001
```

Replace `your-machine-name` with the actual hostname (e.g., `soda-monster-hunter`).

#### 6. Start PIA
```powershell
cd C:\Users\%USERNAME%\Downloads\pia-system
npm run dev
```

#### 7. Verify
```powershell
# Test hub connectivity
curl http://100.73.133.3:3000/api/health
```

---

## Updating All Machines

When code changes are pushed to GitHub:

### On each machine:
```powershell
cd C:\Users\%USERNAME%\Downloads\pia-system
git pull
npm install   # only if package.json changed
# Restart PIA (Ctrl+C then npm run dev)
```

### Order matters:
1. Update and restart **hub (M1)** first
2. Then update and restart **workers (M2, M3)**

Workers will auto-reconnect to the hub after restart.

---

## Remote Capabilities Per Machine

### What the Hub Can Do to Workers

| Capability | How | Status |
|---|---|---|
| **Spawn AI agents** | POST /api/mc/agents with machineId | Working |
| **Kill agents** | POST /api/mc/agents/:id/kill | Working |
| **Send input to agents** | POST /api/mc/agents/:id/respond | Working |
| **List files** | WebSocket list_directory command | Working |
| **Search files** | WebSocket search_directory command | Working |
| **Read files** | WebSocket read_file command | Working |
| **Open browser** | Spawn agent with Playwright MCP | Working |
| **Run shell commands** | Spawn agent with bash tool in yolo mode | Working |
| **View projects** | GET /api/mc/machines/:id/projects | Working |

### Remote Browser Control (Playwright MCP)

To open and control a browser on a remote machine:

**Spawn config:**
```json
{
  "machineId": "<worker-machine-id>",
  "mode": "sdk",
  "task": "Navigate to https://example.com and take a screenshot",
  "cwd": "C:/Users/User/Documents/GitHub/pia-system",
  "approvalMode": "yolo",
  "model": "claude-haiku-4-5-20251001",
  "maxBudget": 2,
  "mcpServers": [{
    "name": "playwright",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@playwright/mcp"]
  }]
}
```

**Prerequisites on the worker:**
- Playwright browsers installed: `npx playwright install`
- Or just chromium: `npx playwright install chromium`

---

## Enhancing Machine Receptiveness

### Recommended Software Per Machine

| Software | Purpose | Install |
|---|---|---|
| **Tailscale** | VPN mesh (already installed) | https://tailscale.com |
| **Node.js 20+** | Runtime (already installed) | https://nodejs.org |
| **Git** | Version control (already installed) | https://git-scm.com |
| **Playwright** | Browser automation | `npx playwright install` |
| **OpenSSH Server** | Remote shell access | See firewall section above |
| **PM2** | Process manager (auto-restart) | `npm install -g pm2` |

### Optional Enhancements

#### Auto-Start PIA on Boot (using PM2)
```powershell
npm install -g pm2
pm2 start npm --name "pia" -- run dev
pm2 save
pm2 startup   # Follow instructions to enable on boot
```

#### Enable Remote Desktop (RDP)
Windows 11 Pro has RDP built in:
```powershell
# Enable RDP
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 0
Enable-NetFirewallRule -DisplayGroup "Remote Desktop"
```
Then from any machine: `mstsc /v:100.127.165.12` (using Tailscale IP)

#### Tailscale SSH (passwordless SSH between machines)
```bash
# On the admin machine, enable Tailscale SSH in the admin console
# Then from M1:
ssh user@soda-monster-hunter   # Uses Tailscale identity, no passwords
```
Enable at: https://login.tailscale.com/admin/machines → Edit ACLs → Enable SSH

#### Screen Sharing / Remote Desktop Options

| Method | Pros | Cons |
|---|---|---|
| **RDP (built-in)** | Native Windows, fast, full control | Windows Pro only, takes over session |
| **Tailscale SSH** | No passwords, encrypted | Terminal only, no GUI |
| **VNC (TightVNC/RealVNC)** | Cross-platform, see real screen | Extra install, slower than RDP |
| **Parsec** | Gaming-grade low latency | Requires account |
| **Playwright MCP** | Headless browser control from PIA | Browser only, not full desktop |
| **noVNC / Apache Guacamole** | Browser-based remote desktop | Server setup required |
| **Tailscale Funnel** | Expose services to internet | Only HTTP/HTTPS |

---

## Troubleshooting

### Worker Won't Connect to Hub

1. **Check Tailscale**: `tailscale status` — both machines should be active
2. **Check firewall**: `curl http://100.73.133.3:3000/api/health` from worker
3. **Check .env**: `PIA_HUB_URL` must point to hub's Tailscale IP
4. **Check token**: `PIA_SECRET_TOKEN` must match on hub and worker

### Agent Spawn Fails on Remote Machine

1. **Check worker logs**: Look for errors after "Received command: spawn_agent"
2. **Check MCP config**: Package names must be correct (e.g., `@playwright/mcp` not `@anthropic-ai/mcp-server-playwright`)
3. **Check npx -y flag**: Always include `-y` to skip confirmation prompts
4. **Check API key**: Worker machine needs `ANTHROPIC_API_KEY` in environment

### Projects Not Showing for a Machine

1. Worker must be connected (check machine list)
2. Worker reports projects on registration — restart worker to re-scan
3. Check: `curl http://localhost:3000/api/mc/machines/<id>/projects`

### Machine Shows as Offline

Workers send heartbeats every 30 seconds. If a machine goes offline:
1. Check if PIA is still running on that machine
2. Check Tailscale connectivity
3. Restart PIA on the worker — it will auto-reconnect

---

## Machine IDs (Current Fleet)

| Machine | DB ID | Hostname | MAC Address | Tailscale IP | User |
|---|---|---|---|---|---|
| M1 — Izzit7 (Hub) | adFxRSyo1ZCh9MFqbgWiW | Izzit7 | TBD | 100.73.133.3 | mic |
| M2 — soda-monster-hunter | CPRCCmmvcH6PHSTyURmSK | soda-monster-hunter | A0-9F-7A-5D-DF-A4 | 100.127.165.12 | User |
| M3 — soda-yeti | qyofMpK5niIQ_6wo3nnvT | soda-yeti | TBD | 100.102.217.69 | mic |

---

## Network Topology

```
                    Internet
                       |
                  [Tailscale]
                  100.64.0.0/10
                 /      |      \
    M1 (Hub)       M2 (Worker)    M3 (Worker)
  100.73.133.3   100.127.165.12  100.102.217.69
   Port 3000        Port 3000      Port 3000
   Port 3001        Port 3001      Port 3001
      |                |              |
   Dashboard      Agent Runtime   Agent Runtime
   SQLite DB      Playwright      Playwright
   WebSocket Hub  PTY Sessions    PTY Sessions
```

All inter-machine communication goes through Tailscale's encrypted WireGuard tunnels.
