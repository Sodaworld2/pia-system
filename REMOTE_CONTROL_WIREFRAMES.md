# Remote Machine Control — UI Wireframes

## 1. FULL DASHBOARD OVERVIEW

How it all fits together. The existing 3-column layout stays the same,
with power states added to machine cards and a new desktop viewer
that replaces the center panel when activated.

```
+--[ PIA Mission Control ]-----------------------------------------------------+
|  [Agents v]  [Machines v]  [Files v]  [Power v]       mic@hub  |  Settings   |
+---------------+--------------------------------------+------------------------+
| MACHINES      | TERMINAL / DESKTOP VIEWER            | PROMPTS                |
|               |                                      |                        |
| +~~~~~~~~~~~+ | Currently showing: Agent terminal    | Agent-1 is asking:     |
| | Hub (M1)  | | or Desktop Viewer (toggled)          | "May I edit            |
| | * ONLINE  | |                                      |  config.ts?"           |
| | 2 agents  | | > Agent output streaming here...     |                        |
| | [View] [R]| | > ...                                | [Approve] [Deny]       |
| +~~~~~~~~~~~+ | > ...                                |                        |
|               |                                      +------------------------+
| +~~~~~~~~~~~+ |                                      | COST TRACKER           |
| | Studio-PC | |                                      | Total: $2.45           |
| | * OFF     | |                                      | Tokens: 145k in / 23k  |
| | 0 agents  | |                                      |                        |
| | [Wake]    | +--------------------------------------+------------------------+
| +~~~~~~~~~~~+ |  > Enter command...          [Send]  |                        |
|               +--------------------------------------+                        |
| +~~~~~~~~~~~+ |                                      |                        |
| | Render-1  | |                                      |                        |
| | * AWAKE   | |                                      |                        |
| | 0 agents  | |                                      |                        |
| |[Start PIA]| |                                      |                        |
| +~~~~~~~~~~~+ |                                      |                        |
|               |                                      |                        |
| +~~~~~~~~~~~+ |                                      |                        |
| | Render-2  | |                                      |                        |
| | * ONLINE  | |                                      |                        |
| | 1 agent   | |                                      |                        |
| | [View] [R]| |                                      |                        |
| +~~~~~~~~~~~+ |                                      |                        |
|               |                                      |                        |
| [+ Discover ] |                                      |                        |
+---------------+--------------------------------------+------------------------+

Legend:
  * ONLINE  = green dot  (PIA running, connected)
  * AWAKE   = amber dot  (machine on, PIA not running)
  * OFF     = red dot    (machine powered off)
  * UNKNOWN = grey dot   (never checked)

  [View]      = Open Desktop Viewer
  [R]         = RDP (download .rdp file)
  [Wake]      = Send Wake-on-LAN
  [Start PIA] = SSH in and start PIA
  [Discover]  = Find machines on Tailscale network
```


---

## 2. MACHINE CARDS — All 4 States

Each machine card changes its action buttons based on power state.

### State: OFF (red dot)
```
+------------------------------------------+
|  [gear icon]                             |
|  * Studio-PC                             |
|  192.168.1.50 (Tailscale: 100.64.0.3)   |
|                                          |
|  Power: OFF                              |
|  Last seen: 2 hours ago                  |
|                                          |
|  +--------+                              |
|  | Wake   |  <-- sends WoL packet        |
|  +--------+                              |
+------------------------------------------+
```

### State: AWAKE (amber dot, pulsing)
```
+------------------------------------------+
|  [gear icon]                             |
|  * Studio-PC                             |
|  192.168.1.50 (Tailscale: 100.64.0.3)   |
|                                          |
|  Power: AWAKE (no PIA)                   |
|  Ping: 12ms                              |
|                                          |
|  +-----------+  +--------+              |
|  | Start PIA |  |  RDP   |              |
|  +-----------+  +--------+              |
|   ^ SSH bootstrap   ^ opens .rdp file    |
+------------------------------------------+
```

### State: ONLINE (green dot)
```
+------------------------------------------+
|  [gear icon]                             |
|  * Studio-PC                             |
|  192.168.1.50 (Tailscale: 100.64.0.3)   |
|                                          |
|  +-- agent-abc ----+                     |
|  | "Working on..." |  auto              |
|  +-----------------+                     |
|                                          |
|  +--------+  +--------+  +--------+     |
|  | Spawn  |  |  View  |  |  RDP   |     |
|  +--------+  +--------+  +--------+     |
|   ^ new agent   ^ desktop   ^ full RDP   |
+------------------------------------------+
```

