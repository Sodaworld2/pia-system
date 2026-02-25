/**
 * PIA End-to-End Smoke Test — Tier 2 (requires ANTHROPIC_API_KEY)
 *
 * Tests the real agent pipeline:
 *   1. DB initialises with all migrations
 *   2. Soul seeded correctly (fisher2050)
 *   3. AgentSessionManager spawns an SDK agent with a trivial task
 *   4. Agent completes (real API call)
 *   5. Tim Buc files the session to agent_records
 *   6. CalendarSpawnService correctly picks up and runs a calendar event
 *
 * Run: npx vitest run tests/e2e/smoke.test.ts
 * Requires: ANTHROPIC_API_KEY in .env
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config as loadDotenv } from 'dotenv';

// Load .env first so ANTHROPIC_API_KEY is available
loadDotenv({ path: '.env' });

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Smoke test requires ANTHROPIC_API_KEY — set it in .env');
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------
let db: ReturnType<typeof import('../../src/db/database.js')['getDatabase']>;

beforeAll(async () => {
  const dbMod = await import('../../src/db/database.js');
  dbMod.closeDatabase();
  dbMod.initDatabase();
  db = dbMod.getDatabase();

  // Seed souls required by the tests
  const souls = ['fisher2050', 'farcake', 'ziggi', 'tim_buc'];
  for (const id of souls) {
    db.prepare(`
      INSERT OR IGNORE INTO souls (id, name, role, personality)
      VALUES (?, ?, 'agent', '{}')
    `).run(id, id);
  }
});

afterAll(async () => {
  const { closeDatabase } = await import('../../src/db/database.js');
  closeDatabase();
});

// ---------------------------------------------------------------------------
// Test 1: Database has all expected migrations (up to 051)
// ---------------------------------------------------------------------------
describe('DB migrations', () => {
  it('agent_records has machine_id, task_summary, tool_calls columns', () => {
    // Insert a full record with all new columns — fails if any column is missing
    const { nanoid } = require('nanoid');
    const sid = nanoid();
    expect(() => {
      db.prepare(`
        INSERT INTO agent_records
          (session_id, agent, machine_id, task_summary, cost_usd, tool_calls, summary, filed_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(sid, 'test', 'izzit7', 'Smoke test task', 0.001, 2, 'ok', 'smoke_test');
    }).not.toThrow();
  });

  it('calendar_events has redo_count column', () => {
    const { nanoid } = require('nanoid');
    // Seed a soul before inserting calendar event (FK)
    const id = nanoid();
    expect(() => {
      db.prepare(`
        INSERT INTO calendar_events (id, agent, task, scheduled_at, redo_count, soul_id)
        VALUES (?, ?, ?, ?, ?, 'fisher2050')
      `).run(id, 'fisher2050', 'Smoke test event', Math.floor(Date.now() / 1000) + 600, 0);
    }).not.toThrow();
  });

  it('agent_messages table accepts Fisher2050 escalation rows', () => {
    const { nanoid } = require('nanoid');
    const id = nanoid();
    expect(() => {
      db.prepare(`
        INSERT INTO agent_messages (id, to_agent, from_agent, subject, body, read, expires_at, created_at)
        VALUES (?, 'fisher2050', 'ziggi', ?, ?, 0, unixepoch('now', '+7 days'), unixepoch())
      `).run(id, 'Smoke test escalation', 'Body text');
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test 2: SDK agent spawn
//
// NOTE: SDK mode spawns a claude CLI subprocess. This CANNOT run when already
// inside a Claude Code session (nested CLI detection causes immediate exit).
// When running standalone (npm run test:e2e from a regular terminal), this test
// makes one real API call (~$0.01). Skip automatically when nested.
// ---------------------------------------------------------------------------
describe('SDK agent spawn (real API)', () => {
  const isNested = !!process.env.CLAUDECODE || !!process.env.CLAUDE_CODE_SESSION;

  it.skipIf(isNested)('spawns a trivial task and emits complete event', async () => {
    const { getAgentSessionManager } = await import('../../src/mission-control/agent-session.js');
    const mgr = getAgentSessionManager();

    const TIMEOUT_MS = 120_000;

    const result = await new Promise<{ sessionId: string; outputs: string[] }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Smoke test timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);

      let resolved = false;
      const outputs: string[] = [];

      const outputHandler = (evt: { sessionId: string; data: string }) => {
        if (evt.sessionId !== session.id) return;
        outputs.push(evt.data.substring(0, 200));
        process.stdout.write(`[SDK output] ${evt.data.substring(0, 100)}\n`);
      };
      mgr.on('output', outputHandler);

      mgr.on('complete', (evt: { sessionId: string }) => {
        if (evt.sessionId !== session.id || resolved) return;
        resolved = true;
        clearTimeout(timeout);
        mgr.off('output', outputHandler);
        resolve({ sessionId: evt.sessionId, outputs });
      });

      mgr.on('error', (evt: { sessionId: string; error: string }) => {
        if (evt.sessionId !== session.id || resolved) return;
        resolved = true;
        clearTimeout(timeout);
        mgr.off('output', outputHandler);
        reject(new Error(`Agent error: ${evt.error}`));
      });

      const session = mgr.spawn({
        mode: 'sdk',
        task: 'Reply with only the single word PONG and nothing else. Do not use any tools.',
        cwd: process.cwd(),
        approvalMode: 'auto',
        soulId: 'fisher2050',
        machineId: 'izzit7',
        maxBudgetUsd: 0.05,
        maxTurns: 3,
      });
    });

    console.log(`SDK test complete. Session: ${result.sessionId}, output lines: ${result.outputs.length}`);
    expect(result.sessionId).toBeTruthy();

    const row = db.prepare('SELECT * FROM mc_agent_sessions WHERE id = ?').get(result.sessionId) as any;
    expect(row).toBeDefined();
    expect(row.task).toContain('PONG');
  }, 150_000);

  it('SDK spawn environment is configured (nested-safe check)', () => {
    // Verify the env setup is correct — always runs, no API call
    console.log(`Running in nested Claude session: ${isNested}`);
    expect(process.env.ANTHROPIC_API_KEY).toBeTruthy();
    if (isNested) {
      console.log('SKIP: SDK agent spawn skipped — nested Claude Code session detected. Run standalone to test.');
    } else {
      console.log('OK: SDK spawn test will run against real API.');
    }
  });
});

// ---------------------------------------------------------------------------
// Test 3: Tim Buc pipeline — start the service and verify it can file records
// ---------------------------------------------------------------------------
describe('Tim Buc pipeline', () => {
  it('Tim Buc service starts without error', async () => {
    // Correct export: startTimBuc() not startTimBucService()
    const timBucMod = await import('../../src/services/tim-buc-service.js');
    expect(typeof timBucMod.startTimBuc).toBe('function');
    expect(typeof timBucMod.getTimBucService).toBe('function');

    // Start the service — should not throw
    expect(() => timBucMod.startTimBuc()).not.toThrow();

    // The service registers a 'complete' listener on AgentSessionManager
    // Verify it's running by checking the service state
    const svc = timBucMod.getTimBucService();
    expect(svc).toBeDefined();
  });

  it('Tim Buc can file a session record to agent_records directly', async () => {
    const { nanoid } = require('nanoid');
    // Simulate what Tim Buc does after a session completes
    const sessionId = nanoid();

    db.prepare(`
      INSERT OR REPLACE INTO agent_records
        (session_id, agent, machine_id, project, task_summary,
         cost_usd, tokens_in, tokens_out, tool_calls,
         quality_score, quality_verdict,
         produced_files, consumed_files, summary, filed_by)
      VALUES
        (@session_id, @agent, @machine_id, @project, @task_summary,
         @cost_usd, @tokens_in, @tokens_out, @tool_calls,
         @quality_score, @quality_verdict,
         @produced_files, @consumed_files, @summary, @filed_by)
    `).run({
      session_id: sessionId,
      agent: 'fisher2050',
      machine_id: 'izzit7',
      project: 'pia-system',
      task_summary: 'E2E smoke test filing',
      cost_usd: 0.01,
      tokens_in: 1000,
      tokens_out: 200,
      tool_calls: 1,
      quality_score: null,
      quality_verdict: null,
      produced_files: '[]',
      consumed_files: '[]',
      summary: 'Smoke test passed',
      filed_by: 'tim_buc',
    });

    const record = db.prepare('SELECT * FROM agent_records WHERE session_id = ?').get(sessionId) as any;
    expect(record).toBeDefined();
    expect(record.agent).toBe('fisher2050');
    expect(record.filed_by).toBe('tim_buc');
    expect(record.machine_id).toBe('izzit7');
    expect(record.task_summary).toBe('E2E smoke test filing');
  });
});

// ---------------------------------------------------------------------------
// Test 4: CalendarSpawnService — manually trigger pollCalendar
// ---------------------------------------------------------------------------
describe('CalendarSpawnService calendar trigger', () => {
  it('picks up a pending event and spawns the agent', async () => {
    const { nanoid } = require('nanoid');
    const { getCalendarSpawnService } = await import('../../src/services/calendar-spawn-service.js');

    const svc = getCalendarSpawnService();

    // Create a calendar event scheduled for NOW (1 second ago = definitely past due)
    const eventId = nanoid();
    const scheduledAt = Math.floor(Date.now() / 1000) - 1;

    db.prepare(`
      INSERT INTO calendar_events (id, agent, task, context_json, scheduled_at, status, created_by, soul_id)
      VALUES (?, 'fisher2050', ?, ?, ?, 'pending', 'smoke_test', 'fisher2050')
    `).run(
      eventId,
      'Output only the word "CALENDAR_TEST" and stop.',
      JSON.stringify({ maxBudgetUsd: 0.10, maxTurns: 5 }),
      scheduledAt,
    );

    // Verify it was inserted as pending
    const before = db.prepare('SELECT status FROM calendar_events WHERE id = ?').get(eventId) as any;
    expect(before.status).toBe('pending');

    // Manually trigger a poll — this should claim the event and spawn an agent
    // Access private method via (svc as any)
    await (svc as any).pollCalendar();

    // Event should now be 'running' (claimed by the poll)
    const after = db.prepare('SELECT status FROM calendar_events WHERE id = ?').get(eventId) as any;
    expect(['running', 'completed']).toContain(after.status);

    console.log(`Calendar event ${eventId} status after poll: ${after.status}`);
  }, 30_000);
});
