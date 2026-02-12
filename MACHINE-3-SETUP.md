# Machine #3 (soda-yeti) Update Instructions

You are Machine #3 in the PIA fleet. You're ALREADY running PIA but need to update to the latest code.

## Your Info
- **Name:** soda-yeti
- **Role:** Spoke
- **Tailscale IP:** 100.102.217.69
- **Specs:** Ryzen 7 7700X, 32GB RAM

## Step 1: Pull Latest Code

```bash
cd C:\path\to\pia-system    # wherever you cloned it
git pull origin master
npm install
npm run build
```

## Step 2: Restart PIA

Stop the current server (Ctrl+C if running in terminal), then:

```bash
npm run dev
```

The Visor will auto-open in your browser.

## Step 3: Install/Verify MCPs

```bash
# Playwright MCP - Browser control
claude mcp add playwright -- cmd /c npx -y @playwright/mcp@latest

# Windows MCP - System control
claude mcp add windows-mcp -- cmd /c uvx windows-mcp

# GitHub MCP - Code sync between machines
claude mcp add --transport http github https://api.githubcopilot.com/mcp/

# Check all MCPs
claude mcp list
```

## Step 4: Re-register with Hub

```bash
# Register yourself on Machine #1's hub
curl -X POST http://100.73.133.3:3000/api/relay/register ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Token: pia-local-dev-token-2024" ^
  -d "{\"id\":\"soda-yeti\",\"name\":\"Soda-Yeti (Machine #3)\",\"hostname\":\"soda-yeti\",\"project\":\"PIA\",\"tailscaleIp\":\"100.102.217.69\",\"channels\":[\"api\",\"tailscale\"]}"

# Register Machine #1 on YOUR relay
curl -X POST http://localhost:3000/api/relay/register ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Token: pia-local-dev-token-2024" ^
  -d "{\"id\":\"hub-izzit7\",\"name\":\"izzit7 (Machine #1 Hub)\",\"hostname\":\"izzit7\",\"project\":\"PIA\",\"tailscaleIp\":\"100.73.133.3\",\"channels\":[\"api\",\"tailscale\"]}"
```

## Step 5: Test Messaging

```bash
# Send a message to Machine #1
curl -X POST http://localhost:3000/api/relay/send ^
  -H "Content-Type: application/json" ^
  -H "X-Api-Token: pia-local-dev-token-2024" ^
  -d "{\"to\":\"hub-izzit7\",\"content\":\"Soda-yeti updated and online!\",\"type\":\"chat\"}"

# Check messages
curl http://localhost:3000/api/relay/messages?limit=10 ^
  -H "X-Api-Token: pia-local-dev-token-2024"
```

## What's New Since Your Last Pull

- Cross-machine HTTP message delivery (messages actually reach remote machines now)
- `/api/relay/incoming` endpoint for receiving messages
- Visor auto-opens on startup
- Message history loads in Chat tab
- Message polling every 3 seconds
- Security tab (Network Sentinel IDS)
- Desktop Electron app (`npm run desktop`)
- GitHub MCP support

## Fleet Map

```
Machine #1 (izzit7) ◄──► Machine #2 (new) ◄──► Machine #3 (YOU - soda-yeti)
100.73.133.3              TBD                    100.102.217.69
HUB                       SPOKE                  SPOKE
```

## Verify

```bash
curl http://localhost:3000/api/health -H "X-Api-Token: pia-local-dev-token-2024"
curl http://100.73.133.3:3000/api/health -H "X-Api-Token: pia-local-dev-token-2024"
claude mcp list
```
