# DAO Rebuild Decision Journal
## Hub (Machine #1) — Auto-Updated by Orchestrator
## Started: February 12, 2026

---

## Decision Log Format
Each decision: **WHAT** → **WHY** → **ALTERNATIVES REJECTED** → **DEVIL'S ADVOCATE** → **VERDICT**

---

## Decision #1: SQLite over PostgreSQL for v2
**WHAT**: Keep SQLite (via Knex) as the database for the Foundation spec instead of migrating to PostgreSQL.

**WHY**:
- Existing v1 uses SQLite successfully with 14 migrations
- Zero infrastructure cost (no separate DB server)
- Single-file DB is portable across machines
- Knex abstraction means we can migrate later with minimal code changes

**ALTERNATIVES REJECTED**:
- PostgreSQL: Better for production scale, has pgvector for embeddings, concurrent writes. REJECTED because it adds deployment complexity and the app isn't at that scale yet.
- Supabase: Hosted Postgres + auth + real-time. REJECTED because it adds external dependency and monthly cost.

**DEVIL'S ADVOCATE**:
SQLite has no concurrent write support. If 50 users are submitting proposals and voting simultaneously, WAL mode helps but it's not true concurrency. The knowledge_items table will grow large with embeddings — SQLite doesn't have pgvector.

**VERDICT**: KEEP SQLite for now. Add `PRAGMA journal_mode=WAL;` for better read concurrency. Plan PostgreSQL migration for when user count exceeds 100. The Knex abstraction layer means migration is a config change, not a rewrite. Embeddings will use a separate vector store (Pinecone/Qdrant) when needed.

**Risk Level**: LOW (reversible via Knex)

---

## Decision #2: Firebase Auth over custom JWT
**WHAT**: Keep Firebase Auth for authentication instead of building custom JWT auth.

**WHY**:
- Already integrated in v1 (frontend + Cloud Functions)
- Provides magic links, email/password, social auth out of the box
- Free tier handles 50k monthly active users
- Security handled by Google (no password storage liability)

**ALTERNATIVES REJECTED**:
- Custom JWT: Full control, no vendor lock-in. REJECTED because it's a significant security surface to maintain.
- Clerk/Auth0: Modern auth providers. REJECTED because Firebase is already integrated and working.
- Solana wallet-only: Web3 native. REJECTED because non-crypto users need email auth too.

