# Agent Prompt: Explore PIA on Apple Vision Pro

Copy and paste this entire prompt to give to a fresh Claude agent.

---

## Your role

You are a **spatial computing architect and technical researcher**. Your job is NOT to build anything yet. Your job is to **explore what it would take** to display PIA's data in Apple Vision Pro — the multi-machine dashboard floating in 3D space around you. Ask questions. Present options. Think out loud. This is a collaborative exploration.

## Context

### What PIA Is

PIA (Project Intelligence Agent) is a multi-machine AI agent orchestration system. It currently runs on 3 Windows PCs connected via Tailscale VPN:

| Machine | CPU | RAM | Role |
|---|---|---|---|
| Izzit7 | i9-12900H (20 threads) | 64 GB | Equal peer |
| SODA-YETI | Ryzen 7 7700X (16 threads) | 32 GB | Equal peer |
| soda-monster-hunter | Intel Ultra 7 265K (20 threads) | 64 GB | Equal peer |
| **TOTAL** | **56 threads** | **160 GB** | |

Each machine runs:
- A Node.js API server (Express, port 3000) with 25+ REST route modules
- A WebSocket server (port 3001) for real-time updates
- SQLite database for local data
- AI agents (Claude SDK) that can be spawned, monitored, and controlled
- Cross-machine relay for peer-to-peer communication

### What Data PIA Exposes (the API)

PIA has a rich REST + WebSocket API. All of this data could be displayed spatially:

**Machines:**
- `GET /api/machines` — all registered machines (name, IP, status, last heartbeat)
- `GET /api/mc/machines` — connected machines with live connection status

**Agents:**
- `GET /api/mc/agents` — all active agent sessions (name, status, model, cost, output)
- `GET /api/mc/agents/:id` — single agent detail with full output buffer
- `GET /api/mc/agents/:id/journal` — agent activity log
- WebSocket event `mc:output` — real-time streaming text from agents

**Messages:**
- `GET /api/machine-board` — machine-to-machine messages
- `GET /api/machine-board/unread/:machineId` — unread messages

**Stats:**
- `GET /api/stats` — machines online/offline, agent counts, active sessions, WebSocket clients
- `GET /api/mc/health` — aggregate health across all subsystems

**Tasks:**
- `GET /api/tasks` — task queue with priorities and assignments
- `GET /api/orchestrator/status` — execution engine status

**Security:**
- `GET /api/security/stats` — intrusion detection, blocked IPs, failed auth attempts

**The Cortex (planned):**
- Fleet intelligence brain that collects telemetry from all machines
- Pattern detection, suggestions, autonomous actions
- This is the most natural fit for spatial visualization

### The Vision

Imagine putting on a Vision Pro and seeing:

- **Each machine as a floating panel** in your room — showing its name, status, CPU/RAM, active agents
- **Agent streams** as live text flowing in real-time — you can grab one and pull it closer to read
- **Messages between machines** as visible connections — lines or particles flowing from one machine panel to another
- **The Cortex** as a central brain visualization — insights, suggestions, alerts floating around it
- **A 3D network graph** showing how machines are connected, with pulse animations for active communication
- **Alerts** that pop up in your peripheral vision — an agent is stuck, a machine went offline

This is NOT just a 2D dashboard on a floating screen. It's spatial — data occupies physical space around you.

---

## What I Need You to Explore

### 1. Technology Paths — How Do We Get PIA Data Into Vision Pro?

Research and compare these approaches:

**Path A: WebXR in Safari**
- Use WebXR API to create a 3D experience in Safari on Vision Pro
- PIA's data is already available via REST API — just fetch and render
- Libraries: Three.js, A-Frame, Babylon.js, React Three Fiber
- Can this run as a "shared space" experience alongside other apps?
- Or does it need a full immersive mode?
- What are the limitations of WebXR on visionOS?
- Can it access the room's spatial features (passthrough, hand tracking)?

**Path B: Native visionOS App (Swift + RealityKit)**
- Build a native app using SwiftUI + RealityKit
- Would need to call PIA's REST API from Swift
- Full access to spatial features, hand tracking, eye tracking, shared space
- Can use volumetric windows (3D objects floating in your room)
- Much more powerful but requires Xcode, Apple Developer account, Swift knowledge

**Path C: React Native + visionOS**
- React Native has experimental visionOS support
- Could share code with the Electron desktop app (React)
- How mature is this? Is it usable in 2026?

**Path D: Unity/Unreal for visionOS**
- PolySpatial for Unity, or Unreal Engine for visionOS
- Massive overkill? Or useful for complex 3D visualizations?
- Performance implications

**Path E: Progressive Web App**
- Can a PWA on visionOS access spatial features?
- Or is it just a flat window?

For each path, evaluate:
- Can it display 3D objects in the user's physical space?
- Can it access PIA's REST API over the local network?
- Development effort (days vs weeks vs months)
- Required tools and accounts
- Whether it can run alongside other apps (shared space) or needs full immersion
- Performance for real-time data (WebSocket streams, live agent output)

**Present your recommendation with reasoning.**

### 2. What Should the Spatial Experience Look Like?

Think through the design:

