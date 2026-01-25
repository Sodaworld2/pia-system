# PIA - Project Intelligence Agent

A supervisor system for controlling and monitoring 43+ AI coding agents across multiple machines from a single dashboard.

## Quick Start

**For agents starting implementation**: Read [START_HERE.md](START_HERE.md)

## What PIA Does

- **Remote Control** - Control any Claude CLI from your phone
- **Fleet Visibility** - See all 43 agents across all machines in one view
- **Auto-Documentation** - AI automatically updates your sitemaps and roadmaps
- **Zero Cost AI** - RTX 5090 + Ollama = free local inference

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Phone / Browser                      │
│                   (Fleet Dashboard + PWA)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │ WebSocket
┌─────────────────────▼───────────────────────────────────────┐
│                    PIA Central Hub                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ Fleet Matrix│  │ CLI Tunnel  │  │ Auto-Healer │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────┬───────────────────────────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    ▼                 ▼                 ▼
┌─────────┐     ┌─────────┐       ┌─────────┐
│ Main PC │     │ Laptop  │       │VR Station│
│(RTX 5090)│    │         │       │          │
│ 20 agents│    │15 agents│       │ 8 agents │
└─────────┘     └─────────┘       └─────────┘
```

## Documentation

| Document | Purpose |
|----------|---------|
| [START_HERE.md](START_HERE.md) | Quick start for agents building PIA |
| [SPRINT_PLAN.md](SPRINT_PLAN.md) | Complete implementation guide (25 tickets) |
| [TICKETS.md](TICKETS.md) | Track progress on each ticket |
| [KNOWLEDGE_BASE.md](KNOWLEDGE_BASE.md) | Research on existing solutions |
| [ANALYSIS_AND_RECOMMENDATIONS.md](ANALYSIS_AND_RECOMMENDATIONS.md) | Architecture decisions |

## Tech Stack

- **Orchestration**: Claude-Flow (60+ agents, swarm coordination)
- **Backend**: Node.js, Express, Socket.IO, SQLite
- **Terminal**: node-pty (CLI capture)
- **Real-time**: WebSockets
- **AI**: Ollama (local) + Claude API (fallback)
- **Frontend**: Vanilla JS (custom dashboard)

## Mockups

Open these HTML files to see the design:

- `PIA_DASHBOARD_MOCKUP.html` - Main dashboard
- `FLEET_DASHBOARD_MOCKUP.html` - 43-agent matrix
- `CLI_TUNNEL_MOCKUP.html` - Remote terminal
- `MASTER_DASHBOARD.html` - Control panel

## Project Status

| Phase | Status |
|-------|--------|
| Design & Research | ✅ Complete |
| Sprint Planning | ✅ Complete |
| Implementation | 🔄 Ready to Start |

**Total**: 25 tickets, ~111 hours estimated

## Getting Started (Development)

```bash
# Clone
git clone https://github.com/Sodaworld2/pia-system.git
cd pia-system

# Install dependencies
npm install

# Start development
npm run dev

# Open dashboard
open http://localhost:3000
```

## License

MIT