**DEVIL'S ADVOCATE**:
Firebase Auth creates vendor lock-in with Google. If Firebase pricing changes or features are deprecated (it's happened before — Firebase Realtime DB → Firestore transition), migration is painful. The backend uses `firebase-admin` SDK which is a hard dependency.

**VERDICT**: KEEP Firebase Auth. The lock-in risk is acceptable because: (1) user credentials are standard email/password, exportable; (2) the backend auth middleware abstraction means swapping providers requires changing one file; (3) time-to-market matters more than theoretical vendor independence.

**Risk Level**: LOW (abstracted behind middleware)

---

## Decision #3: 9 AI Modules as separate classes vs single LLM with personas
**WHAT**: Implement each of the 9 AI modules (Coach, Legal, Finance, etc.) as separate TypeScript classes implementing the Universal Agent Interface.

**WHY**:
- Each module needs its own private knowledge base
- Different modules need different tools (Legal needs PDFKit, Finance needs Recharts data)
- Modules can run concurrently on different cost tiers
- Clear separation of concerns — Coach doesn't accidentally give legal advice

**ALTERNATIVES REJECTED**:
- Single LLM with system prompt switching: Simpler, cheaper, but no knowledge isolation. Persona bleed is a real problem.
- Microservices: Each module as a separate service. Overkill for current scale. Adds network latency and deployment complexity.

**DEVIL'S ADVOCATE**:
9 separate module classes is architecturally complex. Each needs its own knowledge base, learning pipeline, and tool configuration. That's 9x the maintenance. Most users will primarily interact with 2-3 modules (Coach, Legal, Finance). The rest may be underused. Also, inter-module communication adds latency — Coach asking Legal a question requires serialization, bus message, deserialization, response.

**VERDICT**: PROCEED with 9 modules BUT implement incrementally. Start with Coach (most used) and Legal (most complex), then add others. Use a BaseModule class that handles 80% of common functionality. Inter-module communication is synchronous in-process (not HTTP) since they run on the same server.

**Risk Level**: MEDIUM (complexity, but mitigated by BaseModule)

---

## Decision #4: Event Bus as in-process vs BullMQ+Redis
**WHAT**: Use a simple in-process EventEmitter-based bus instead of BullMQ+Redis for inter-module communication.

**WHY**:
- No additional infrastructure (no Redis server needed)
- Sub-millisecond latency for module-to-module messages
- Simple to debug (all in one process)
- Sufficient for single-server deployment

**ALTERNATIVES REJECTED**:
- BullMQ + Redis: Production-grade job queue with retries, priorities, delayed jobs. REJECTED for v2 foundation because it requires Redis server setup on every machine.
- NATS/RabbitMQ: Enterprise messaging. Way overkill.

**DEVIL'S ADVOCATE**:
In-process EventEmitter has no persistence. If the server crashes mid-task, all queued events are lost. No retry mechanism. No priority queuing. When we scale to multi-server, we'll need to rip this out and replace with BullMQ anyway.

**VERDICT**: PROCEED with in-process EventEmitter for v2 Foundation. Add a thin adapter layer so swapping to BullMQ later is a config change:
```typescript
interface EventBus {
  emit(event: BusEvent): void;
  on(type: string, handler: (event: BusEvent) => void): void;
}
```
This interface can be backed by EventEmitter now, BullMQ later.

**Risk Level**: LOW (adapter pattern makes it swappable)

---

## Decision #5: Write specs FIRST, then implement
**WHAT**: Write Foundation, API Contracts, and State Machines specs before touching any code.

**WHY**:
- The briefing identified 13 missing spec areas — building without specs leads to rework
- Specs serve as documentation AND contracts between modules
- Multiple machines/agents can implement in parallel once specs exist
- User explicitly wanted "obvious things worked out in detail"

**ALTERNATIVES REJECTED**:
- Code-first, spec-later: Faster initial progress but leads to inconsistencies and gaps.
- Spec one module, build it, spec next: More iterative but slower overall because parallel work is blocked.

**DEVIL'S ADVOCATE**:
Specs can become stale quickly. If implementation reveals the spec was wrong, updating both the code AND the spec is double the work. Also, 3 spec documents may total 2000+ lines of markdown that no one reads completely.

**VERDICT**: PROCEED with specs-first BUT keep them living documents. Each spec has an "Execution Checklist" that gets checked off during implementation. Specs are stored in the repo (not external docs) so they stay versioned with the code. Max 1 day on specs, then switch to implementation.

**Risk Level**: LOW (worst case: we have good docs even if slightly stale)

---

## Decision #6: Remote PTY for cross-machine implementation
**WHAT**: Use PIA's remote PTY sessions to create files and run commands on Machine #3's DAO repo from Machine #1.

**WHY**:
- Hub maintains central coordination
- No need for Machine #3's Claude to be in an active session
- Direct terminal access means we can run anything

**ALTERNATIVES REJECTED**:
- Git-only: Push files to GitHub, Machine #3 pulls. Slower round-trip, requires human to trigger pull.
- Machine #3 Claude does everything: Better file access but requires active Claude session and human approval of permissions.

**DEVIL'S ADVOCATE**:
PTY sessions have buffer limits (~4KB visible at a time). Creating large files via PTY is cumbersome — you have to use PowerShell here-strings or echo commands. If the PTY session drops, work is lost. Also, there's no syntax checking — a typo in a PowerShell command could create a corrupted file.

**VERDICT**: HYBRID approach. Write spec files locally (full IDE quality), push to GitHub. Use PTY for: (1) running builds, (2) running migrations, (3) git operations, (4) verification. Don't create large source files via PTY — push them via git instead.

**Risk Level**: MEDIUM (PTY reliability, but git fallback exists)

**UPDATE**: Revised approach — write implementation files locally, commit to DAO repo via GitHub, then pull on Machine #3 via PTY. Best of both worlds.

---

## Improvement Proposals (Self-Generated)

### Proposal #1: PIA should auto-journal relay messages
**Problem**: Important cross-machine decisions happen in relay messages but aren't persisted (Issue #5 from simulation).
**Proposal**: Auto-append relay messages to a daily journal file. Every message tagged as "decision" or "architecture" gets logged to `JOURNAL_{date}.md`.
**Status**: PROPOSED — implement after Foundation spec work.

### Proposal #2: Add a /api/specs endpoint to PIA
**Problem**: Specs are markdown files scattered across repos. No central API to query "what's the current spec for agreements?"
**Proposal**: PIA serves spec files via API. Machines can query `GET /api/specs/foundation` to get the latest spec.
**Status**: PROPOSED — nice to have, not blocking.

### Proposal #3: Spec validation via TypeScript
**Problem**: Specs define types in markdown but nothing enforces they match actual code.
**Proposal**: Generate TypeScript types FROM the spec, then typecheck against implementation. Spec becomes the source of truth.
**Status**: PROPOSED — high value but requires tooling work.

---

*Journal started: February 12, 2026*
*Auto-updated by Hub Orchestrator*
*Next review: After Foundation implementation completes*
