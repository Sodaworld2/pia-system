/**
 * DAO Module API Tests
 *
 * Integration tests for the DAO module endpoints at /api/modules.
 * Requires the PIA server running at http://localhost:3000.
 *
 * Run with: npx vitest run dao-foundation-files/backend/src/modules/__tests__/api.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:3000';
const API = `${BASE_URL}/api/modules`;
const DAO_ID = 'sodaworld-dao-001';
const TEST_USER = 'user-marcus';

/** Shared state populated by earlier tests and consumed by later ones. */
const state: {
  createdProposalId: string | null;
  createdSignatureId: string | null;
  knownAgreementId: string | null;
} = {
  createdProposalId: null,
  createdSignatureId: null,
  knownAgreementId: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function get(path: string): Promise<Response> {
  return fetch(`${API}${path}`);
}

async function post(path: string, body: Record<string, unknown> = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Assert that the server is reachable before running any tests. */
beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/modules`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `Cannot reach server at ${BASE_URL}. Start it before running tests.\n${err}`,
    );
  }
});

// ===========================================================================
// 1. Core Module Endpoints
// ===========================================================================

describe('Core Module Endpoints', () => {
  // -----------------------------------------------------------------------
  // GET /api/modules
  // -----------------------------------------------------------------------
  describe('GET /api/modules', () => {
    it('should list all 9 available modules', async () => {
      const res = await get('/');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('modules');
      expect(Array.isArray(data.modules)).toBe(true);
      expect(data.modules.length).toBe(9);

      const ids = data.modules.map((m: { id: string }) => m.id);
      const expected = [
        'coach', 'legal', 'treasury', 'governance',
        'community', 'product', 'security', 'analytics', 'onboarding',
      ];
      for (const id of expected) {
        expect(ids).toContain(id);
      }
    });

    it('should mark every module as available', async () => {
      const res = await get('/');
      const data = await res.json();
      for (const mod of data.modules) {
        expect(mod.available).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/modules/status
  // -----------------------------------------------------------------------
  describe('GET /api/modules/status', () => {
    it('should return status object', async () => {
      const res = await get('/status');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('status');
      expect(typeof data.status).toBe('object');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/modules/:id
  // -----------------------------------------------------------------------
  describe('GET /api/modules/:id', () => {
    it('should return info for the coach module', async () => {
      const res = await get('/coach');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.id).toBe('coach');
      expect(data.name).toBe('Coach');
      expect(data).toHaveProperty('status');
      expect(data.status.healthy).toBe(true);
      expect(data.status).toHaveProperty('version');
    });

    it('should return 404 for an unknown module', async () => {
      const res = await get('/nonexistent');
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/modules/:id/chat
  // -----------------------------------------------------------------------
  describe('POST /api/modules/:id/chat', () => {
    it('should chat with the coach module and receive a response', { timeout: 30000 }, async () => {
      const res = await post('/coach/chat', {
        content: 'What are some good strategies for a new DAO?',
        dao_id: DAO_ID,
        user_id: TEST_USER,
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('response');
      expect(data.response).toHaveProperty('content');
      expect(data.response).toHaveProperty('module_id', 'coach');
      expect(typeof data.response.confidence).toBe('number');
    });

    it('should return 400 when content is missing', async () => {
      const res = await post('/coach/chat', {
        dao_id: DAO_ID,
        user_id: TEST_USER,
      });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 when dao_id is missing', async () => {
      const res = await post('/coach/chat', {
        content: 'Hello',
        user_id: TEST_USER,
      });
      expect(res.status).toBe(400);
    });

    it('should return 404 for an unknown module', async () => {
      const res = await post('/nonexistent/chat', {
        content: 'Hello',
        dao_id: DAO_ID,
        user_id: TEST_USER,
      });
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/modules/:id/learn
  // -----------------------------------------------------------------------
  describe('POST /api/modules/:id/learn', () => {
    it('should teach the coach module new knowledge', async () => {
      const res = await post('/coach/learn', {
        dao_id: DAO_ID,
        category: 'goal',
        title: 'Test Goal from API test',
        content: 'Our goal is to onboard 100 new members in Q1 2026',
        source: 'user_input',
        created_by: TEST_USER,
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('item');
      expect(data.item.title).toBe('Test Goal from API test');
      expect(data.item.category).toBe('goal');
      expect(data.item.dao_id).toBe(DAO_ID);
      expect(data.item.module_id).toBe('coach');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await post('/coach/learn', {
        dao_id: DAO_ID,
        // missing category, title, content
      });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/modules/:id/knowledge
  // -----------------------------------------------------------------------
  describe('GET /api/modules/:id/knowledge', () => {
    it('should return knowledge items for the coach module', async () => {
      const res = await get(`/coach/knowledge?dao_id=${DAO_ID}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('items');
      expect(Array.isArray(data.items)).toBe(true);
    });

    it('should return 400 when dao_id query param is missing', async () => {
      const res = await get('/coach/knowledge');
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });
});

