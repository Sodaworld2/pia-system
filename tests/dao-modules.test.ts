/**
 * DAO Module API - Integration Tests
 *
 * Tests the 9 AI module endpoints against a live PIA instance.
 * Requires the server to be running at http://localhost:3000.
 */
import { describe, it, expect } from 'vitest';

const API = 'http://localhost:3000/api';
const headers = {
  'x-api-token': 'dev-token-change-in-production',
  'Content-Type': 'application/json',
};

const ALL_MODULES = [
  'coach',
  'legal',
  'treasury',
  'governance',
  'community',
  'product',
  'security',
  'analytics',
  'onboarding',
] as const;

function uniqueDaoId(): string {
  return `test-dao-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('GET /api/modules', () => {
  it('returns all 9 modules', async () => {
    const res = await fetch(`${API}/modules`, { headers });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('modules');
    expect(Array.isArray(body.modules)).toBe(true);
    expect(body.modules).toHaveLength(9);

    for (const mod of body.modules) {
      expect(mod).toHaveProperty('id');
      expect(mod).toHaveProperty('name');
      expect(typeof mod.id).toBe('string');
      expect(typeof mod.name).toBe('string');
    }

    const ids = body.modules.map((m: { id: string }) => m.id);
    for (const expected of ALL_MODULES) {
      expect(ids).toContain(expected);
    }
  });
});

describe('GET /api/modules/status', () => {
  it('returns status for all modules', async () => {
    const res = await fetch(`${API}/modules/status`, { headers });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('status');
  });
});

describe('GET /api/modules/coach', () => {
  it('returns coach module info', async () => {
    const res = await fetch(`${API}/modules/coach`, { headers });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('id', 'coach');
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('status');
    expect(body.status).toHaveProperty('healthy', true);
    expect(body.status).toHaveProperty('version');
  });
});

describe('GET /api/modules/invalid', () => {
  it('returns 404 for unknown module', async () => {
    const res = await fetch(`${API}/modules/invalid`, { headers });
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/unknown module/i);
  });
});

describe('POST /api/modules/coach/chat', () => {
  it('sends a message and gets a response with module_id and content', async () => {
    const daoId = uniqueDaoId();

    const res = await fetch(`${API}/modules/coach/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: 'What OKRs should we set for Q2?',
        dao_id: daoId,
        user_id: 'test-user',
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('response');

    const response = body.response;
    expect(response).toHaveProperty('module_id', 'coach');
    expect(response).toHaveProperty('content');
    expect(typeof response.content).toBe('string');
    expect(response.content.length).toBeGreaterThan(0);
  });

  it('returns 400 when content is missing', async () => {
    const res = await fetch(`${API}/modules/coach/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dao_id: 'test-dao' }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when dao_id is missing', async () => {
    const res = await fetch(`${API}/modules/coach/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: 'hello' }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

describe('POST /api/modules/coach/learn', () => {
  it('stores knowledge and returns item with id', async () => {
    const daoId = uniqueDaoId();

    const res = await fetch(`${API}/modules/coach/learn`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dao_id: daoId,
        category: 'goal',
        title: 'Test Goal - Grow Community',
        content: 'We want to grow the community to 1000 members by Q3.',
        source: 'user_input',
        created_by: 'test-user',
        tags: ['test', 'growth'],
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('item');

    const item = body.item;
    expect(item).toHaveProperty('id');
    expect(typeof item.id).toBe('string');
    expect(item.id.length).toBeGreaterThan(0);
    expect(item).toHaveProperty('dao_id', daoId);
    expect(item).toHaveProperty('module_id', 'coach');
    expect(item).toHaveProperty('category', 'goal');
    expect(item).toHaveProperty('title', 'Test Goal - Grow Community');
    expect(item).toHaveProperty('content');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await fetch(`${API}/modules/coach/learn`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ dao_id: 'test-dao' }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

describe('GET /api/modules/coach/knowledge', () => {
  it('returns knowledge items for a given dao_id', async () => {
    const daoId = uniqueDaoId();

    const learnRes = await fetch(`${API}/modules/coach/learn`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dao_id: daoId,
        category: 'goal',
        title: 'Knowledge retrieval test item',
        content: 'This item exists to verify the knowledge endpoint.',
        source: 'user_input',
        created_by: 'test-user',
        tags: ['test'],
      }),
    });
    expect(learnRes.status).toBe(200);

    const res = await fetch(
      `${API}/modules/coach/knowledge?dao_id=${encodeURIComponent(daoId)}`,
      { headers },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    const match = body.items.find(
      (i: { title: string }) => i.title === 'Knowledge retrieval test item',
    );
    expect(match).toBeDefined();
    expect(match.dao_id).toBe(daoId);
    expect(match.module_id).toBe('coach');
  });

  it('returns empty array for a dao_id with no knowledge', async () => {
    const daoId = uniqueDaoId();

    const res = await fetch(
      `${API}/modules/coach/knowledge?dao_id=${encodeURIComponent(daoId)}`,
      { headers },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(0);
  });

  it('returns 400 when dao_id is missing', async () => {
    const res = await fetch(`${API}/modules/coach/knowledge`, { headers });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

describe('POST /api/modules/legal/chat', () => {
  it('responds with a disclaimer in the content', async () => {
    const daoId = uniqueDaoId();

    const res = await fetch(`${API}/modules/legal/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: 'Can you review our contributor agreement?',
        dao_id: daoId,
        user_id: 'test-user',
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('response');

    const response = body.response;
    expect(response).toHaveProperty('module_id', 'legal');
    expect(response).toHaveProperty('content');
    expect(typeof response.content).toBe('string');

    expect(response.content.toLowerCase()).toContain('disclaimer');
    expect(response.content.toLowerCase()).toContain('not legal advice');
  });
});

describe('All 9 modules respond to chat', () => {
  it.each(ALL_MODULES)('POST /api/modules/%s/chat returns a valid response', async (moduleId) => {
    const daoId = uniqueDaoId();

    const res = await fetch(`${API}/modules/${moduleId}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: `Hello ${moduleId} module, this is a test message.`,
        dao_id: daoId,
        user_id: 'test-user',
      }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('response');

    const response = body.response;
    expect(response).toHaveProperty('module_id', moduleId);
    expect(response).toHaveProperty('content');
    expect(typeof response.content).toBe('string');
    expect(response.content.length).toBeGreaterThan(0);
    expect(response).toHaveProperty('confidence');
    expect(typeof response.confidence).toBe('number');
  });
});