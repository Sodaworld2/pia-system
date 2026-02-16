# Agent Prompt: Build Machine-to-Machine Message Board System

Copy and paste this entire prompt to give to a Claude agent.

---

## What we're building and WHY

PIA is a multi-machine system where several computers (Machine 1, Machine 2, Machine 3, etc.) each run their own PIA instance. All machines are **equal peers** — no machine is the boss.

We need a **message board system** so machines can communicate with each other. Think of it like each machine has its own inbox — any machine can send a message to any other machine, and messages are stored persistently so nothing gets lost.

**Why this matters:** When Claude agents on different machines are working on tasks, they need to coordinate. Machine 1 might say "I finished the API, run the tests on your side." Machine 2 needs to see that message, act on it, and reply "Tests passed." Right now messages are fire-and-forget — they disappear. We need them stored and visible.

## What already exists in PIA (DO NOT rebuild these — extend them)

### 1. Agent Bus (`src/comms/agent-bus.ts`)
- In-memory message system for agents talking to agents
- Has: send(), broadcast(), getMessages(), markAsRead(), subscribe()
- Message types: `direct`, `broadcast`, `command`, `status`
- Stores up to 1000 messages per agent in memory
- **Limitation:** In-memory only, messages lost on restart. Only for agents on the SAME machine.

### 2. Cross-Machine Relay (`src/comms/cross-machine.ts`)
- Machine-to-machine communication over WebSocket, Tailscale, ngrok, Discord, or REST API
- Has: registerMachine(), sendMessage(), broadcastMessage(), subscribe()
- Message types: `chat`, `command`, `status`, `file`, `task`, `heartbeat`
- **Limitation:** Messages are logged but not persisted to database. No inbox concept.

### 3. Messages API (`src/api/routes/messages.ts`)
- REST endpoints for agent messaging: send, broadcast, get inbox, mark read
- Routes: POST /api/messages/send, POST /api/messages/broadcast, GET /api/messages/:agentId, etc.
- **Limitation:** Only for agents, not machines. Uses Agent Bus (in-memory).

### 4. AI Conversations table (in `src/db/database.ts`, migration `025_dao_foundation`)
- Database table `ai_conversations` with: id, dao_id, module_id, user_id, role, content, timestamps
- **This is for AI module chat only** (human talks to coach/legal/governance modules)

### 5. Relay API (`src/api/routes/relay.ts`)
- POST /api/relay/send — send message to a specific machine
- POST /api/relay/broadcast — broadcast to all machines
- POST /api/relay/register — register a machine
- GET /api/relay/machines — list connected machines
- GET /api/relay/messages — get message history (from in-memory log)
- GET /api/relay/poll/:machineId — poll for messages

---

## What you need to build

### Part 1: Database table for machine messages

Add a new migration to `src/db/database.ts` in the migrations array. Find the last migration number and add the next one.

```sql
CREATE TABLE IF NOT EXISTS machine_messages (
  id TEXT PRIMARY KEY,
  from_machine_id TEXT NOT NULL,
  from_machine_name TEXT NOT NULL,
  to_machine_id TEXT NOT NULL,        -- '*' means broadcast to all
  to_machine_name TEXT,
  type TEXT NOT NULL DEFAULT 'chat',   -- chat, command, status, task, file, alert
  subject TEXT,                        -- optional subject line
  content TEXT NOT NULL,
  metadata TEXT,                       -- JSON string for extra data
  is_read INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  read_at TEXT,

  -- For threading/replies
  reply_to_id TEXT,                    -- message ID this is replying to
  thread_id TEXT                       -- groups messages in a conversation thread
);

CREATE INDEX IF NOT EXISTS idx_machine_msg_to ON machine_messages(to_machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_msg_from ON machine_messages(from_machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_msg_thread ON machine_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_machine_msg_read ON machine_messages(is_read);
CREATE INDEX IF NOT EXISTS idx_machine_msg_created ON machine_messages(created_at);
```

### Part 2: Database queries

Create a new file `src/db/queries/machine-messages.ts`:

Functions needed:
- `saveMessage(msg)` — insert a message into the table
- `getInbox(machineId, options?)` — get messages TO this machine (with pagination, filter by read/unread/type)
- `getOutbox(machineId, options?)` — get messages FROM this machine
- `getThread(threadId)` — get all messages in a thread
- `getMessage(messageId)` — get a single message
- `markAsRead(messageId)` — mark message as read, set read_at timestamp
- `markAllAsRead(machineId)` — mark all messages for a machine as read
- `archiveMessage(messageId)` — soft delete (set is_archived = 1)
- `getUnreadCount(machineId)` — count of unread messages
- `searchMessages(machineId, query)` — full-text search in content/subject

### Part 3: API routes

Create a new file `src/api/routes/machine-messages.ts`:

