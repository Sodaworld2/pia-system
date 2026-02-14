const fs = require('fs');

// ============================================================================
// proposals.test.ts - Fixed: import router directly, NOT app from ../index
// ============================================================================
const proposalsTest = `import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';

// Mock database (hoisted before imports)
vi.mock('../database', () => ({
  default: vi.fn(),
  __esModule: true,
}));

// Mock validation middleware to pass through
vi.mock('../middleware/validation', () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
  validators: {
    voteType: {},
    votingPower: {},
    ethereumAddress: () => ({}),
  },
}));

// Mock sanitize utility to pass through
vi.mock('../utils/sanitize', () => ({
  sanitizeBody: () => (_req: any, _res: any, next: any) => next(),
  sanitize: (v: any) => v,
  sanitizeObject: (v: any) => v,
}));

import db from '../database';
import router from './proposals';

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const mockProposal = {
  id: 'p1',
  title: 'Test Proposal',
  status: 'Active',
  proposer: JSON.stringify({ name: 'Test Proposer' }),
  votesFor: 100,
  votesAgainst: 0,
  votesAbstain: 0,
  quorum: 50,
  endDate: futureDate,
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/proposals', router);
  return app;
}

describe('Proposals API', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.clearAllMocks();
    let proposalInDb = { ...mockProposal };
    app = buildApp();

    vi.mocked(db).mockImplementation((tableName: string) => {
      if (tableName === 'proposal_votes') {
        return {
          where: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
          insert: vi.fn().mockResolvedValue([1]),
        } as any;
      }
      // proposals table
      return {
        select: vi.fn().mockResolvedValue([proposalInDb]),
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(() => Promise.resolve({ ...proposalInDb })),
          update: vi.fn().mockImplementation((data: any) => {
            proposalInDb = { ...proposalInDb, ...data };
            return Promise.resolve(1);
          }),
        }),
      } as any;
    });
  });

  it('GET /api/proposals should return a list of proposals', async () => {
    const response = await supertest(app).get('/api/proposals');
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body[0].id).toBe('p1');
  });

  it('POST /api/proposals/:id/vote should update the vote count', async () => {
    const response = await supertest(app)
      .post('/api/proposals/p1/vote')
      .send({
        voteType: 'for',
        votingPower: 50,
        voterAddress: '0x1234567890abcdef1234567890abcdef12345678',
      });

    expect(response.status).toBe(200);
    expect(response.body.votesFor).toBe(150);
  });
});
`;

// ============================================================================
// token_distribution.test.ts - Fixed: import router directly
// ============================================================================
const tokenDistTest = `import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';

// Mock database (hoisted before imports)
vi.mock('../database', () => ({
  default: vi.fn(),
  __esModule: true,
}));

// Mock axios for token reward API call
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({
      data: {
        newBalance: 101000,
        transactionId: 'tx-test-123',
      },
    }),
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

import db from '../database';
import router from './token_distribution';

const NOW = Date.now();
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

const mockGroup = {
  id: '1',
  groupName: 'Founders',
  claimed: 0,
  totalTokens: 20000000,
};

const mockVestingSchedule = {
  id: 'vest-1',
  user_id: 'user-1',
  group_id: '1',
  total_tokens: 200000,
  claimed_tokens: 0,
  start_date: new Date(NOW - ONE_YEAR).toISOString(),
  end_date: new Date(NOW + ONE_YEAR).toISOString(),
  cliff_date: null,
  cliff_percentage: 0,
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/token-distribution', router);
  return app;
}

describe('Token Distribution API', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();

    vi.mocked(db).mockImplementation((tableName: string) => {
      if (tableName === 'vesting_schedules') {
        return {
          where: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ ...mockVestingSchedule }),
            update: vi.fn().mockResolvedValue(1),
          }),
        } as any;
      }
      // token_distribution_groups table
      return {
        select: vi.fn().mockResolvedValue([{ ...mockGroup }]),
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ ...mockGroup }),
          update: vi.fn().mockResolvedValue(1),
        }),
      } as any;
    });
  });

  it('GET /api/token-distribution should return a list of groups', async () => {
    const response = await supertest(app).get('/api/token-distribution');
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body[0].id).toBe('1');
  });

  it('POST /api/token-distribution/:groupId/claim should claim tokens', async () => {
    const response = await supertest(app)
      .post('/api/token-distribution/1/claim')
      .send({ userId: 'user-1', amount: 1000 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.claimed).toBe(1000);
  });

  it('POST /api/token-distribution/:groupId/claim should reject missing userId', async () => {
    const response = await supertest(app)
      .post('/api/token-distribution/1/claim')
      .send({ amount: 1000 });

    expect(response.status).toBe(400);
  });
});
`;

// Write files
fs.writeFileSync('backend/src/routes/proposals.test.ts', proposalsTest);
console.log('WRITTEN: backend/src/routes/proposals.test.ts');

fs.writeFileSync('backend/src/routes/token_distribution.test.ts', tokenDistTest);
console.log('WRITTEN: backend/src/routes/token_distribution.test.ts');

console.log('Done - both test files fixed (v2 - router-direct import).');
