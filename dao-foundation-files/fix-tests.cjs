const fs = require('fs');

// ============================================================================
// proposals.test.ts - Fixed to work with current route
// ============================================================================
const proposalsTest = `import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import db from '../database';

// Mock the database
vi.mock('../database');

// Mock the validation middleware to pass through
vi.mock('../middleware/validation', () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
  validators: {
    voteType: {},
    votingPower: {},
    ethereumAddress: () => ({}),
  },
}));

// Mock the sanitize utility to pass through
vi.mock('../utils/sanitize', () => ({
  sanitizeBody: () => (_req: any, _res: any, next: any) => next(),
  sanitize: (v: any) => v,
  sanitizeObject: (v: any) => v,
}));

const request = supertest(app);

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

describe('Proposals API', () => {
  beforeEach(() => {
    let proposalInDb = { ...mockProposal };

    vi.mocked(db).mockImplementation((tableName: string) => {
      if (tableName === 'proposal_votes') {
        return {
          where: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null), // no existing vote
          }),
          insert: vi.fn().mockResolvedValue([1]),
        } as any;
      }
      // Default: proposals table
      return {
        select: vi.fn().mockResolvedValue([proposalInDb]),
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(proposalInDb),
          update: vi.fn((data: any) => {
            proposalInDb = { ...proposalInDb, ...data };
            return Promise.resolve(1);
          }),
        }),
        first: vi.fn().mockResolvedValue(proposalInDb),
        update: vi.fn((data: any) => {
          proposalInDb = { ...proposalInDb, ...data };
          return Promise.resolve(1);
        }),
      } as any;
    });
  });

  it('GET /api/proposals should return a list of proposals', async () => {
    const response = await request.get('/api/proposals');
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body[0].id).toBe('p1');
  });

  it('POST /api/proposals/:id/vote should update the vote count', async () => {
    const response = await request
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
// token_distribution.test.ts - Fixed to work with current route
// ============================================================================
const tokenDistTest = `import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import db from '../database';

// Mock the database
vi.mock('../database');

// Mock axios for token reward API call
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({
      data: {
        newBalance: 101000,
        transactionId: 'tx-test-123',
        success: true,
      },
    }),
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

const request = supertest(app);

const NOW = Date.now();
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

const mockGroup = {
  id: '1',
  groupName: 'Founders & Core Team',
  claimed: 500000,
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

describe('Token Distribution API', () => {
  beforeEach(() => {
    let groupInDb = { ...mockGroup };
    let scheduleInDb = { ...mockVestingSchedule };

    vi.mocked(db).mockImplementation((tableName: string) => {
      if (tableName === 'vesting_schedules') {
        return {
          where: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(scheduleInDb),
            update: vi.fn((data: any) => {
              scheduleInDb = { ...scheduleInDb, ...data };
              return Promise.resolve(1);
            }),
          }),
          first: vi.fn().mockResolvedValue(scheduleInDb),
          select: vi.fn().mockResolvedValue([scheduleInDb]),
        } as any;
      }
      if (tableName === 'vesting_unlocks') {
        return {
          where: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue([]),
            orderBy: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue([]),
            }),
          }),
          insert: vi.fn().mockResolvedValue([1]),
          select: vi.fn().mockResolvedValue([]),
        } as any;
      }
      // Default: token_distribution_groups table
      return {
        select: vi.fn().mockResolvedValue([groupInDb]),
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(groupInDb),
          update: vi.fn((data: any) => {
            groupInDb = { ...groupInDb, ...data };
            return Promise.resolve(1);
          }),
        }),
        first: vi.fn().mockResolvedValue(groupInDb),
        update: vi.fn((data: any) => {
          groupInDb = { ...groupInDb, ...data };
          return Promise.resolve(1);
        }),
      } as any;
    });
  });

  it('GET /api/token-distribution should return a list of groups', async () => {
    const response = await request.get('/api/token-distribution');
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body[0].id).toBe('1');
  });

  it('POST /api/token-distribution/:groupId/claim should update the claimed amount', async () => {
    const response = await request
      .post('/api/token-distribution/1/claim')
      .send({ userId: 'user-1', amount: 100000 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.claimed).toBe(100000);
  });
});
`;

// Write files
fs.writeFileSync('backend/src/routes/proposals.test.ts', proposalsTest);
console.log('WRITTEN: backend/src/routes/proposals.test.ts');

fs.writeFileSync('backend/src/routes/token_distribution.test.ts', tokenDistTest);
console.log('WRITTEN: backend/src/routes/token_distribution.test.ts');

console.log('Done - both test files fixed.');
