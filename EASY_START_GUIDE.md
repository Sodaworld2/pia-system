# PIA Easy Start Guide
## For Non-Technical Users

---

## What is PIA?

PIA (Project Intelligence Agent) is like a **control room** for your AI assistants.

Think of it like this:
- You have multiple computers (machines)
- Each computer can run AI assistants (agents)
- PIA lets you see and control ALL of them from ONE screen

---

## Step 1: Start PIA (You Already Did This!)

Double-click `START.bat` or run `npm start`

You should see the dashboard at: **http://localhost:3000**

---

## Step 2: Why "No Agents Found"?

This is normal! PIA is the **control room** - it's waiting for agents to connect.

An "agent" is an AI assistant running on a computer. You need to:
1. Start a terminal session
2. Run Claude in that terminal

---

## Step 3: Create Your First Terminal Session

### On the Dashboard:

1. Click **"CLI Tunnel"** in the top menu

2. Click the green **"New Session"** button

3. A popup asks "Command to run:"
   - Type: `cmd` (for Windows command prompt)
   - Or type: `powershell`
   - Click OK

4. You should see a black terminal appear!

---

## Step 4: Start Claude in the Terminal

In the black terminal window, type:

```
claude
```

Press Enter.

If Claude is installed, it will start and you'll see the Claude interface.

---

## Step 5: Register This Machine (Optional)

To see this machine in the Fleet Matrix:

1. The machine auto-registers when PIA starts
2. Go to **"Fleet Matrix"** tab
3. You should see your computer listed

---

## What Each Tab Does

| Tab | What It Does |
|-----|--------------|
| **Fleet Matrix** | Shows all your computers and AI agents |
| **CLI Tunnel** | Remote terminal - run commands on any machine |
| **MCPs** | Install extra tools for Claude (like database access) |
| **Alerts** | Warnings when something needs attention |
| **AI Models** | Shows AI costs and which AI providers are available |

---

## Common Questions

### Q: Why is Fleet Matrix empty?
**A:** You need to start an agent (like Claude) in a terminal session first.

### Q: How do I add another computer?
**A:**
1. Copy the PIA folder to that computer
2. Edit the `.env` file and change `PIA_MODE=local` and set `PIA_HUB_URL=http://YOUR-MAIN-PC-IP:3000`
3. Run `npm start` on that computer

### Q: What's the token for?
**A:** It's like a password. All your machines need the same token to talk to each other.
Default token: `pia-local-dev-token-2024`

### Q: How do I stop PIA?
**A:** Close the terminal window where you ran `npm start`, or press `Ctrl+C`

---

## Quick Start Checklist

- [ ] PIA is running (you see the dashboard)
- [ ] Go to "CLI Tunnel" tab
- [ ] Click "New Session"
- [ ] Type `cmd` or `powershell` and click OK
- [ ] In the black terminal, type `claude` and press Enter
- [ ] Claude is now running and you can give it tasks!

---

## Visual Guide

```
┌─────────────────────────────────────────────────┐
│  PIA Dashboard                                   │
├─────────────────────────────────────────────────┤
│  [Fleet Matrix] [CLI Tunnel] [MCPs] [Alerts]    │
├─────────────────────────────────────────────────┤
│                                                  │
│     1. Click "CLI Tunnel"                       │
│                    ↓                             │
│     2. Click "New Session"                      │
│                    ↓                             │
│     3. Type "cmd" → OK                          │
│                    ↓                             │
│     4. Black terminal appears                   │
│                    ↓                             │
│     5. Type "claude" + Enter                    │
│                    ↓                             │
│     6. Claude is running!                       │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## Need Help?

If something doesn't work:
1. Make sure you're on http://localhost:3000
2. Check that the terminal window running PIA is still open
3. Try refreshing the browser page (F5)

---

## Next Steps

Once you have Claude running:
- Give it tasks in the terminal
- Watch the Fleet Matrix - your agent will appear there
- Try opening multiple sessions for multiple tasks!