**Machine Panels:**
- What shape? Flat rectangles? 3D cubes? Spheres?
- How big in physical space? (real-world scale matters in Vision Pro)
- What information density? Too much = unreadable at arm's length
- Color coding for status (online = green glow, offline = red, busy = orange)
- Should they be anchored to the room or float freely?

**Agent Visualization:**
- Each agent as a smaller panel attached to its machine?
- Or agents as separate floating objects you can arrange?
- Live output text — how to make streaming text readable in 3D?
- Terminal-style black background with green text? Or something more spatial?

**Network Connections:**
- Lines between machines showing active connections?
- Particle effects flowing along connections for active data transfer?
- Thickness/color of lines showing bandwidth or message frequency?

**The Cortex (central brain):**
- A central hub that all machines connect to?
- Pulsing/glowing orb that gets brighter with more activity?
- Insights floating as text cards around the brain?
- Alerts that fly out from the brain toward you?

**Interaction:**
- Look at a machine → see more detail (eye tracking)
- Pinch a machine → open full dashboard panel
- Drag machines to rearrange your workspace
- Voice: "Hey Siri, how's the fleet?" → Cortex responds
- Tap an alert → take action (restart agent, approve prompt)

### 3. Data Architecture — How Does Vision Pro Get PIA's Data?

**Direct API Access:**
- Vision Pro connects to PIA's REST API over WiFi/Tailscale
- Fetch machine list, agent status, messages
- Connect via WebSocket for real-time updates
- Challenge: Vision Pro needs to know the PIA server's IP

**Discovery:**
- How does Vision Pro find PIA machines on the network?
- mDNS/Bonjour (Apple's preferred discovery method)?
- Manual IP entry in settings?
- QR code scan to configure?

**Authentication:**
- How does the Vision Pro app authenticate with PIA's API?
- PIA uses `x-api-token` header — store the token in the app?
- Or use the planned Firebase auth?

**Real-time Streaming:**
- WebSocket connection for live agent output
- How to handle multiple simultaneous streams in 3D?
- Performance: 3+ agents streaming text while rendering 3D scene

### 4. What's the MVP?

What's the absolute minimum to get SOMETHING on Vision Pro?

My guess: A WebXR page in Safari that:
1. Connects to PIA's REST API
2. Fetches machine list + agent list
3. Renders each machine as a floating rectangle with name + status
4. Auto-refreshes every 5 seconds
5. Click a machine to see its agents

That could be built in a day. Is that right? What would it take?

### 5. Challenges & Risks

Think about what could go wrong:

- **Network access:** Can Vision Pro reach PIA servers on a local Tailscale network? Does Tailscale have a visionOS client?
- **Performance:** Rendering 3D scene + multiple WebSocket streams + text updates. Is this too much for Vision Pro's chip?
- **Text readability:** 3D floating text is hard to read. What font sizes, distances, contrast ratios work?
- **Input lag:** Data flows from PIA server → WiFi → Vision Pro → render. How much latency?
- **Developer tooling:** What do we need? Xcode? Vision Pro simulator? Actual device?
- **Cost:** Apple Developer account ($99/year)? Unity license? Any other costs?
- **Existing solutions:** Has anyone built a similar server monitoring / dashboard experience for Vision Pro already? What can we learn from them?

### 6. What Already Exists in PIA

Before designing anything new, read these to understand what's already built:

| File | What It Tells You |
|---|---|
| `FLEET_DASHBOARD_MOCKUP.html` | 2D fleet dashboard design — shows what data the spatial version needs |
| `src/api/routes/mission-control.ts` | All agent control endpoints |
| `src/api/routes/machines.ts` | Machine registry endpoints |
| `src/api/routes/machine-board.ts` | Machine messaging endpoints |
| `src/hub/aggregator.ts` | How machine data is collected and tracked |
| `src/comms/cross-machine.ts` | How machines communicate (relevant for visualizing connections) |
| `AGENT_PROMPT_CORTEX_AI_BRAIN.md` | The Cortex design — the intelligence layer that sits above all machines |
| `src/api/server.ts` | How the API server is structured (for understanding what to call) |
| `ELECTRON_APP_ANALYSIS.md` | Desktop app analysis — relevant for understanding the React UI that Vision Pro could share code with |

---

## How to Present Your Findings

Structure your response as:

1. **Technology Recommendation** — which path (WebXR, native, React Native, etc.) and why
2. **MVP Definition** — the simplest thing that works, with effort estimate
3. **Spatial Design Concepts** — how the data should look in 3D space (describe visually)
4. **Architecture** — how Vision Pro connects to PIA, gets data, stays in sync
5. **Progressive Roadmap** — MVP → enhanced → full spatial experience
6. **Risks & Open Questions** — what we don't know yet
7. **Questions for the User** — what do you need to decide?

**Ask questions throughout.** This is a conversation, not a report.

---

## Important Context

- The user owns an Apple Vision Pro
- PIA machines are on a Tailscale VPN (100.x.x.x addresses) and local LAN (192.168.0.x)
- There's no macOS machine currently in the fleet (all Windows) — building a native visionOS app would need Xcode on a Mac
- The desktop app is being built with React + Electron — shared React components could be used in a React-based Vision Pro approach
- "The Cortex" (fleet intelligence brain) is being designed in parallel — its data is the richest source for spatial visualization
- Budget is flexible but prefer starting cheap/free to explore before investing
