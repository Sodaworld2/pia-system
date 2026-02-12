# Machine #2 Setup Instructions

You are Machine #2 in the PIA fleet. Machine #1 (izzit7) is the hub.

## Your Role
- **Role:** Spoke machine
- **Hub:** Machine #1 (izzit7) at 100.73.133.3
- **Your job:** Build projects, run agents, report to hub

## Step 1: Prerequisites

```bash
# Install these if not already present
winget install OpenJS.NodeJS.LTS     # Node.js 20+
winget install Git.Git               # Git
winget install Tailscale.Tailscale   # VPN mesh
winget install Python.Python.3.13    # Python (for Windows MCP)
pip install uv                        # uv package manager
```

## Step 2: Join Tailscale

```bash
tailscale up
# IMPORTANT: Note your Tailscale IP (100.x.y.z)
tailscale ip -4
```

## Step 3: Clone & Install PIA

```bash
git clone https://github.com/Sodaworld2/pia-system.git
cd pia-system
npm install
```

## Step 4: Create .env File

Create a file called `.env` in the project root:

```
PIA_MODE=local
PIA_PORT=3000
PIA_WS_PORT=3001
PIA_SECRET_TOKEN=pia-local-dev-token-2024
PIA_HUB_URL=http://100.73.133.3:3000
PIA_MACHINE_NAME=machine-2
```

## Step 5: Build & Start

```bash
npm run build
npm run dev
```

The Visor dashboard will auto-open in your browser at http://localhost:3000/visor.html

## Step 6: Install Claude Code MCPs

These are the tools Claude actually uses on every machine:

```bash
# 1. Playwright MCP - Browser control (screenshots, clicking, typing)
claude mcp add playwright -- cmd /c npx -y @playwright/mcp@latest

# 2. Windows MCP - System control (window management, system info)
claude mcp add windows-mcp -- cmd /c uvx windows-mcp

# 3. GitHub MCP - Code sync between machines (PRs, commits, issues)
claude mcp add --transport http github https://api.githubcopilot.com/mcp/

# 4. Verify all MCPs are connected
claude mcp list
```

## Step 7: Register with the Hub

Replace YOUR-TAILSCALE-IP with your actual IP from Step 2:

```bash
# Register yourself on Machine #1's hub
curl -X POST http://100.73.133.3:3000/api/relay/register ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Token: pia-local-dev-token-2024" ^
  -d "{\"id\":\"machine-2\",\"name\":\"Machine-2\",\"hostname\":\"machine-2\",\"project\":\"PIA\",\"tailscaleIp\":\"YOUR-TAILSCALE-IP\",\"channels\":[\"api\",\"tailscale\"]}"

# Register Machine #1 on YOUR relay so you can send messages back
curl -X POST http://localhost:3000/api/relay/register ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Token: pia-local-dev-token-2024" ^
  -d "{\"id\":\"hub-izzit7\",\"name\":\"izzit7 (Machine #1 Hub)\",\"hostname\":\"izzit7\",\"project\":\"PIA\",\"tailscaleIp\":\"100.73.133.3\",\"channels\":[\"api\",\"tailscale\"]}"

# Register Machine #3 too
curl -X POST http://localhost:3000/api/relay/register ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Token: pia-local-dev-token-2024" ^
  -d "{\"id\":\"soda-yeti\",\"name\":\"Soda-Yeti (Machine #3)\",\"hostname\":\"soda-yeti\",\"project\":\"PIA\",\"tailscaleIp\":\"100.102.217.69\",\"channels\":[\"api\",\"tailscale\"]}"
```

## Step 8: Test Messaging

```bash
# Send a message to Machine #1
curl -X POST http://localhost:3000/api/relay/send ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Token: pia-local-dev-token-2024" ^
  -d "{\"to\":\"hub-izzit7\",\"content\":\"Machine #2 is online and ready!\",\"type\":\"chat\"}"

# Send a message to Machine #3
curl -X POST http://localhost:3000/api/relay/send ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Token: pia-local-dev-token-2024" ^
  -d "{\"to\":\"soda-yeti\",\"content\":\"Hello from Machine #2!\",\"type\":\"chat\"}"

# Check messages
curl http://localhost:3000/api/relay/messages?limit=10 ^
  -H "X-Api-Token: pia-local-dev-token-2024"
```

## Step 9: Open the Visor

The Visor should have auto-opened. If not:
- Browser: http://localhost:3000/visor.html
- Desktop app: `npm run desktop`

In the Visor Chat tab you can send messages to all machines.

## Tools Claude Uses on This Machine

| Tool | What It Does | Install |
|------|-------------|---------|
| Playwright MCP | Browser screenshots, clicks, UI testing | `claude mcp add playwright -- cmd /c npx -y @playwright/mcp@latest` |
| Windows MCP | System info, window management | `claude mcp add windows-mcp -- cmd /c uvx windows-mcp` |
| GitHub MCP | Code sync, PRs, commits | `claude mcp add --transport http github https://api.githubcopilot.com/mcp/` |

## Fleet Map

```
Machine #1 (izzit7) ◄──► Machine #2 (YOU) ◄──► Machine #3 (soda-yeti)
100.73.133.3              YOUR-IP               100.102.217.69
HUB                       SPOKE                 SPOKE
```

## Verify Everything Works

```bash
# 1. Your server is running
curl http://localhost:3000/api/health -H "X-Api-Token: pia-local-dev-token-2024"

# 2. Hub is reachable
curl http://100.73.133.3:3000/api/health -H "X-Api-Token: pia-local-dev-token-2024"

# 3. Machine #3 is reachable
curl http://100.102.217.69:3000/api/health -H "X-Api-Token: pia-local-dev-token-2024"

# 4. MCPs are connected
claude mcp list
```
