import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ---------------------------------------------------------------------------
// Mock: ../middleware/validation  (sanitizeBody + validate pass-through)
// ---------------------------------------------------------------------------
vi.mock('../middleware/validation', () => ({
  sanitizeBody: () => (_req: any, _res: any, next: any) => next(),
  validate: () => (_req: any, _res: any, next: any) => next(),
  validators: {
    voteType: {},
    votingPower: {},
    ethereumAddress: () => ({}),
  },
}));

// ---------------------------------------------------------------------------
// Mock: ../utils/sanitize  (pass-through)
// ---------------------------------------------------------------------------
vi.mock('../utils/sanitize', () => ({
  sanitize: (v: any) => v,
  sanitizeObject: (v: any) => v,
  default: (v: any) => v,
}));

// ---------------------------------------------------------------------------
// Mock: knex / database
// ---------------------------------------------------------------------------

// We build a lightweight chainable query-builder mock that resolves per-table.
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
    // .first() and .then() resolve with the handler value
    chain.first = vi.fn().mockResolvedValue(handler ? handler() : undefined);
    chain.then = (resolve: any) => Promise.resolve(handler ? handler() : undefined).then(resolve);
    return chain;
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const MOCK_PROPOSAL = {
  id: 'proposal-1',
  title: 'Test Proposal',
  description: 'A test governance proposal',
  status: 'Active',
  votesFor: 10,
  votesAgainst: 2,
  votesAbstain: 1,
  quorum: 50,
  endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
  proposer: JSON.stringify({ name: 'Alice', avatarUrl: null }),
};

let db: any;

// ---------------------------------------------------------------------------
// Build the express app with the proposals router
// ---------------------------------------------------------------------------
async function buildApp() {
  // Reset modules so fresh mocks take effect
  vi.resetModules();

  // Default: proposal exists, no prior vote, insert succeeds
  db = createDbMock({
    proposals: () => MOCK_PROPOSAL,
    proposal_votes: () => null,         // no existing vote
  });

  // Override insert on proposal_votes to resolve with an id
  // (the chainable mock already returns a chain — we just need .insert to resolve)
  const originalDb = db;
  db = (table: string) => {
    const chain = originalDb(table);
    if (table === 'proposal_votes') {
      chain.insert = vi.fn().mockResolvedValue([1]);
    }
    return chain;
  };

  // Provide the mock db to the router module
  vi.doMock('../db', () => ({ default: db, db }));

  const { default: router } = await import('./proposals');

  const app = express();
  app.use(express.json());
  app.use('/api/proposals', router);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/proposals/:id/vote', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('should cast a vote successfully (happy path)', async () => {
    const res = await request(app)
      .post('/api/proposals/proposal-1/vote')
      .send({
        voteType: 'for',
        votingPower: 1,
        voterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

    // The route should return 200 on success
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('should return 404 when proposal does not exist', async () => {
    // Override the db mock so proposals table returns null
    vi.resetModules();

    const emptyDb = createDbMock({
      proposals: () => null,
      proposal_votes: () => null,
    });
    vi.doMock('../db', () => ({ default: emptyDb, db: emptyDb }));

    const { default: router } = await import('./proposals');
    const app404 = express();
    app404.use(express.json());
    app404.use('/api/proposals', router);

    const res = await request(app404)
      .post('/api/proposals/nonexistent/vote')
      .send({
        voteType: 'for',
        votingPower: 1,
        voterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

    expect(res.status).toBe(404);
  });

  it('should return 400 when voter has already voted', async () => {
    vi.resetModules();

    const dupDb = createDbMock({
      proposals: () => MOCK_PROPOSAL,
      proposal_votes: () => ({ id: 'existing-vote', voterAddress: '0xabc' }), // existing vote
    });
    vi.doMock('../db', () => ({ default: dupDb, db: dupDb }));

    const { default: router } = await import('./proposals');
    const appDup = express();
    appDup.use(express.json());
    appDup.use('/api/proposals', router);

    const res = await request(appDup)
      .post('/api/proposals/proposal-1/vote')
      .send({
        voteType: 'for',
        votingPower: 1,
        voterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

    expect(res.status).toBe(400);
  });
});