### State: UNKNOWN (grey dot)
```
+------------------------------------------+
|  [gear icon]                             |
|  * New-Machine                           |
|  (no IP configured)                      |
|                                          |
|  Power: UNKNOWN                          |
|  Never checked                           |
|                                          |
|  +----------+                            |
|  | Check    |  <-- probe power state     |
|  +----------+                            |
+------------------------------------------+
```


---

## 3. MACHINE SETTINGS MODAL

Opens when you click the gear icon on any machine card.
This is where you configure the network info needed for
WoL, SSH, and remote control.

```
+================================================================+
|                                                                |
|   Machine Settings: Studio-PC                          [X]     |
|                                                                |
|   +--- Network ------------------------------------------+     |
|   |                                                      |     |
|   |  MAC Address (for Wake-on-LAN)                       |     |
|   |  +----------------------------------------------+   |     |
|   |  | AA:BB:CC:DD:EE:FF                             |   |     |
|   |  +----------------------------------------------+   |     |
|   |                                                      |     |
|   |  Tailscale IP              LAN IP                    |     |
|   |  +-------------------+     +-------------------+    |     |
|   |  | 100.64.0.3        |     | 192.168.1.50      |    |     |
|   |  +-------------------+     +-------------------+    |     |
|   |                                                      |     |
|   +------------------------------------------------------+     |
|                                                                |
|   +--- SSH -----------------------------------------------+    |
|   |                                                      |     |
|   |  SSH User                  SSH Port                   |     |
|   |  +-------------------+     +-------------------+    |     |
|   |  | mic               |     | 22                |    |     |
|   |  +-------------------+     +-------------------+    |     |
|   |                                                      |     |
|   |  SSH Method                                          |     |
|   |  +----------------------------------------------+   |     |
|   |  | Tailscale SSH (recommended, no keys needed) v |   |     |
|   |  +----------------------------------------------+   |     |
|   |                                                      |     |
|   +------------------------------------------------------+     |
|                                                                |
|   +--- Wake-on-LAN --------------------------------------+     |
|   |                                                      |     |
|   |  WoL Proxy Machine                                   |     |
|   |  +----------------------------------------------+   |     |
|   |  | (direct - send from this machine)           v |   |     |
|   |  +----------------------------------------------+   |     |
|   |                                                      |     |
|   |  If this machine is on a different network than      |     |
|   |  the hub, pick a machine on the SAME network as      |     |
|   |  the target to relay the wake-up signal.             |     |
|   |                                                      |     |
|   +------------------------------------------------------+     |
|                                                                |
|   +--- PIA -----------------------------------------------+    |
|   |                                                      |     |
|   |  PIA Install Path                                     |     |
|   |  +----------------------------------------------+   |     |
|   |  | C:\Users\mic\Downloads\pia-system             |   |     |
|   |  +----------------------------------------------+   |     |
|   |                                                      |     |
|   +------------------------------------------------------+     |
|                                                                |
|   +------------+  +----------------+                           |
|   | Test SSH   |  | Auto-Discover  |                           |
|   +------------+  +----------------+                           |
|     ^ tries to connect    ^ finds IPs from Tailscale           |
|                                                                |
|                              +----------+  +--------+          |
|                              |  Cancel  |  |  Save  |          |
|                              +----------+  +--------+          |
|                                                                |
+================================================================+
```


---

## 4. DESKTOP VIEWER

When you click "View" on a machine, the center panel switches
from the agent terminal to a desktop viewer. This shows periodic
screenshots of the remote machine's screen. You can click and
type through it.

