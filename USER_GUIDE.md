# PIA System: Day 1 User Guide

This guide explains how to use the PIA System with your existing tools (Antigravity/Claude, GitHub, Firebase).

## The Concept

Instead of just opening a terminal and typing commands yourself, you open a "Tunnel" that lets the AI type commands for you *and* lets you control it from a dashboard.

## Your New Workflow

### Step 1: Start the "Local Boss" (The Control Server)

This small background program lets the dashboard talk to your computer's tools.
**Do this once per session.**

1. Open a Terminal (PowerShell or Git Bash).
2. Run:

    ```bash
    npm run control:server
    ```

    *Result: "SodaWorld Local Control Server running on port 3001"*

---

### Step 2: "Wrap" Your Agent (The Tunnel)

This is where you normally open Antigravity. Instead of running it directly, you run the wrapper.

1. Open a **New Terminal Tab**.
2. Run:

    ```bash
    node tools/pia-tunnel.mjs
    ```

    *Result: "Connected to PIA Empire. Agent ready."*

**What just happened?**

- Your terminal is now "live streamed" to the dashboard.
- You can still type in it manually if you want.
- But now, the AI can *also* type in it.

---

### Step 3: Open the Dashboard

This is your "Command Center".

1. Open `docs/pia-system/MASTER_DASHBOARD.html` in Chrome/Edge.
2. You will see your agent listed as "Active".

---

## How to use it

### Scene A: You are at your desk

You don't *need* the dashboard. You can just talk to the agent in the terminal (Step 2) like normal.
> **You:** "Deploy to firebase"
> **Agent:** "On it." (Runs `firebase deploy`)

### Scene B: You are away (or viewing the Dashboard)

1. Go to the Dashboard.
2. Click the "Deploy Website" card.
3. **Behind the scenes:**
    - The Dashboard sends a signal to the Local Server.
    - The Local Server tells the Agent (Step 2 terminal): "Type `firebase deploy`".
    - The Agent types it.
    - The Agent sends the logs back to your screen.

## Summary Checklist

- [ ] **Terminal 1**: `npm run control:server` (Keep open)
- [ ] **Terminal 2**: `node tools/pia-tunnel.mjs` (Your Agent)
- [ ] **Browser**: Open `MASTER_DASHBOARD.html`
