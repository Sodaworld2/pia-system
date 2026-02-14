import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mock: axios  (token reward API call)
// ---------------------------------------------------------------------------
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    get: vi.fn().mockResolvedValue({ data: {} }),
    create: vi.fn().mockReturnThis(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock: uuid
// ---------------------------------------------------------------------------
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

// ---------------------------------------------------------------------------
// Mock: knex / database
// ---------------------------------------------------------------------------

const NOW = Date.now();
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const MOCK_GROUP = {
  id: 'group-1',
  groupName: 'Founders',
  percentage: 20,
  totalTokens: 1000000,
  vestingPeriod: '24 months',
  claimed: 0,
};

const MOCK_VESTING_SCHEDULE = {
  id: 'sched-1',
  user_id: 'user-1',
  group_id: 'group-1',
  total_tokens: 100000,
  claimed_amount: 0,
  start_date: new Date(NOW - ONE_YEAR_MS).toISOString(),   // started 1 year ago
  end_date: new Date(NOW + ONE_YEAR_MS).toISOString(),     // ends 1 year from now
  cliff_date: null,                                         // no cliff
  cliff_percentage: 0,
  vesting_months: 24,
};

function createDbMock(tableHandlers: Record<string, () => any>) {
  return (tableName: string) => {
    const handler = tableHandlers[tableName];
    const chain: any = {};
    const methods = [
      'where', 'andWhere', 'first', 'select', 'insert', 'update',
      'orderBy', 'limit', 'offset', 'count', 'join', 'leftJoin',
      'whereIn', 'whereNull', 'whereNotNull', 'groupBy', 'raw',
      'returning', 'del', 'delete', 'increment', 'decrement',
      'on', 'orOn', 'whereRaw',
    ];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.first = vi.fn().mockResolvedValue(handler ? handler() : undefined);
    chain.then = (resolve: any) => Promise.resolve(handler ? handler() : undefined).then(resolve);
    return chain;
  };
}

let db: any;

async function buildApp() {
  vi.resetModules();

  db = createDbMock({
    token_distribution_groups: () => MOCK_GROUP,
    vesting_schedules: () => MOCK_VESTING_SCHEDULE,
    vesting_unlocks: () => null,
  });

  // Override insert on vesting_unlocks to resolve
  const originalDb = db;
  db = (table: string) => {
    const chain = originalDb(table);
    if (table === 'vesting_unlocks') {
      chain.insert = vi.fn().mockResolvedValue([1]);
    }
    if (table === 'vesting_schedules') {
      chain.update = vi.fn().mockResolvedValue(1);
    }
    return chain;
  };

  vi.doMock('../db', () => ({ default: db, db }));

  const { default: router } = await import('./token_distribution');

  const app = express();
  app.use(express.json());
  app.use('/api/token-distribution', router);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/token-distribution/:groupId/claim', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('should claim vested tokens successfully (happy path)', async () => {
    const res = await request(app)
      .post('/api/token-distribution/group-1/claim')
      .send({
        userId: 'user-1',
        amount: 1000,
      });

    // The route should return 200 on success
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    if (res.body.success !== undefined) {
      expect(res.body.success).toBe(true);
    }
  });

  it('should return 400 when userId is missing', async () => {
    const res = await request(app)
      .post('/api/token-distribution/group-1/claim')
      .send({
        amount: 1000,
      });

    expect(res.status).toBe(400);
  });

  it('should return 400 when amount is missing', async () => {
    const res = await request(app)
      .post('/api/token-distribution/group-1/claim')
      .send({
        userId: 'user-1',
      });

    expect(res.status).toBe(400);
  });

  it('should return 404 when group does not exist', async () => {
    vi.resetModules();

    const emptyDb = createDbMock({
      token_distribution_groups: () => null,
      vesting_schedules: () => null,
      vesting_unlocks: () => null,
    });
    vi.doMock('../db', () => ({ default: emptyDb, db: emptyDb }));

    const { default: router } = await import('./token_distribution');
    const app404 = express();
    app404.use(express.json());
    app404.use('/api/token-distribution', router);

    const res = await request(app404)
      .post('/api/token-distribution/nonexistent/claim')
      .send({
        userId: 'user-1',
        amount: 1000,
      });

    expect(res.status).toBe(404);
  });
});
