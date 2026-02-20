# PIA × SodaLabs — Master System Vision
**Written by Claude Sonnet 4.6 | Session: 2026-02-20**
**Source: Full planning session with Mic — sketches, conversations, research synthesis**

---

> This document captures the complete architecture vision for PIA × SodaLabs as understood after multiple planning sessions. It includes technical definitions, architectural patterns, agent specs, and my own analysis of what makes this system genuinely different. Read this before touching anything.

---

## My Overall Read

What you are building is not an AI tool. It is not a chatbot platform. It is not an automation workflow.

**You are building a company that employs AI.**

The distinction matters because every architectural decision flows from it. A tool answers questions. An employee shows up, knows the context, does the work, reports back, gets better over time, and has a name you recognise. Everything in this document — the soul system, the messaging, the scheduling, the memory — exists to make the AI workforce feel and behave like real employees rather than software you have to operate.

The closest parallel in software history: the shift from physical servers (you manage the machine) to serverless functions (you just define the work, the infrastructure figures out where to run it). You are making that same shift for knowledge workers. You define the soul and the responsibilities. PIA figures out which machine, when, and how.

Nobody has packaged this properly yet. The pieces exist — LLMs, orchestration frameworks, task queues, persistent memory. But nobody has wrapped them in *identity first*. That is the gap you are filling.

---

## Table of Contents