```
GET    /api/machine-messages/inbox              — Get this machine's inbox
GET    /api/machine-messages/outbox             — Get this machine's sent messages
GET    /api/machine-messages/unread-count       — Get count of unread messages
GET    /api/machine-messages/thread/:threadId   — Get a full thread
GET    /api/machine-messages/:id                — Get a single message
POST   /api/machine-messages/send               — Send a message to another machine
POST   /api/machine-messages/broadcast          — Send to all machines
POST   /api/machine-messages/:id/read           — Mark as read
POST   /api/machine-messages/read-all           — Mark all as read
POST   /api/machine-messages/:id/reply          — Reply to a message (creates thread)
DELETE /api/machine-messages/:id                — Archive a message
```

**When sending a message:**
1. Save it to the LOCAL database (outbox)
2. Send it via the Cross-Machine Relay to the target machine
3. The target machine's PIA receives it via relay and saves it to ITS local database (inbox)

**When receiving a message (via relay):**
1. The Cross-Machine Relay receives the message
2. Save it to the local database as an inbox message
3. Broadcast via WebSocket to any open Mission Control dashboards (real-time notification)

### Part 4: Wire into Cross-Machine Relay

In `src/comms/cross-machine.ts`, add a handler for incoming messages of type `chat`:

When the relay receives a message with type `chat`, `command`, or `task`:
1. Import the `saveMessage` function from the new queries file
2. Save the incoming message to the `machine_messages` table
3. Emit an event so the UI can update in real-time

### Part 5: Wire into the API server

In `src/api/server.ts`:
1. Import the new `machineMessagesRouter`
2. Add: `app.use('/api/machine-messages', machineMessagesRouter);`

### Part 6: Get this machine's identity

The message system needs to know "who am I?" Read from config:
- `config.hub.machineName` — this machine's name (from `PIA_MACHINE_NAME` env var)
- Need a `PIA_MACHINE_ID` env var too — a unique ID for this machine

If `PIA_MACHINE_ID` is not set, generate one on first run and save it to a file (`data/machine-id.txt`) so it persists.

---

## How it works end-to-end

```
Machine 1 user sends message:
  POST /api/machine-messages/send
  { "to": "machine-2", "content": "Run the tests please", "type": "task" }
      │
      ▼
Machine 1 PIA:
  1. Saves to local DB (outbox)
  2. Sends via Cross-Machine Relay to Machine 2
      │
      ▼
Machine 2 PIA (receives via relay):
  1. Saves to local DB (inbox)
  2. Pushes notification via WebSocket to Mission Control UI
      │
      ▼
Machine 2 Mission Control:
  Shows notification: "New message from Machine 1"
  User (or agent) reads it and can reply
      │
      ▼
Reply flows back the same way: Machine 2 → Relay → Machine 1 inbox
```

---

## Important design decisions

1. **Each machine stores its OWN messages.** Machine 1's database has Machine 1's inbox and outbox. Machine 2's database has Machine 2's inbox and outbox. There is no central database.

2. **All machines are equal peers.** Any machine can message any other machine. There's no "hub" that routes messages — the relay handles delivery directly.

3. **Messages persist.** Unlike the current in-memory Agent Bus, machine messages survive restarts because they're in SQLite.

4. **Threading support.** Messages can be replies to other messages, grouped into threads. This lets conversations flow naturally.

5. **Message types matter.** A `chat` message is informational. A `command` message means "do this." A `task` message means "here's a job." A `status` message is an update. An `alert` is urgent. The UI can treat these differently.

6. **Offline tolerance.** If Machine 2 is offline when Machine 1 sends a message, the relay will fail. Machine 1 should save the message locally as "pending delivery" and retry when Machine 2 comes back online. Add a `delivery_status` field: `sent`, `delivered`, `failed`, `pending`.

---

## Testing

After building, verify:

1. **Local message storage:**
```bash
# Send a message (to yourself for testing)
curl -X POST http://localhost:3000/api/machine-messages/send \
  -H "Content-Type: application/json" \
  -d '{"to": "self", "content": "Test message", "type": "chat"}'

# Check inbox
curl http://localhost:3000/api/machine-messages/inbox

# Check unread count
curl http://localhost:3000/api/machine-messages/unread-count
```

2. **Cross-machine delivery** (needs two PIA instances running):
- Send from Machine 1 to Machine 2
- Verify message appears in Machine 2's inbox
- Reply from Machine 2
- Verify reply appears in Machine 1's inbox

3. **Threading:**
- Send a message, get its ID
- Reply to it, verify thread_id is set
- Get thread, verify both messages appear

---

## Files to create/modify

| File | Action |
|---|---|
| `src/db/database.ts` | Add new migration for `machine_messages` table |
| `src/db/queries/machine-messages.ts` | **NEW** — all database query functions |
| `src/api/routes/machine-messages.ts` | **NEW** — REST API endpoints |
| `src/api/server.ts` | Add machine-messages router |
| `src/comms/cross-machine.ts` | Add handler to save incoming messages to DB |
| `src/config.ts` | Add `PIA_MACHINE_ID` to config |

---

## What this enables later

Once machine messaging works:
- **Mission Control UI** can show a message panel for each machine
- **Agents can send messages** between machines as part of their work
- **Task delegation** — Machine 1 sends a task message, Machine 2's agent picks it up
- **Status updates** — machines broadcast their health/progress automatically
- **Vision Pro** — each machine's message board becomes a floating panel in 3D space

---
