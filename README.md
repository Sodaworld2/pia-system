# PIA - Project Intelligence Agent

A supervisor system for managing fleets of AI agents (Claude, Gemini, etc.) across multiple machines.

## What PIA Does

- **Monitor** - Watch work logs from 43+ AI agents in real-time
- **Assess** - Use local LLMs (RTX 5090 + Ollama) to evaluate agent progress
- **Auto-Update** - Automatically maintain sitemaps, roadmaps, and project docs
- **Remote Control** - CLI bridge to control agents from anywhere (phone, laptop)
- **Fleet Dashboard** - High-density visualization of all agents across all machines

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Phone / Laptop                       │
│                   (Empire Dashboard)                         │
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
│ 20 agents│    │ 15 agents│      │ 8 agents │
└─────────┘     └─────────┘       └─────────┘
```

## Status

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Design & Mockups | ✅ Complete |
| 1 | Core Infrastructure | 🔴 Not Started |
| 1 | Remote CLI Bridge | 🔴 Not Started |
| 1 | Fleet Dashboard (functional) | 🔴 Not Started |
| 2 | Central Hub | 🔴 Not Started |
| 2 | Mobile PWA | 🔴 Not Started |

## Mockups

Open these HTML files in a browser to see the design:

- `PIA_DASHBOARD_MOCKUP.html` - Main fleet monitoring view
- `CLI_TUNNEL_MOCKUP.html` - Remote terminal control
- `MASTER_DASHBOARD.html` - Central control panel
- `FLEET_DASHBOARD_MOCKUP.html` - 43-agent matrix view

## Tech Stack (Planned)

- **Runtime**: Node.js
- **AI**: Ollama (local) + Claude/Gemini APIs (cloud fallback)
- **Real-time**: WebSockets
- **Terminal**: node-pty
- **Frontend**: Vanilla JS (dashboards are self-contained HTML)
- **Hardware**: Optimized for RTX 5090 local inference

## Documentation

- [Implementation Plan](implementation_plan.md) - Full technical architecture
- [Feature Spec](FULL_FEATURE_SPEC.md) - Complete feature checklist
- [Development Roadmap](DEVELOPMENT_ROADMAP.html) - Timeline and phases
- [User Guide](USER_GUIDE.md) - How to use PIA

## License

MIT