1. [The Full System in One Picture](#1-the-full-system-in-one-picture)
2. [The Three Layers](#2-the-three-layers)
3. [The Soul System — Foundation of Everything](#3-the-soul-system)
4. [Every Agent — Complete Specs](#4-every-agent)
5. [The Machine Fleet](#5-the-machine-fleet)
6. [Architectural Patterns](#6-architectural-patterns)
7. [The Intelligence Pipeline](#7-the-intelligence-pipeline)
8. [The Messaging System](#8-the-messaging-system)
9. [The Scheduling System](#9-the-scheduling-system)
10. [The Platforms and Tools](#10-platforms-and-tools)
11. [How This Differs From Everyone Else](#11-how-this-differs)
12. [What Is Genuinely New](#12-what-is-genuinely-new)
13. [Build Order](#13-build-order)
14. [Open Questions](#14-open-questions)

---

## 1. The Full System in One Picture

```
                              YOU
                               │
                    ┌──────────▼──────────┐
                    │    CONTROLLER       │  ← wakes with soul
                    │   "Hi Mic, which    │    knows you by name
                    │    project?"        │    routes everything
                    └──┬──────────────┬──┘
                       │              │
              ┌────────▼───┐    ┌─────▼──────────┐
              │  MONITOR   │    │   FISHER2050    │
              │  (watches  │    │ (project mgr — │
              │  all,      │    │  schedules all  │
              │  pushes)   │    │  machine time)  │
              └────────────┘    └─────┬──────────┘
                                      │
                    ┌─────────────────┼──────────────────┐
                    │                 │                  │
              ┌─────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
              │  ELIYAHU   │   │    ZIGGI    │   │     OWL     │
              │ (knowledge │   │  (quality,  │   │ (persistent │
              │  manager)  │   │   2am audit)│   │  task list) │
              └─────┬──────┘   └─────────────┘   └─────────────┘
                    │
              ┌─────▼──────┐
              │  TIM BUC   │
              │ (librarian │
              │  archivist)│
              └─────┬──────┘
                    │
              ┌─────▼──────┐
              │   RECORDS  │
              │ (Claude SDK│
              │  logs, all │
              │  sessions) │
              └────────────┘

EXECUTION LAYER (dispatched by Fisher2050 via calendar)
              ┌───────────┬───────────┬───────────┐
              │  FARCAKE  │   ANDY    │BIRD FONT. │  WINGSPAN
              │ Research  │ Editorial │  Design   │  Decks
              │    M3     │    M3     │    M2     │   M3
              └───────────┴───────────┴───────────┘
                                │
                    ┌───────────▼──────────┐
                    │    GUMBALLCMS        │  ← publishes output
                    │    VIDEOHOHO         │  ← packages video
                    └──────────────────────┘

PHYSICAL INFRASTRUCTURE
    M1 (Izzit7 — hub)    M2 (Monster — project boss)    M3 (Yeti — execution)
```

---

## 2. The Three Layers

The system operates on three distinct levels simultaneously.

### Layer 1 — Strategic (M1)
**Who lives here:** Controller, Monitor, Fisher2050, Eliyahu, Tim Buc, Owl, Records DB

This is company-level thinking. What projects are running? What is the state of the whole operation? What does the human need to know today?

M1 never does the actual work. It manages, routes, observes, and reports.

### Layer 2 — Project (M2)
**Who lives here:** Whoever is activated as boss of the current project

This is the most important insight from the planning sessions and it was not obvious before: **machines do not have fixed roles**. When a project activates on M2, M2 becomes the orchestrator for that project. It loads the project soul, reads the task list from the Owl, and dispatches to execution layer machines.

M2 is the project brain. It does not do research or write content. It manages the project and coordinates the specialists.

**Project Activation on M2:**
- "Update me where we last left off" → Owl loads task list → context loaded
- Two modes: **BUILD** (autonomous execution) or **PROMPT** (human in conversation)
- On session end: Owl agent updates the task list with progress

### Layer 3 — Execution (M3)
**Who lives here:** Farcake, Andy, Wingspan (the specialists)

This is where work actually happens. Agents on M3 are task-focused, context-loaded workers that produce concrete output. They do not manage anything. They receive a task, execute it, produce a result, and terminate.

---

## 3. The Soul System

Every agent has a soul. This is not a metaphor. It is a technical specification that gets injected into the Claude system prompt at every session start. Without it, you have a generic AI. With it, you have Eliyahu — a specific entity that you recognise across months of interaction.

### The Seven Soul Layers

| Layer | What It Is | Why It Matters |
|---|---|---|
| **Identity** | Name, role, email address, purpose | They know who they are |
| **Personality** | How they communicate, tone, style, quirks | They feel like a real person |
| **Goals** | What they are trying to achieve long-term | They have direction beyond the task |
| **Relationships** | Who they work with and how | They collaborate naturally |
| **Rules** | Hard boundaries — what they cannot do | They stay safe and on-brand |
| **Memory** | Persistent recall across sessions | They remember and grow |
| **Schedule** | When they work, their triggers | They show up on time |

### My Insight on the Soul System

Most AI frameworks skip soul entirely. They give agents a system prompt that says "you are a helpful assistant that does X." That produces a tool.

The soul system does something different: it creates *consistency of character*. When Fisher2050 says "Project health: 82%" — that is Fisher2050 talking. Not "the project management AI." Fisher2050. A specific entity that your team learns to recognise, anticipate, and trust.

This matters commercially because trust compounds over time. A human project manager who has worked with your team for two years is worth more than a new hire with the same skills. Your AI agents are building that same institutional relationship — and the soul system is what makes that possible.

---

## 4. Every Agent — Complete Specs

### CONTROLLER
```
Soul:        Identity as the gateway. Knows the user by name.
             Knowledge of all machines, all projects, all agents.
Trigger:     On-demand (user initiates)
Machine:     M1
Input:       Owl task list + project context + agent roster
Task:        Greet user. "Hi Mic, which computer? Which project?"
             Route to correct machine. Arm the right agent with
             context, memory and skills.
Output:      Activated project on target machine
Reports to:  You
Archives to: Tim Buc
Notes:       The single door into the entire system. You never
             speak to M2 or M3 directly. You speak to Controller.
```

### MONITOR
```
Soul:        Identity as the watchdog. Never sleeps. Has no ego —
             only reports.
Trigger:     Continuous (always running)
Machine:     M1
Input:       Real-time status of all agents across M1, M2, M3
Task:        Watch. Detect failures, stalls, context overload,
             machine going offline.
Output:      Status push to Controller (not waiting to be asked)
Reports to:  Controller
Archives to: Tim Buc
Notes:       KEY DISTINCTION — Monitor PUSHES, not polls.
             This is the Observer pattern. Controller never has
             to ask "what's happening" because Monitor is already
             telling it.
```

### FISHER2050
```
Soul:        Identity: Fisher2050. Organised, proactive, uses
             confidence percentages. Never lets anything slip.
             "Project health: 82%."
Trigger:     9am standup + 6pm summary + on-demand + calendar
Machine:     M1
Input:       Goal from Controller or you + Owl task list
Task:        Break goal into tasks. Schedule machine time on M2/M3
             via calendar. Dispatch agents. Follow up automatically.
             Move things along without being asked.
Output:      Calendar entries (scheduled agent spawns) + task updates
             + standup/summary emails to you
Reports to:  You + M2 (project boss)
Archives to: Tim Buc
Notes:       Fisher2050 is the resource scheduler. He manages
             MACHINE CAPACITY not just tasks. M3 has Farcake and
             Andy — only one can run at a time. Fisher knows this
             and books time slots accordingly.
             Fisher also creates Ziggi's review tasks as follow-ups
             to every specialist completion.
```

### ELIYAHU
```
Soul:        Identity: Eliyahu. Curious analyst. "I noticed
             something..." Pattern connector. Tracks decisions.
Trigger:     6am daily + event-triggered (Tim Buc files new records)
Machine:     M1
Input:       Tim Buc's filed session records from last 24hrs
Task:        Read everything. Connect dots across projects.
             Spot patterns. Farm analysis lists to Fisher2050,
             Ziggi, Farcake. Produce morning briefing.
Output:      Morning briefing email to you (2 minutes, 3 things
             that matter). Analysis lists to other agents.
Reports to:  You
Archives to: Tim Buc
Notes:       Eliyahu does NOT read raw logs. That is Tim Buc's job.
             Eliyahu reads Tim Buc's organised summaries.
             The distinction: Tim Buc is data custodian,
             Eliyahu is intelligence layer.
```

### ZIGGI
```
Soul:        Identity: Ziggi. Meticulous. Architecture smell
             detection. "Ziggi's Verdict: 8/10. Ship it."
Trigger:     2am cron (ephemeral spawn) + after every task
             completion flagged by Fisher2050
Machine:     M2 (any available)
Input:       Last 24hrs of specialist output / specific task output
Task:        Review everything. Rate 1-10. Explain why.
             Show the better way. Teach.
Output:      Quality report. If issues found → Fisher2050 creates
             follow-up task automatically.
Reports to:  Fisher2050
Archives to: Tim Buc
Notes:       The 2am audit is a perfect example of a cron-triggered
             ephemeral agent. Ziggi does not exist during the day.
             At 2am PIA spawns her, she does the audit, terminates.
             By morning the report is in the records.
```

### TIM BUC (invented in this session — not from any prior research)
```
Soul:        Identity: Tim Buc. The librarian. Methodical.
             Nothing gets lost on his watch.
Trigger:     Event-triggered: pinged every time an agent session ends
Machine:     M1 (any available)
Input:       Raw Claude SDK session logs
Task:        Review raw logs. Sort by project/agent/type/date.
             File to Records DB. Tag consumed files (read) and
             produced files (written). Note cost and context %.
Output:      Organised filed records in Records DB
Reports to:  Eliyahu (who reads the files)
Archives to: IS the archive
Notes:       Tim Buc is the reason Eliyahu can do his job.
             Without Tim Buc, raw logs sit unread.
             With Tim Buc, every session becomes institutional
             knowledge that Eliyahu can build on.
             This pipeline (session → Tim Buc → Records → Eliyahu)
             is what makes the system learn over time.
```

### OWL
```
Soul:        Identity: The Owl. Silent. Persistent. Never forgets.
Trigger:     Session start (reads) + session end (writes)
Machine:     M1 (DB)
Input:       Task updates from all agents across all sessions
Task:        Maintain the living task list. At session start:
             feed context to Controller and Fisher2050.
             At session end: update with what got done + what
             is still pending.
Output:      "Update me where we last left off" → task state
Reports to:  Controller + Fisher2050
Archives to: Is the persistent store (not archived, lives forever)
Notes:       The Owl is the one thing that cannot be ephemeral.
             Every other agent can be deleted and recreated.
             The Owl holds continuity. Without it every session
             starts from zero. With it every session builds
             on everything that came before.
```

### FARCAKE
```
Soul:        Identity: Farcake. Research engine. Does not search
             — investigates.
Trigger:     Fisher2050 calendar entry
Machine:     M3
Input:       Research brief + project context + Owl task state
Task:        Pull from multiple sources. Cross-reference.
             Validate claims. Produce structured findings.
Output:      Research report → Tim Buc (archived) + M2 (boss)
Reports to:  M2 project boss + Tim Buc
Status:      Building
Notes:       Farcake's output is the raw material for Andy.
             The pipeline: Farcake researches → Andy writes →
             GumballCMS publishes. Fisher2050 orchestrates the
             timing so Andy starts when Farcake is done.
```

### ANDY
```
Soul:        Identity: Andy. Editorial engine. Writes in YOUR
             voice — not generic AI voice.
Trigger:     Fisher2050 calendar entry (after Farcake completes)
Machine:     M3
Input:       Farcake output + voice samples + editorial brief
Task:        Take research to publication in the client's voice.
             Produce drafts that sound like the human wrote them.
Output:      Draft content → GumballCMS (publish) or Videohoho
             (video production) + Tim Buc (archive)
Reports to:  M2 project boss + Tim Buc
Status:      Building
```

### BIRD FOUNTAIN
```
Soul:        Identity: Bird Fountain. Design production at scale.
             Never asks for a brief twice.
Trigger:     Fisher2050 calendar entry
Machine:     M2
Input:       Creative brief + brand assets + style references
Task:        Production runs of campaign assets, social batches,
             creative variations.
Output:      Asset batch → GumballCMS or Videohoho + Tim Buc
Reports to:  M2 project boss + Tim Buc
Status:      Live
```

### WINGSPAN
```
Soul:        Identity: Wingspan. Presentation expert.
             Knows every version of every deck.
Trigger:     Fisher2050 calendar entry
Machine:     M3
Input:       Deck brief + version history + audience profile
Task:        Track, update and produce presentation decks.
             Know which version went to which investor/client.
Output:      Updated deck + version log → Tim Buc
Reports to:  M2 project boss + Tim Buc
Status:      Live
```

---

## 5. The Machine Fleet

### M1 — Izzit7 (The Hub)
- **Role**: Strategic layer. Always on. The brain of the operation.
- **Runs**: Controller, Monitor, Fisher2050, Eliyahu, Tim Buc, Owl, Records DB
- **PIA**: Hub server on port 3000. Dashboard at /mission-control.html
- **Email**: m1@sodalabs.ai | Channel: #m1
- **Tailscale**: Hub and coordinator

### M2 — Monster (Project Orchestrator)
- **Role**: Dynamic. Becomes boss of whichever project is activated.
- **IP**: 100.127.165.12 (Tailscale)
- **Default runs**: Bird Fountain (design)
- **As project boss**: Loads project soul + task list, dispatches to M3
- **Email**: m2@sodalabs.ai | Channel: #m2

### M3 — Yeti (Execution)
- **Role**: Worker layer. Runs specialist agents on Fisher2050's schedule.
- **Runs**: Farcake, Andy, Wingspan
- **Email**: m3@sodalabs.ai | Channel: #m3
- **Notes**: Only one agent runs at a time. Fisher2050 manages the queue.

---

## 6. Architectural Patterns

### Pattern 1: Ephemeral Compute
Agents do not run 24/7. They are spawned when needed and terminated when done.

```
Trigger fires → PIA spawns agent with soul loaded
→ Agent works → Agent terminates
→ Tim Buc pinged → session archived
```

An agent not running is not "off." It simply does not exist yet. Its soul file waits on disk. Its identity persists in the database. It will be the same agent next time because the soul is consistent — even though the compute is ephemeral.

**My insight:** This is the key to running a large AI workforce cheaply. You pay for compute only when the agent is actively working. Ziggi at 2am costs nothing for 23 hours and 55 minutes per day. The soul — the thing that makes Ziggi *Ziggi* — costs nothing to store.

### Pattern 2: Calendar-Triggered Machine-Agnostic Dispatch
Fisher2050 writes to the calendar. PIA watches the calendar. At trigger time, PIA checks which machine is available and spawns there.

```
Fisher2050 creates: [ZIGGI] 2am audit — any machine
→ 2am: PIA checks M1 available? → spawn on M1
→ M1 offline? → try M2 → spawn on M2
```

**Why calendar over cron:** The calendar is editable by Fisher2050 without touching code. Non-technical people can see "what's the AI team doing this week." The calendar entry carries context (project, task, machine preference) — a cron job cannot.

### Pattern 3: Dynamic Machine Roles
No machine has a permanent role below M1. M2 becomes boss of whatever project is active. This means:

- Multiple projects = multiple boss machines
- Fisher2050 can spin up a NEW machine as boss of a new project
- Machine hardware (GPU, RAM) can be matched to project needs
- A machine going offline just means Fisher2050 reassigns its projects

**My insight:** This is the architectural equivalent of cloud auto-scaling. You are not tied to "M2 is always the Farcake machine." You are building a flexible fleet where any machine can take any role.

### Pattern 4: Push Over Poll (Observer Pattern)
Monitor Agent never waits to be asked. Fisher2050 does not wait for you to ask "what's the status?" Eliyahu does not wait for you to ask "what happened yesterday?"

Every agent that produces information PUSHES it to whoever needs it.

This is architecturally important because it means the human in the loop is never the bottleneck. The system runs whether you check in or not.

### Pattern 5: Pipeline Architecture
Output from one agent is automatically the input to the next.

```
Farcake (research) → Andy (writes it) → GumballCMS (publishes it)
Bird Fountain (designs) → Videohoho (packages into video) → GumballCMS (publishes)
Any agent (works) → Tim Buc (files it) → Eliyahu (reads it) → You (briefed on it)
```

Fisher2050 manages the sequencing. He knows Farcake must finish before Andy starts. He creates the calendar entries in order.

---

## 7. The Intelligence Pipeline

This is the loop that makes the system learn over time. It did not exist before this planning session — it emerged from the combination of Tim Buc + Records + Eliyahu.

```
AGENT WORKS
     │
     ▼
SESSION ENDS — Claude SDK logs generated:
  - Full message history
  - Every tool call + result
  - Thinking / reasoning steps
  - Tokens used + context % per step
  - Cost (total_cost_usd)
  - Files consumed (read) vs produced (written)
     │
     ▼
TIM BUC WAKES (ephemeral, event-triggered)
  Reviews raw logs
  Sorts: project / agent / type / date
  Tags: consumed files, produced files, cost, quality flags
  Files to Records DB
  Terminates
     │
     ▼
ELIYAHU READS (6am or event-triggered)
  Reads Tim Buc's organised summaries
  Connects patterns across projects
  "This type of task fails Ziggi review 40% of the time"
  "That decision from 3 weeks ago is causing problems now"
  Farms analysis lists to Fisher2050, Ziggi, Farcake
     │
     ▼
YOU RECEIVE
  2-minute morning briefing
  3 things that actually matter today
  Decisions surfaced, not buried
```

**My insight:** Most AI systems have zero memory beyond the current session. Some have RAG (retrieval). Very few have an actual *intelligence layer* that reads past sessions and builds understanding over time. The Tim Buc → Eliyahu pipeline is the difference between an AI that forgets everything and an AI that gets smarter about your business every day.

---

## 8. The Messaging System

Every agent and machine is a real addressable entity — not software you configure, but a team member you can contact.

### Addresses

| Entity | Email | Channel |
|---|---|---|
| M1 (Izzit7) | m1@sodalabs.ai | #m1 |
| M2 (Monster) | m2@sodalabs.ai | #m2 |
| M3 (Yeti) | m3@sodalabs.ai | #m3 |
| Controller | controller@sodalabs.ai | #controller |
| Fisher2050 | fisher2050@sodalabs.ai | #operations |
| Eliyahu | eliyahu@sodalabs.ai | #briefings |
| Ziggi | ziggi@sodalabs.ai | #quality |
| Tim Buc | timbuc@sodalabs.ai | #library |
| Farcake | farcake@sodalabs.ai | #research |
| Andy | andy@sodalabs.ai | #editorial |
| Bird Fountain | birdfountain@sodalabs.ai | #design |
| Wingspan | wingspan@sodalabs.ai | #presentations |

### Message Types

**Inbound (You → Agents):**
- Email fisher2050@sodalabs.ai with a new goal → Fisher creates tasks
- WhatsApp via GumballCMS → routes to Fisher2050
- Voice to Controller (on demand)

**Outbound (Agents → You):**
- Eliyahu: 6am morning briefing email
- Fisher2050: 9am standup, 6pm evening summary
- Ziggi: Quality report after each audit
- Monitor: Urgent alerts when something breaks

**Internal (Agent → Agent):**
- Via PIA WebSocket channels (already exists, needs formalising)
- Fisher2050 → Farcake: calendar event = task dispatch
- Tim Buc → Eliyahu: "new records filed" event
- M2 → M3: task brief + context
- M3 → M2: task output + results

### Shared Channels

| Channel | Who's In It | Purpose |
|---|---|---|
| #company | All agents | Company-wide updates |
| #project-farcake | M2 + Farcake + Andy + Fisher | All comms for this project |
| #quality | Ziggi + Fisher2050 | Quality reports + follow-up tasks |
| #briefings | Eliyahu → You | Morning briefings only |
| #m1-m2 | M1 + M2 | Direct machine channel |
| #m1-m3 | M1 + M3 | Direct machine channel |

### Infrastructure
- **PIA Hub = Postmaster**: Routes all internal WebSocket messages + email integration
- **GumballCMS = WhatsApp Bridge**: You → WhatsApp → GumballCMS → Fisher2050 inbox
- **Technical term**: Unified Communications (UC) + Message-Oriented Middleware

**My insight:** Giving agents email addresses and channels is not a cosmetic feature. It changes how humans interact with the system. You do not "configure a workflow" — you email Fisher2050. That psychological shift is the difference between using software and working with a team. SodaLabs sells teams, not software. The messaging system makes that real.

---

## 9. The Scheduling System

### Fisher2050 as Resource Scheduler

Fisher2050 does not just create tasks. He manages **machine capacity**. M3 has Farcake, Andy, and Wingspan — but only one agent can run at a time. Fisher knows this and books time slots accordingly.

```
Fisher2050 receives goal: "Research and write Afrotech brief"

Step 1: Check M3 availability
  → Farcake free at 2pm for 2 hours
  → Andy free after Farcake finishes (4pm)

Step 2: Create calendar entries
  📅 2pm: M3 — spawn Farcake — "Research Afrotech competitors"
  📅 4pm: M3 — spawn Andy — "Write brief from Farcake output"

Step 3: PIA hub watches calendar
  2pm: M3 online? → spawn Farcake with context + memory loaded
  Farcake works → terminates → Tim Buc pinged

Step 4: Fisher sees completion, queues Andy immediately
  (does not wait to be asked)

Step 5: 4pm: PIA spawns Andy on M3 with Farcake output as input
  Andy writes → terminates → Tim Buc pinged

Step 6: Fisher updates you: "Brief complete. Ziggi reviewing."
```

### "Move Things Along" — Fisher's Proactive Behaviour

| Situation | Fisher Does |
|---|---|
| M3 finishes a task | Immediately queues next task without being asked |
| M3 running overtime | Flags to M2 boss — "overrunning, cut or continue?" |
| M3 goes offline | Reschedules to next available machine |
| Two tasks competing for M3 | Fisher decides priority, moves lower one to next slot |
| Ziggi flags quality issue | Creates re-do task + reschedules machine time |
| Task blocked on external input | Parks it, works on unblocked tasks, revisits |

### Calendar Entry Format

Each calendar entry carries everything the agent needs:

```
Title:       [AGENT_NAME] Task Description
Time:        When to spawn
Duration:    Expected session length
Machine:     Preferred machine (or "any")
Context:     {
               project: "farcake",
               task: "research_afrotech",
               input: "path/to/farcake_brief.md",
               soul: "farcake_soul.json",
               priority: "high"
             }
On complete: ping_tim_buc + notify_fisher2050
```

---

## 10. Platforms and Tools

### GumballCMS
- **What it is**: WhatsApp-first CMS that also builds UI and websites
- **Status**: Live
- **Role in architecture**: Output delivery layer + WhatsApp bridge
- **Receives from**: Andy (content), Bird Fountain (assets), Wingspan (decks)
- **Also**: You → WhatsApp → GumballCMS → Fisher2050 (inbound messaging)
- **Key capability**: "Send a message, it becomes a post. Approve from chat, it goes live."
- **My insight**: GumballCMS is the last mile. Agents produce, GumballCMS ships. But it is also the entry point — because WhatsApp is where humans already live. The same platform that publishes agent output also receives human instruction.

### Videohoho
- **What it is**: Electron desktop video editor with smart fades + FFmpeg
- **Status**: Working (Phase 2 pending)
- **Location**: C:\Users\mic\Downloads\Videohoho\
- **Role in architecture**: Video packaging for Andy + Bird Fountain output
- **Phase 1 (done)**: Video + audio merge, smart fades, export MP4
- **Phase 2 (pending)**: ElevenLabs TTS, captions, audio ducking, frame analysis
- **Receives from**: Andy (content/voiceover), Bird Fountain (visual assets)
- **Outputs to**: GumballCMS (publish) or direct download

---

## 11. How This Differs From Everyone Else

| System | What It Does | Critical Gap vs PIA/SodaLabs |
|---|---|---|
| **CrewAI** | Multi-agent task execution | No soul, no multi-machine, no identity, no scheduling, no memory |
| **AutoGen (Microsoft)** | Agent conversations | No personality, cloud-only, no calendar dispatch, no filing |
| **LangGraph** | Agent workflow graphs | Pure developer tool, no product layer, no employee concept |
| **Claude Code native** | team_create, task_create | Single machine, terminal only, no soul, no identity |
| **Zapier / Make** | Automation workflows | Not intelligent, no memory, no personality, not agentic |
| **OpenAI Assistants** | Persistent AI assistants | Cloud-only, no multi-machine, no soul system, no scheduling |
| **Salesforce Einstein** | Enterprise AI | Cloud-locked, expensive, no character, no multi-machine |

**PIA/SodaLabs does all of this simultaneously:**
- Soul-first identity (who before what)
- Multi-machine fleet on your hardware (not cloud)
- Calendar-triggered machine-agnostic ephemeral compute
- Intelligence pipeline (Tim Buc → Records → Eliyahu)
- Digital Worker Identity (agents with email + channels)
- Dynamic machine roles (any machine can be any role)
- SodaLabs eats its own cooking — runs agency ON the system it sells

---

## 12. What Is Genuinely New

Not "different from competitors" — genuinely new concepts that do not have mainstream names yet.

### 1. Tim Buc Pipeline (invented this session)
`Session ends → Tim Buc files → Eliyahu synthesises → briefing`

A dedicated archivist agent whose only job is to take raw AI session logs and make them readable for an intelligence agent. No competitor has this pattern. It is the mechanism by which the system builds institutional knowledge — and it was not in any research before today.

### 2. Soul-First Architecture
Everyone starts with "what can it do?" You start with "who is it?" Fisher2050 has a personality, a communication style, and a name before he has any tasks. This changes how clients relate to the AI — they learn to trust Eliyahu specifically, not "the knowledge management AI."

### 3. Activity Feed with AI Narration
A non-technical briefing screen showing what the AI workforce did, explained in plain English for stakeholders who do not understand the technology. Nobody is doing this. It is the difference between a server log and a morning newspaper.

### 4. Machine-as-Project-Orchestrator
Machines taking dynamic management roles rather than fixed roles. The physical machine becomes the project brain when a project activates on it. This enables parallel projects on separate machines without central coordination overhead.

### 5. Calendar as Agent Operating Schedule
Using a calendar (not code) as the scheduling system, with Fisher2050 writing to it. Means the entire AI workforce schedule is visible, editable by non-technical people, and carries context as part of each entry.

### 6. Digital Worker Identity
Agents with email addresses, channel memberships, and communication patterns that mirror human team members. The WhatsApp → GumballCMS → Fisher2050 path means you can task your AI project manager from your phone without opening any dashboard.

---

## 13. Build Order

Write the spec first. Build second. Test in isolation. Then connect.

| # | What | Why This Order |
|---|---|---|
| 1 | **Fisher2050 Agent Spec** | He activates everything else. Without Fisher nothing is schedulable. |
| 2 | **Agent Records DB** (Claude SDK log capture) | Tim Buc needs records to exist before he can file. |
| 3 | **Tim Buc** (event-triggered archivist) | Once records exist, Tim Buc enables the whole intelligence pipeline. |
| 4 | **Owl persistence layer** | Session continuity. "Update me where we left off." |
| 5 | **Calendar-triggered spawn** | Replaces all manual agent launching. Fisher2050 becomes the scheduler. |
| 6 | **Messaging system** (email per agent + channels) | Digital worker identity. Makes agents feel real. |
| 7 | **Monitor Agent** | Continuous watchdog. Push not poll. |
| 8 | **Context % bar on agent cards** | Core observability. SDK already exposes this. |
| 9 | **Activity Feed** | Non-technical briefing screen. Last piece of the UX. |

---

## 14. Open Questions

Things that need a decision before building.

**Q1: M2 project boss soul**
When M2 activates as boss of Project Farcake, what soul does it load?
- Option A: Farcake's soul (research identity)
- Option B: Generic project manager soul + Farcake knowledge injected
- Option C: A "project lead" soul specific to each project

**Q2: Ziggi location**
Ziggi is listed as running on M2 but M2 is the project boss. Does Ziggi run on M1 instead? Or does Ziggi only spawn when M2 is not actively bossing a project?

**Q3: Email infrastructure**
- Self-hosted (Postfix) vs third-party (SendGrid/Mailgun for outbound, Gmail for inbound)?
- Does each agent get a real monitored inbox or does PIA intercept all @sodalabs.ai email?

**Q4: GumballCMS integration depth**
- Is GumballCMS a passive output target (agents send files) or an active agent (GumballCMS runs its own agent)?
- Does GumballCMS have its own soul and email address?

**Q5: Videohoho automation**
- Phase 2 features needed before it can receive agent output automatically?
- Or can Andy/Bird Fountain output be piped in manually for now?

---

*Document written by Claude Sonnet 4.6 | 2026-02-20*
*Source: Full planning session with Mic — Canva sketches, conversations, research synthesis*
*This is a living document. Update it when decisions are made on the open questions.*