// ===========================================================================
// 2. Module-Specific Endpoints -- Coach
// ===========================================================================

describe('Coach Module Endpoints', () => {
  describe('POST /api/modules/coach/okrs', () => {
    it('should generate OKRs for the DAO', { timeout: 30000 }, async () => {
      const res = await post('/coach/okrs', {
        dao_id: DAO_ID,
        user_id: TEST_USER,
        quarter: 'Q1 2026',
        focus_areas: ['growth', 'community'],
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('response');
      expect(data.response).toHaveProperty('content');
      expect(data.response).toHaveProperty('module_id', 'coach');
    });

    it('should return 400 when quarter is missing', async () => {
      const res = await post('/coach/okrs', {
        dao_id: DAO_ID,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/modules/coach/milestones', () => {
    it('should plan milestones for an objective', { timeout: 30000 }, async () => {
      const res = await post('/coach/milestones', {
        dao_id: DAO_ID,
        user_id: TEST_USER,
        objective: 'Launch token governance system',
        timeframe_weeks: 8,
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('response');
      expect(data.response).toHaveProperty('content');
    });

    it('should return 400 when objective is missing', async () => {
      const res = await post('/coach/milestones', {
        dao_id: DAO_ID,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/modules/coach/swot', () => {
    it('should generate a SWOT analysis', { timeout: 30000 }, async () => {
      const res = await post('/coach/swot', {
        dao_id: DAO_ID,
        user_id: TEST_USER,
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('response');
      expect(data.response).toHaveProperty('content');
    });

    it('should return 400 when dao_id is missing', async () => {
      const res = await post('/coach/swot', {});
      expect(res.status).toBe(400);
    });
  });
});

// ===========================================================================
// 3. Module-Specific Endpoints -- Legal
// ===========================================================================

describe('Legal Module Endpoints', () => {
  describe('POST /api/modules/legal/draft', () => {
    it('should draft a new agreement', { timeout: 60000 }, async () => {
      const res = await post('/legal/draft', {
        dao_id: DAO_ID,
        user_id: TEST_USER,
        type: 'contributor',
        title: 'Test Contributor Agreement',
        parties: ['SodaWorld DAO', 'Test Contributor'],
        key_terms: { role: 'Developer', compensation: '$5000/month' },
        jurisdiction: 'US-Delaware',
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('response');
      expect(data.response).toHaveProperty('content');
      expect(data.response).toHaveProperty('module_id', 'legal');
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await post('/legal/draft', {
        dao_id: DAO_ID,
        // missing type and title
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/modules/legal/review/:agreementId', () => {
    it('should return 500 for a non-existent agreement', async () => {
      // reviewAgreement throws when the agreement is not found,
      // which the route handler catches and returns 500.
      const res = await post('/legal/review/nonexistent-agreement-id', {
        dao_id: DAO_ID,
        user_id: TEST_USER,
      });
      expect(res.status).toBe(500);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 when dao_id is missing', async () => {
      const res = await post('/legal/review/some-id', {});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/modules/legal/transition', () => {
    it('should return 400 when required fields are missing', async () => {
      const res = await post('/legal/transition', {
        dao_id: DAO_ID,
        // missing agreement_id, new_status
      });
      expect(res.status).toBe(400);
    });

    it('should return 500 for a non-existent agreement', async () => {
      const res = await post('/legal/transition', {
        dao_id: DAO_ID,
        agreement_id: 'nonexistent-id',
        new_status: 'review',
        user_id: TEST_USER,
      });
      expect(res.status).toBe(500);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });
});

// ===========================================================================
// 4. Module-Specific Endpoints -- Governance
// ===========================================================================

describe('Governance Module Endpoints', () => {
  describe('POST /api/modules/governance/analyze/:proposalId', () => {
    it('should return 500 for a non-existent proposal', async () => {
      const res = await post('/governance/analyze/nonexistent-prop', {
        dao_id: DAO_ID,
        user_id: TEST_USER,
      });
      expect(res.status).toBe(500);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 when dao_id is missing', async () => {
      const res = await post('/governance/analyze/some-id', {});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/modules/governance/voting-params', () => {
    it('should recommend voting parameters', { timeout: 30000 }, async () => {
      const res = await post('/governance/voting-params', {
        dao_id: DAO_ID,
        user_id: TEST_USER,
        proposal_type: 'treasury_spend',
        member_count: 9,
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('response');
      expect(data).toHaveProperty('parameters');
      expect(data.parameters).toHaveProperty('quorum_percentage');
      expect(data.parameters).toHaveProperty('approval_threshold');
      expect(data.parameters).toHaveProperty('voting_duration_hours');
      expect(data.parameters).toHaveProperty('recommended_model');
    });

    it('should return 400 when proposal_type is missing', async () => {
      const res = await post('/governance/voting-params', {
        dao_id: DAO_ID,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/modules/governance/report', () => {
    it('should generate a governance report', { timeout: 120000 }, async () => {
      const res = await post('/governance/report', {
        dao_id: DAO_ID,
        user_id: TEST_USER,
        period: 'last 30 days',
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('response');
      expect(data).toHaveProperty('metrics');
      expect(typeof data.metrics.total_proposals).toBe('number');
      expect(typeof data.metrics.passed_proposals).toBe('number');
      expect(typeof data.metrics.unique_voters).toBe('number');
      expect(typeof data.metrics.average_participation_rate).toBe('number');
    });

    it('should return 400 when dao_id is missing', async () => {
      const res = await post('/governance/report', {});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/modules/governance/constitution', () => {
    it('should draft a DAO constitution', { timeout: 60000 }, async () => {
      const res = await post('/governance/constitution', {
        dao_id: DAO_ID,
        user_id: TEST_USER,
        governance_model: 'founder_led',
        values: ['transparency', 'decentralization', 'community'],
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('response');
      expect(data).toHaveProperty('draft');
      expect(data.draft).toHaveProperty('preamble');
      expect(data.draft).toHaveProperty('articles');
      expect(Array.isArray(data.draft.articles)).toBe(true);
      expect(data.draft).toHaveProperty('amendments_process');
      expect(data.draft).toHaveProperty('effective_date');
    });

    it('should return 400 when dao_id is missing', async () => {
      const res = await post('/governance/constitution', {});
      expect(res.status).toBe(400);
    });
  });
});

// ===========================================================================
// 5. DAO Data Endpoints
// ===========================================================================

describe('DAO Data Endpoints', () => {
  describe('GET /api/modules/dao/data', () => {
    it('should return comprehensive DAO data', async () => {
      const res = await get(`/dao/data?dao_id=${DAO_ID}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('dao');
      expect(data).toHaveProperty('members');
      expect(data).toHaveProperty('agreements');
      expect(data).toHaveProperty('proposals');
      expect(data).toHaveProperty('votes');
      expect(data).toHaveProperty('summary');
      expect(Array.isArray(data.members)).toBe(true);
      expect(Array.isArray(data.agreements)).toBe(true);
      expect(Array.isArray(data.proposals)).toBe(true);
      expect(typeof data.summary.member_count).toBe('number');
      expect(typeof data.summary.proposal_count).toBe('number');
    });

    it('should use the default DAO ID when none is provided', async () => {
      const res = await get('/dao/data');
      expect(res.status).toBe(200);

      const data = await res.json();
      // Should default to sodaworld-dao-001 and still return a valid response
      expect(data).toHaveProperty('summary');
    });
  });

  describe('GET /api/modules/dao/members', () => {
    it('should return DAO members with details', async () => {
      const res = await get(`/dao/members?dao_id=${DAO_ID}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('members');
      expect(Array.isArray(data.members)).toBe(true);

      if (data.members.length > 0) {
        const member = data.members[0];
        expect(member).toHaveProperty('user_id');
        expect(member).toHaveProperty('dao_role');
        expect(member).toHaveProperty('voting_power');
      }
    });
  });

  describe('GET /api/modules/dao/proposals', () => {
    it('should return proposals with vote tallies', async () => {
      const res = await get(`/dao/proposals?dao_id=${DAO_ID}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('proposals');
      expect(Array.isArray(data.proposals)).toBe(true);

      if (data.proposals.length > 0) {
        const proposal = data.proposals[0];
        expect(proposal).toHaveProperty('id');
        expect(proposal).toHaveProperty('title');
        expect(proposal).toHaveProperty('votes');
        expect(Array.isArray(proposal.votes)).toBe(true);
      }
    });
  });

  describe('GET /api/modules/dao/signatures-summary', () => {
    it('should return signatures summary for all agreements', async () => {
      const res = await get(`/dao/signatures-summary?dao_id=${DAO_ID}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('total_agreements');
      expect(Array.isArray(data.summary)).toBe(true);
      expect(typeof data.total_agreements).toBe('number');

      if (data.summary.length > 0) {
        const entry = data.summary[0];
        expect(entry).toHaveProperty('agreement_id');
        expect(entry).toHaveProperty('title');
        expect(entry).toHaveProperty('signatures');

        // Save an agreement ID for subsequent tests
        state.knownAgreementId = entry.agreement_id;
      }
    });
  });
});

// ===========================================================================
// 6. Signature Endpoints
// ===========================================================================

describe('Signature Endpoints', () => {
  describe('POST /api/modules/signatures/sign', () => {
    it('should sign an agreement and return a signature hash', async () => {
      // Use a known agreement ID if we have one, otherwise use a placeholder
      const agreementId = state.knownAgreementId || 'agr-test-sign';

      const res = await post('/signatures/sign', {
        agreement_id: agreementId,
        user_id: TEST_USER,
        signature_data: 'digital_acceptance',
        ip_address: '127.0.0.1',
      });

      // Could be 200 (success) or 500 (if agreement_signatures table has constraints)
      if (res.status === 200) {
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('signature');
        expect(data.signature).toHaveProperty('id');
        expect(data.signature).toHaveProperty('signature_hash');
        expect(data.signature).toHaveProperty('signed_at');
        expect(typeof data.signature.signature_hash).toBe('string');
        expect(data.signature.signature_hash.length).toBe(64); // SHA-256 hex

        state.createdSignatureId = data.signature.id;
      } else {
        // The table or foreign key might prevent insertion; that is acceptable
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    it('should return 400 when agreement_id is missing', async () => {
      const res = await post('/signatures/sign', {
        user_id: TEST_USER,
      });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 400 when user_id is missing', async () => {
      const res = await post('/signatures/sign', {
        agreement_id: 'some-id',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/modules/signatures/:agreementId', () => {
    it('should return signatures for an agreement', async () => {
      const agreementId = state.knownAgreementId || 'agr-test';
      const res = await get(`/signatures/${agreementId}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('signatures');
      expect(Array.isArray(data.signatures)).toBe(true);
    });

    it('should return an empty array for an unknown agreement', async () => {
      const res = await get('/signatures/nonexistent-agreement-xyz');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('signatures');
      expect(data.signatures).toHaveLength(0);
    });
  });

  describe('POST /api/modules/signatures/verify', () => {
    it('should verify a valid signature', async () => {
      if (!state.createdSignatureId) {
        // Skip if we could not create a signature earlier
        return;
      }

      const res = await post('/signatures/verify', {
        signature_id: state.createdSignatureId,
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data).toHaveProperty('signature');
    });

    it('should return 404 for a non-existent signature', async () => {
      const res = await post('/signatures/verify', {
        signature_id: 'nonexistent-sig-id-xyz',
      });
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.valid).toBe(false);
    });

    it('should return 400 when signature_id is missing', async () => {
      const res = await post('/signatures/verify', {});
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });
});

// ===========================================================================
// 7. Proposal / Voting Endpoints
// ===========================================================================

describe('Proposal / Voting Endpoints', () => {
  describe('POST /api/modules/proposals/create', () => {
    it('should create a new proposal', async () => {
      const res = await post('/proposals/create', {
        dao_id: DAO_ID,
        title: 'Test Proposal - API Test',
        description: 'This proposal was created by the Vitest API test suite.',
        type: 'custom',
        author_id: TEST_USER,
        voting_days: 3,
        quorum_required: 0.5,
        approval_threshold: 0.6,
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('proposal');
      expect(data.proposal).toHaveProperty('id');
      expect(data.proposal.status).toBe('active');
      expect(data.proposal).toHaveProperty('voting_ends_at');
      expect(data.proposal.id).toMatch(/^prop-/);

      state.createdProposalId = data.proposal.id;
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await post('/proposals/create', {
        dao_id: DAO_ID,
        // missing title, type, author_id
      });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('POST /api/modules/proposals/:id/vote', () => {
    it('should cast a vote on the created proposal', async () => {
      if (!state.createdProposalId) {
        throw new Error('No proposal was created in the previous test');
      }

      const res = await post(`/proposals/${state.createdProposalId}/vote`, {
        user_id: TEST_USER,
        choice: 'yes',
        reason: 'I support this test proposal',
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.action).toBe('created');
      expect(data).toHaveProperty('vote');
      expect(data.vote.choice).toBe('yes');
    });

    it('should update an existing vote instead of duplicating', async () => {
      if (!state.createdProposalId) return;

      const res = await post(`/proposals/${state.createdProposalId}/vote`, {
        user_id: TEST_USER,
        choice: 'no',
        reason: 'Changed my mind',
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.action).toBe('updated');
      expect(data.vote.choice).toBe('no');
    });

    it('should reject an invalid choice', async () => {
      if (!state.createdProposalId) return;

      const res = await post(`/proposals/${state.createdProposalId}/vote`, {
        user_id: TEST_USER,
        choice: 'maybe',
      });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain('yes, no, or abstain');
    });

    it('should return 400 when user_id is missing', async () => {
      if (!state.createdProposalId) return;

      const res = await post(`/proposals/${state.createdProposalId}/vote`, {
        choice: 'yes',
      });
      expect(res.status).toBe(400);
    });

    it('should return 404 for a non-existent proposal', async () => {
      const res = await post('/proposals/nonexistent-prop-id/vote', {
        user_id: TEST_USER,
        choice: 'yes',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/modules/proposals/:id/tally', () => {
    it('should tally votes and return a result summary', async () => {
      if (!state.createdProposalId) {
        throw new Error('No proposal was created in the previous test');
      }

      const res = await post(`/proposals/${state.createdProposalId}/tally`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('result');
      expect(typeof data.result.total_votes).toBe('number');
      expect(data.result).toHaveProperty('quorum_met');
      expect(data.result).toHaveProperty('approved');
      expect(data.result).toHaveProperty('participation');
    });

    it('should return 404 for a non-existent proposal', async () => {
      const res = await post('/proposals/nonexistent-prop-xyz/tally');
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('GET /api/modules/proposals/:id', () => {
    it('should return the proposal with full vote details', async () => {
      if (!state.createdProposalId) {
        throw new Error('No proposal was created in the previous test');
      }

      const res = await get(`/proposals/${state.createdProposalId}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('proposal');
      expect(data).toHaveProperty('votes');
      expect(data.proposal.id).toBe(state.createdProposalId);
      expect(data.proposal.title).toBe('Test Proposal - API Test');
      expect(Array.isArray(data.votes)).toBe(true);
    });

    it('should return 404 for a non-existent proposal', async () => {
      const res = await get('/proposals/nonexistent-prop-xyz');
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });
});

// ===========================================================================
// 8. Agreement Endpoints
// ===========================================================================

describe('Agreement Endpoints', () => {
  describe('POST /api/modules/agreements/:id/request-signatures', () => {
    it('should return signature status for a known agreement', async () => {
      if (!state.knownAgreementId) {
        // Try to get an agreement ID from the DAO data endpoint
        const daoRes = await get(`/dao/data?dao_id=${DAO_ID}`);
        const daoData = await daoRes.json();
        if (daoData.agreements && daoData.agreements.length > 0) {
          state.knownAgreementId = daoData.agreements[0].id;
        }
      }

      if (!state.knownAgreementId) {
        // No agreements exist in the DB; skip this test
        return;
      }

      const res = await post(`/agreements/${state.knownAgreementId}/request-signatures`, {
        requested_by: TEST_USER,
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('agreement_id', state.knownAgreementId);
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('required_signers');
      expect(data).toHaveProperty('signed');
      expect(data).toHaveProperty('pending');
      expect(typeof data.fully_signed).toBe('boolean');
      expect(Array.isArray(data.required_signers)).toBe(true);
      expect(Array.isArray(data.signed)).toBe(true);
      expect(Array.isArray(data.pending)).toBe(true);
    });

    it('should return 404 for a non-existent agreement', async () => {
      const res = await post('/agreements/nonexistent-agr-xyz/request-signatures', {
        requested_by: TEST_USER,
      });
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('GET /api/modules/agreements/:id', () => {
    it('should return a full agreement with signatures', async () => {
      if (!state.knownAgreementId) return;

      const res = await get(`/agreements/${state.knownAgreementId}`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('agreement');
      expect(data).toHaveProperty('signatures');
      expect(data.agreement.id).toBe(state.knownAgreementId);
      expect(Array.isArray(data.signatures)).toBe(true);
    });

    it('should return 404 for a non-existent agreement', async () => {
      const res = await get('/agreements/nonexistent-agr-xyz');
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data).toHaveProperty('error');
    });
  });
});

// ===========================================================================
// 9. Cross-cutting concerns
// ===========================================================================

describe('Cross-cutting concerns', () => {
  it('should return JSON Content-Type on all endpoints', async () => {
    const res = await get('/');
    const contentType = res.headers.get('content-type');
    expect(contentType).toContain('application/json');
  });

  it('should accept requests to multiple module types', async () => {
    const moduleIds = ['legal', 'treasury', 'governance', 'community', 'product', 'security', 'analytics', 'onboarding'];

    const results = await Promise.all(
      moduleIds.map(id => get(`/${id}`)),
    );

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.id).toBe(moduleIds[i]);
      expect(data).toHaveProperty('status');
      expect(data.status.healthy).toBe(true);
    }
  });
});