```
+====================================================================+
|  DESKTOP VIEWER                                                    |
+--------------------------------------------------------------------+
|  TOOLBAR:                                                          |
|  * Studio-PC (1920x1080)  | Refresh: [2s v] | Zoom: [-][100%][+]  |
|  |                        | Quality: [Med v] | [Fit]   | [Close]  |
+--------------------------------------------------------------------+
|                                                                    |
|  +--------------------------------------------------------------+  |
|  |                                                              |  |
|  |                                                              |  |
|  |          +---------------------------+                       |  |
|  |          |  Remote machine's         |                       |  |
|  |          |  desktop appears here     |                       |  |
|  |          |  as a JPEG screenshot     |                       |  |
|  |          |  that refreshes every     |                       |  |
|  |          |  1-5 seconds              |                       |  |
|  |          |                           |                       |  |
|  |          |  You can CLICK anywhere   |                       |  |
|  |          |  on this image and it     |                       |  |
|  |          |  sends a click to the     |                       |  |
|  |          |  remote machine at that   |                       |  |
|  |          |  exact position           |                       |  |
|  |          |                           |                       |  |
|  |          |      (o) <-- click        |                       |  |
|  |          |      indicator            |                       |  |
|  |          |                           |                       |  |
|  |          +---------------------------+                       |  |
|  |                                                              |  |
|  +--------------------------------------------------------------+  |
|                                                                    |
+--------------------------------------------------------------------+
|  KEYBOARD INPUT:                                                   |
|  +---------------------------------------------------+            |
|  | Type here to send keystrokes...                    |  [Send]   |
|  +---------------------------------------------------+            |
|  [Enter]  [Tab]  [Esc]  [Ctrl+C]  [Alt+Tab]                      |
+--------------------------------------------------------------------+
|  STATUS: * Connected  |  Latency: 145ms  |  Last: 12:34:56  |  85KB |
+--------------------------------------------------------------------+
```

### How clicking works:

```
  Your browser                          Remote machine
  +-----------+                         +-------------+
  | You click |  --- coordinates --->   | Click lands |
  | at (240,  |      mapped to         | at (480,    |
  |  135) on  |      native            |  270) on    |
  | the small |      resolution        | the real    |
  | screenshot|                         | screen      |
  +-----------+                         +-------------+
       |                                      |
       v                                      v
  Screenshot refreshes 0.5s later to show the result
```


---

## 5. POWER ACTION FEEDBACK (Progress Toast)

When you click "Wake" or "Start PIA", a progress notification
appears showing each step in real time.

### Wake flow:
```
  +---------------------------------------------+
  |  Waking Studio-PC...                         |
  |                                              |
  |  [done]    Sending Wake-on-LAN packet        |
  |  [active]  Waiting for machine to boot...    |
  |  [pending] Probing for response...           |
  +---------------------------------------------+
           |
           | (30 seconds later...)
           v
  +---------------------------------------------+
  |  Waking Studio-PC...                         |
  |                                              |
  |  [done]    Sending Wake-on-LAN packet        |
  |  [done]    Machine is awake!                 |
  |  [done]    Responding to ping               |
  +---------------------------------------------+
           |
           | (auto-disappears after 3 seconds)
```

### Full bootstrap flow (Wake + Start PIA):
```
  +---------------------------------------------+
  |  Starting Studio-PC...                       |
  |                                              |
  |  [done]    Wake-on-LAN sent                  |
  |  [done]    Machine booted                    |
  |  [active]  SSH connecting...                 |
  |  [pending] Starting PIA service              |
  |  [pending] Waiting for PIA to connect        |
  +---------------------------------------------+
           |
           v
  +---------------------------------------------+
  |  Studio-PC is ready!                         |
  |                                              |
  |  [done]    Wake-on-LAN sent                  |
  |  [done]    Machine booted                    |
  |  [done]    SSH connected                     |
  |  [done]    PIA started                       |
  |  [done]    PIA connected to hub              |
  +---------------------------------------------+
```

### Error case:
```
  +---------------------------------------------+
  |  Waking Studio-PC...                         |
  |                                              |
  |  [done]    Sending Wake-on-LAN packet        |
  |  [FAIL]    Machine did not respond           |
  |                                              |
  |  Check: Is WoL enabled in BIOS?             |
  |  Check: Is the machine plugged in?           |
  |                              [Retry] [Close] |
  +---------------------------------------------+
```


---

## 6. RDP LAUNCH

Simple — clicking RDP downloads a .rdp file that opens
Windows Remote Desktop (mstsc.exe) automatically.

```
  User clicks [RDP] on machine card
       |
       v
  Browser downloads "Studio-PC.rdp"
       |
       v
  Windows opens it with mstsc.exe
       |
       v
  +========================================+
  |  Windows Security                      |
  |                                        |
  |  Enter your credentials for:           |
  |  100.64.0.3 (Studio-PC via Tailscale)  |
  |                                        |
  |  Username: [mic              ]         |
  |  Password: [*************    ]         |
  |                                        |
  |            [Cancel]  [Connect]         |
  +========================================+
       |
       v
  Full Windows Remote Desktop session opens
  (smooth, real-time, full resolution)
```


