/**
 * PIA Core Loop -- v1.0 Integration Tests
 *
 * Exit gate for v1.0: these tests prove the core DB schema and
 * data-flow contracts work before any real agent is wired up.
 *
 * Uses in-memory SQLite (PIA_DB_PATH=':memory:' set in tests/setup.ts).
 * Each test group gets a fresh DB via beforeEach/afterEach.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

async function freshDb() {
  const mod = await import('../../src/db/database.js');
  mod.closeDatabase();
  mod.initDatabase();
  return mod.getDatabase();
}

async function closeDb() {
  const mod = await import('../../src/db/database.js');
  mod.closeDatabase();
}

async function id(): Promise<string> {
  const { nanoid } = await import('nanoid');
  return nanoid();
}

describe('PIA Core Loop -- v1.0 Integration Tests', () => {

  describe('Database schema', () => {

    beforeEach(async () => { await freshDb(); });
    afterEach(async () => { await closeDb(); });

    it('calendar_events table exists and accepts inserts', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      db.prepare(
        'INSERT INTO calendar_events (id, agent, task, scheduled_at, created_by) VALUES (?, ?, ?, ?, ?)'
      ).run(await id(), 'fisher2050', 'Test task', Math.floor(Date.now() / 1000) + 60, 'test');
      const rows = db.prepare('SELECT * FROM calendar_events').all();
      expect(rows.length).toBe(1);
      expect((rows[0] as any).agent).toBe('fisher2050');
      expect((rows[0] as any).status).toBe('pending');
    });

    it('agent_messages table exists with correct columns', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      db.prepare(
        'INSERT INTO agent_messages (id, to_agent, from_agent, subject, body, metadata, read, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        await id(), 'fisher2050', 'eliyahu', 'Morning briefing',
        'Here are your top 3 priorities',
        JSON.stringify({ priority: 'high' }),
        0, Math.floor(Date.now() / 1000) + 86400,
      );
      const row = db.prepare('SELECT * FROM agent_messages').get() as any;
      expect(row).toBeDefined();
      expect(row.to_agent).toBe('fisher2050');
      expect(row.from_agent).toBe('eliyahu');
      expect(row.read).toBe(0);
      expect(row.expires_at).toBeGreaterThan(0);
    });

    it('agent_records table exists with correct columns', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      const sessionId = await id();
      db.prepare(
        'INSERT INTO agent_records (id, session_id, agent, project, machine, started_at, ended_at, duration_seconds, cost_usd, tokens_in, tokens_out, summary, quality_score, filed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        await id(), sessionId, 'farcake', 'soda-campaign-q2', 'soda-monster-hunter',
        Math.floor(Date.now() / 1000) - 300, Math.floor(Date.now() / 1000),
        300, 0.04, 8000, 2000, 'Researched 12 influencer profiles', 8, 'tim_buc',
      );
      const row = db.prepare('SELECT * FROM agent_records').get() as any;
      expect(row).toBeDefined();
      expect(row.agent).toBe('farcake');
      expect(row.quality_score).toBe(8);
      expect(row.filed_by).toBe('tim_buc');
      expect(row.cost_usd).toBeCloseTo(0.04);
    });

  });

  // Fisher2050 inbox (agent_messages)
  describe('Fisher2050 inbox (agent_messages)', () => {

    beforeEach(async () => { await freshDb(); });
    afterEach(async () => { await closeDb(); });

    it('can write a message to Fisher2050 inbox', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      db.prepare('INSERT INTO agent_messages (id, to_agent, from_agent, body) VALUES (?, ?, ?, ?)')
        .run(await id(), 'fisher2050', 'eliyahu', 'Eliyahu EOD: all agents completed tasks');
      const count = (db.prepare('SELECT COUNT(*) as n FROM agent_messages WHERE to_agent = ?').get('fisher2050') as any).n;
      expect(count).toBe(1);
    });

    it('Fisher2050 inbox read marks messages as read', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      const msgId = await id();
      db.prepare('INSERT INTO agent_messages (id, to_agent, from_agent, body, read) VALUES (?, ?, ?, ?, 0)')
        .run(msgId, 'fisher2050', 'eliyahu', 'Standup: 3 tasks pending');
      db.prepare('UPDATE agent_messages SET read = 1 WHERE id = ?').run(msgId);
      const row = db.prepare('SELECT read FROM agent_messages WHERE id = ?').get(msgId) as any;
      expect(row.read).toBe(1);
      const unread = (db.prepare('SELECT COUNT(*) as n FROM agent_messages WHERE to_agent = ? AND read = 0').get('fisher2050') as any).n;
      expect(unread).toBe(0);
    });

    it('expired messages are filtered by expires_at', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      const now = Math.floor(Date.now() / 1000);
      db.prepare('INSERT INTO agent_messages (id, to_agent, from_agent, body, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(await id(), 'fisher2050', 'ziggi', 'Old quality report', now - 3600);
      db.prepare('INSERT INTO agent_messages (id, to_agent, from_agent, body, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(await id(), 'fisher2050', 'eliyahu', 'Current briefing', now + 86400);
      const active = db.prepare('SELECT * FROM agent_messages WHERE to_agent = ? AND (expires_at IS NULL OR expires_at > ?)')
        .all('fisher2050', now) as any[];
      expect(active.length).toBe(1);
      expect(active[0].from_agent).toBe('eliyahu');
    });

  });

  // Calendar spawn
  describe('Calendar spawn', () => {

    beforeEach(async () => { await freshDb(); });
    afterEach(async () => { await closeDb(); });

    it('can schedule a Farcake task via calendar_events', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      const scheduledAt = Math.floor(Date.now() / 1000) + 3600;
      db.prepare('INSERT INTO calendar_events (id, agent, task, scheduled_at, created_by, context_json) VALUES (?, ?, ?, ?, ?, ?)')
        .run(await id(), 'farcake', 'Research top 10 African music influencers Q2 2026',
             scheduledAt, 'fisher2050', JSON.stringify({ project: 'soda-campaign-q2', priority: 'high' }));
      const row = db.prepare('SELECT * FROM calendar_events WHERE agent = ?').get('farcake') as any;
      expect(row).toBeDefined();
      expect(row.task).toContain('influencers');
      expect(row.status).toBe('pending');
      expect(row.created_by).toBe('fisher2050');
      const ctx = JSON.parse(row.context_json);
      expect(ctx.priority).toBe('high');
    });

    it('pending calendar events are picked up correctly', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      const now = Math.floor(Date.now() / 1000);
      db.prepare('INSERT INTO calendar_events (id, agent, task, scheduled_at, status) VALUES (?, ?, ?, ?, ?)')
        .run(await id(), 'andy', 'Write product copy for SodaLabs', now - 60, 'pending');
      db.prepare('INSERT INTO calendar_events (id, agent, task, scheduled_at, status) VALUES (?, ?, ?, ?, ?)')
        .run(await id(), 'wingspan', 'Build Q3 investor deck', now + 7200, 'pending');
      const due = db.prepare('SELECT * FROM calendar_events WHERE status = ? AND scheduled_at <= ?')
        .all('pending', now) as any[];
      expect(due.length).toBe(1);
      expect(due[0].agent).toBe('andy');
    });

    it('completed events do not re-trigger', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      const now = Math.floor(Date.now() / 1000);
      db.prepare('INSERT INTO calendar_events (id, agent, task, scheduled_at, status) VALUES (?, ?, ?, ?, ?)')
        .run(await id(), 'farcake', 'Already done task', now - 120, 'completed');
      const due = db.prepare('SELECT * FROM calendar_events WHERE status = ? AND scheduled_at <= ?')
        .all('pending', now) as any[];
      expect(due.length).toBe(0);
    });

  });

  // Tim Buc records
  describe('Tim Buc records', () => {

    beforeEach(async () => { await freshDb(); });
    afterEach(async () => { await closeDb(); });

    it('agent_records accepts a valid filing', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      const now = Math.floor(Date.now() / 1000);
      const sessionId = await id();
      db.prepare('INSERT INTO agent_records (id, session_id, agent, project, machine, started_at, ended_at, duration_seconds, cost_usd, tokens_in, tokens_out, summary, produced_files, quality_score, quality_verdict, filed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(await id(), sessionId, 'andy', 'sodalabs-rebrand', 'soda-monster-hunter',
             now - 180, now, 180, 0.02, 4500, 1200,
             'Wrote 3 product descriptions in Mic voice',
             JSON.stringify(['public/copy-v1.md']),
             9, 'Excellent -- on-brand, concise', 'tim_buc');
      const row = db.prepare('SELECT * FROM agent_records WHERE agent = ?').get('andy') as any;
      expect(row).toBeDefined();
      expect(row.summary).toContain('product descriptions');
      expect(row.filed_by).toBe('tim_buc');
      expect(row.quality_verdict).toContain('Excellent');
      const files = JSON.parse(row.produced_files);
      expect(Array.isArray(files)).toBe(true);
      expect(files[0]).toContain('copy-v1');
    });

    it('quality score reflects session signals', async () => {
      const db = (await import('../../src/db/database.js')).getDatabase();
      const now = Math.floor(Date.now() / 1000);
      db.prepare('INSERT INTO agent_records (id, agent, quality_score, quality_verdict, summary, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(await id(), 'farcake', 9, 'Strong research, 12 sources cited', 'Farcake Q1 research run', now - 600, now);
      db.prepare('INSERT INTO agent_records (id, agent, quality_score, quality_verdict, summary, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(await id(), 'farcake', 3, 'Incomplete -- timed out after 2 tools', 'Farcake failed run', now - 300, now - 60);
      const stats = db.prepare('SELECT AVG(quality_score) as avg_score, COUNT(*) as total FROM agent_records WHERE agent = ?').get('farcake') as any;
      expect(stats.total).toBe(2);
      expect(stats.avg_score).toBe(6);
      const highQuality = db.prepare('SELECT * FROM agent_records WHERE agent = ? AND quality_score >= 7').all('farcake') as any[];
      expect(highQuality.length).toBe(1);
      expect(highQuality[0].quality_verdict).toContain('Strong research');
    });

  });

  // Intelligence loop (stubs -- need live agents)
  describe('Intelligence loop', () => {
    it.todo('Eliyahu writes pattern analysis to Fisher2050 inbox after running');
    it.todo('Fisher2050 reads unread inbox at standup and marks read');
    it.todo('5-day loop: goal -> schedule -> spawn -> archive -> review -> brief -> repeat');
  });

});