---

## 7. TAILSCALE DISCOVERY

When you click "Discover" at the bottom of the machine panel,
the system scans your Tailscale network and shows machines
that aren't yet registered in PIA.

```
  +================================================================+
  |                                                                |
  |   Tailscale Network Discovery                           [X]   |
  |                                                                |
  |   Found 5 peers on your tailnet:                               |
  |                                                                |
  |   +--- Already registered ---+                                 |
  |   | * Hub (M1)         100.64.0.1    online     [configured]  |
  |   | * Studio-PC        100.64.0.3    online     [configured]  |
  |   +---------------------------+                                |
  |                                                                |
  |   +--- New (not in PIA yet) ---+                               |
  |   | * render-node-1    100.64.0.5    online     [+ Add]       |
  |   | * render-node-2    100.64.0.6    offline    [+ Add]       |
  |   | * mic-laptop       100.64.0.8    online     [+ Add]       |
  |   +----------------------------+                               |
  |                                                                |
  |                                              [Close]           |
  +================================================================+
```


---

## 8. FLEET OVERVIEW (for 20+ machines)

What it looks like when you scale up. The machine panel
becomes a compact fleet dashboard.

```
+-- MACHINES (16 online / 20 total) ----+
|                                        |
|  NETWORK: Studio LAN (192.168.1.x)    |
|  +~~~+ +~~~+ +~~~+ +~~~+ +~~~+        |
|  |*01| |*02| |*03| |*04| |*05|        |
|  +~~~+ +~~~+ +~~~+ +~~~+ +~~~+        |
|  +~~~+ +~~~+ +~~~+ +~~~+ +~~~+        |
|  |*06| |*07| |*08| |*09| |*10|        |
|  +~~~+ +~~~+ +~~~+ +~~~+ +~~~+        |
|                                        |
|  NETWORK: Remote (Tailscale only)      |
|  +~~~+ +~~~+ +~~~+ +~~~+ +~~~+        |
|  |*11| |*12| |*13| |*14| |*15|        |
|  +~~~+ +~~~+ +~~~+ +~~~+ +~~~+        |
|  +~~~+ +~~~+ +~~~+ +~~~+ +~~~+        |
|  |*16| |*17| |*18| |*19| |*20|        |
|  +~~~+ +~~~+ +~~~+ +~~~+ +~~~+        |
|                                        |
|  * = green (online)                    |
|  * = amber (awake, no PIA)             |
|  * = red (off)                         |
|  * = grey (unknown)                    |
|                                        |
|  [Wake All] [Start All] [Discover]     |
+----------------------------------------+

Clicking any machine tile expands it to the
detailed card view shown in section 2.
```


---

## FLOW SUMMARY: Your Hotel Room Scenario

```
  You're in a hotel. Studio machines are off.

  1. Open PIA dashboard on your laptop
     (connects to hub via Tailscale)

  2. See 20 machine tiles — all RED (off)
     +~~~+ +~~~+ +~~~+ +~~~+ +~~~+
     | * | | * | | * | | * | | * |   all red
     +~~~+ +~~~+ +~~~+ +~~~+ +~~~+

  3. Click [Wake All]
     Progress toasts appear for each machine
     "Waking Machine-1... Machine-2... Machine-3..."

  4. Over the next 30-60 seconds, tiles turn AMBER
     +~~~+ +~~~+ +~~~+ +~~~+ +~~~+
     | * | | * | | * | | * | | * |   turning amber
     +~~~+ +~~~+ +~~~+ +~~~+ +~~~+

  5. Hub auto-runs SSH bootstrap on each awake machine
     "Starting PIA on Machine-1... Machine-2..."

  6. Over the next 30 seconds, tiles turn GREEN
     +~~~+ +~~~+ +~~~+ +~~~+ +~~~+
     | * | | * | | * | | * | | * |   all green!
     +~~~+ +~~~+ +~~~+ +~~~+ +~~~+

  7. You're now fully operational.
     - Spawn AI agents on any machine
     - View any desktop via screenshot viewer
     - Open full RDP for heavy work
     - All from your hotel room
```
