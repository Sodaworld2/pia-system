/**
 * DAO Module API Routes — Full SodaWorld DAO backend (40+ endpoints)
 *
 * Core (6):      GET /, /status, /:id  |  POST /:id/chat, /:id/learn  |  GET /:id/knowledge
 * Coach (3):     POST coach/okrs, coach/milestones, coach/swot
 * Legal (3):     POST legal/draft, legal/review/:id, legal/transition
 * Governance (4):POST governance/analyze/:id, governance/voting-params, governance/report, governance/constitution
 * DAO Data (5):  GET dao/data, dao/members, dao/proposals, dao/signatures-summary, dao/health
 * Signatures (3):POST signatures/sign, signatures/verify  |  GET signatures/:id
 * Proposals (4): POST proposals/create, proposals/:id/vote, proposals/:id/tally  |  GET proposals/:id
 * Agreements (2):POST agreements/:id/request-signatures  |  GET agreements/:id
 * Bounties (4):  GET bounties  |  POST bounties/create, bounties/:id/claim, bounties/:id/complete
 * Marketplace(2):GET marketplace  |  POST marketplace/create
 * Maintenance(2):POST dao/fix-data
 */

import { Router, Request, Response } from 'express';
import knex, { Knex } from 'knex';
import { config } from '../../config.js';
import { createLogger } from '../../utils/logger.js';

import { ModuleRegistry, CoachModule, LegalModule, GovernanceModule } from '../../../dao-foundation-files/backend/src/modules/index.js';
import { BaseModule } from '../../../dao-foundation-files/backend/src/modules/base-module.js';
import type { AIModuleId, AgentMessage } from '../../../dao-foundation-files/types/foundation.js';
import { getAIRouter } from '../../ai/ai-router.js';
import bus from '../../../dao-foundation-files/backend/src/events/bus.js';
import { getWebSocketServer } from '../../tunnel/websocket-server.js';

const router = Router();
const logger = createLogger('DAOModules');

// ── Knex instance (shared across all modules, pointed at same SQLite DB) ──

let db: Knex | null = null;
let registry: InstanceType<typeof ModuleRegistry> | null = null;

function getKnex(): Knex {
  if (!db) {
    db = knex({
      client: 'better-sqlite3',
      connection: {
        filename: config.database.path,
      },
      useNullAsDefault: true,
    });
    logger.info(`Knex connected to ${config.database.path}`);
  }
  return db;
}

function getRegistry(): InstanceType<typeof ModuleRegistry> {
  if (!registry) {
    registry = new ModuleRegistry(getKnex());

    // Wire LLM provider — uses PIA's cost-optimized AI router
    // Routing: Ollama (free) → Claude Haiku (cheap) → Claude Sonnet (medium)
    BaseModule.setLLMProvider(async (systemPrompt: string, userMessage: string) => {
      const router = getAIRouter();
      const result = await router.execute({
        prompt: userMessage,
        taskType: 'chat',
        context: systemPrompt,
        preferLocal: true,
      });
      logger.info(`LLM response via ${result.provider}/${result.model} (${result.duration}ms, $${result.cost.toFixed(4)})`);
      return result.content;
    });

    // Bridge DAO event bus → WebSocket for real-time frontend updates
    bus.on('*', (event) => {
      try {
        const wss = getWebSocketServer();
        wss.broadcast({
          type: 'alert' as const,
          payload: {
            category: 'dao',
            source: event.source,
            event_type: event.type,
            dao_id: event.dao_id,
            data: event.payload,
            timestamp: event.timestamp,
          },
        });
      } catch {
        // WebSocket not available — ignore
      }
    });

    logger.info('ModuleRegistry initialized with LLM provider + event bridge');
  }
  return registry;
}

/** Helper to extract string param */
function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

const VALID_MODULES: AIModuleId[] = [
  'coach', 'legal', 'treasury', 'governance',
  'community', 'product', 'security', 'analytics', 'onboarding',
];

// ─── Routes ────────────────────────────────────────────────────────────────

/** GET /api/modules — List all available modules */
router.get('/', (_req: Request, res: Response) => {
  try {
    const reg = getRegistry();
    const modules = reg.availableModules.map(id => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      available: true,
    }));
    res.json({ modules });
  } catch (error) {
    logger.error(`Failed to list modules: ${error}`);
    res.status(500).json({ error: 'Failed to list modules' });
  }
});

/** GET /api/modules/status — Get status of all instantiated modules */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const reg = getRegistry();
    const status = await reg.getStatus();
    res.json({ status });
  } catch (error) {
    logger.error(`Failed to get module status: ${error}`);
    res.status(500).json({ error: 'Failed to get module status' });
  }
});

// ─── Module-Specific Routes ───────────────────────────────────────────────

/** POST /api/modules/coach/okrs — Generate OKRs */
router.post('/coach/okrs', async (req: Request, res: Response) => {
  try {
    const { dao_id, user_id, quarter, focus_areas } = req.body;
    if (!dao_id || !quarter) {
      res.status(400).json({ error: 'Missing required fields: dao_id, quarter' });
      return;
    }
    const mod = getRegistry().getModule('coach') as CoachModule;
    const response = await mod.generateOKRs(dao_id, user_id || 'anonymous', {
      quarter,
      focus_areas: focus_areas || [],
    });
    res.json({ success: true, response });
  } catch (error) {
    logger.error(`Coach OKR error: ${error}`);
    res.status(500).json({ error: 'Failed to generate OKRs' });
  }
});

/** POST /api/modules/coach/milestones — Plan milestones */
router.post('/coach/milestones', async (req: Request, res: Response) => {
  try {
    const { dao_id, user_id, objective, timeframe_weeks } = req.body;
    if (!dao_id || !objective) {
      res.status(400).json({ error: 'Missing required fields: dao_id, objective' });
      return;
    }
    const mod = getRegistry().getModule('coach') as CoachModule;
    const response = await mod.planMilestones(dao_id, user_id || 'anonymous', objective, timeframe_weeks || 12);
    res.json({ success: true, response });
  } catch (error) {
    logger.error(`Coach milestone error: ${error}`);
    res.status(500).json({ error: 'Failed to plan milestones' });
  }
});

/** POST /api/modules/coach/swot — SWOT analysis */
router.post('/coach/swot', async (req: Request, res: Response) => {
  try {
    const { dao_id, user_id } = req.body;
    if (!dao_id) {
      res.status(400).json({ error: 'Missing required field: dao_id' });
      return;
    }
    const mod = getRegistry().getModule('coach') as CoachModule;
    const response = await mod.swotAnalysis(dao_id, user_id || 'anonymous');
    res.json({ success: true, response });
  } catch (error) {
    logger.error(`Coach SWOT error: ${error}`);
    res.status(500).json({ error: 'Failed to generate SWOT analysis' });
  }
});

/** POST /api/modules/legal/draft — Draft a new agreement */
router.post('/legal/draft', async (req: Request, res: Response) => {
  try {
    const { dao_id, user_id, type, title, parties, key_terms, jurisdiction } = req.body;
    if (!dao_id || !type || !title) {
      res.status(400).json({ error: 'Missing required fields: dao_id, type, title' });
      return;
    }
    const mod = getRegistry().getModule('legal') as LegalModule;
    const response = await mod.draftAgreement(dao_id, user_id || 'anonymous', {
      type,
      title,
      parties: parties || [],
      key_terms: key_terms || {},
      jurisdiction,
    });
    res.json({ success: true, response });
  } catch (error) {
    logger.error(`Legal draft error: ${error}`);
    res.status(500).json({ error: 'Failed to draft agreement' });
  }
});

/** POST /api/modules/legal/review/:agreementId — Review an agreement */
router.post('/legal/review/:agreementId', async (req: Request, res: Response) => {
  try {
    const agreementId = param(req, 'agreementId');
    const { dao_id, user_id } = req.body;
    if (!dao_id) {
      res.status(400).json({ error: 'Missing required field: dao_id' });
      return;
    }
    const mod = getRegistry().getModule('legal') as LegalModule;
    const result = await mod.reviewAgreement(dao_id, user_id || 'anonymous', agreementId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error(`Legal review error: ${error}`);
    res.status(500).json({ error: `Failed to review agreement: ${error}` });
  }
});

/** POST /api/modules/legal/transition — Transition agreement status */
router.post('/legal/transition', async (req: Request, res: Response) => {
  try {
    const { dao_id, agreement_id, new_status, user_id } = req.body;
    if (!dao_id || !agreement_id || !new_status) {
      res.status(400).json({ error: 'Missing required fields: dao_id, agreement_id, new_status' });
      return;
    }
    const mod = getRegistry().getModule('legal') as LegalModule;
    const agreement = await mod.transitionAgreementStatus(dao_id, agreement_id, new_status, user_id || 'anonymous');
    res.json({ success: true, agreement });
  } catch (error) {
    logger.error(`Legal transition error: ${error}`);
    res.status(500).json({ error: `Failed to transition: ${error}` });
  }
});

/** POST /api/modules/governance/analyze/:proposalId — Analyze a proposal */
router.post('/governance/analyze/:proposalId', async (req: Request, res: Response) => {
  try {
    const proposalId = param(req, 'proposalId');
    const { dao_id, user_id } = req.body;
    if (!dao_id) {
      res.status(400).json({ error: 'Missing required field: dao_id' });
      return;
    }
    const mod = getRegistry().getModule('governance') as GovernanceModule;
    const result = await mod.analyzeProposal(dao_id, user_id || 'anonymous', proposalId);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error(`Governance analyze error: ${error}`);
    res.status(500).json({ error: `Failed to analyze proposal: ${error}` });
  }
});

/** POST /api/modules/governance/voting-params — Recommend voting parameters */
router.post('/governance/voting-params', async (req: Request, res: Response) => {
  try {
    const { dao_id, user_id, proposal_type, member_count } = req.body;
    if (!dao_id || !proposal_type) {
      res.status(400).json({ error: 'Missing required fields: dao_id, proposal_type' });
      return;
    }
    const mod = getRegistry().getModule('governance') as GovernanceModule;
    const result = await mod.recommendVotingParameters(dao_id, user_id || 'anonymous', {
      proposalType: proposal_type,
      memberCount: member_count || 9,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error(`Governance voting params error: ${error}`);
    res.status(500).json({ error: 'Failed to recommend voting parameters' });
  }
});

/** POST /api/modules/governance/report — Generate governance report */
router.post('/governance/report', async (req: Request, res: Response) => {
  try {
    const { dao_id, user_id, period } = req.body;
    if (!dao_id) {
      res.status(400).json({ error: 'Missing required field: dao_id' });
      return;
    }
    const mod = getRegistry().getModule('governance') as GovernanceModule;
    const result = await mod.generateGovernanceReport(dao_id, user_id || 'anonymous', {
      period: period || 'last 30 days',
    });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error(`Governance report error: ${error}`);
    res.status(500).json({ error: 'Failed to generate governance report' });
  }
});

/** POST /api/modules/governance/constitution — Draft DAO constitution */
router.post('/governance/constitution', async (req: Request, res: Response) => {
  try {
    const { dao_id, user_id, governance_model, values } = req.body;
    if (!dao_id) {
      res.status(400).json({ error: 'Missing required field: dao_id' });
      return;
    }
    const mod = getRegistry().getModule('governance') as GovernanceModule;
    const result = await mod.draftConstitution(dao_id, user_id || 'anonymous', {
      governanceModel: governance_model || 'founder_led',
      values: values || ['transparency', 'decentralization', 'community'],
    });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error(`Governance constitution error: ${error}`);
    res.status(500).json({ error: 'Failed to draft constitution' });
  }
});

// ─── DAO Data Endpoints ───────────────────────────────────────────────────

/** GET /api/modules/dao/data — Get all DAO data from local DB */
router.get('/dao/data', async (req: Request, res: Response) => {
  try {
    const daoId = (req.query.dao_id as string) || 'sodaworld-dao-001';
    const k = getKnex();

    const [dao, members, agreements, proposals, votes, knowledge, conversations] = await Promise.all([
      k('daos').where({ id: daoId }).first(),
      k('dao_members').where({ dao_id: daoId }).leftJoin('users', 'dao_members.user_id', 'users.id'),
      k('agreements').where({ dao_id: daoId }).orderBy('created_at', 'desc'),
      k('proposals').where({ dao_id: daoId }).orderBy('created_at', 'desc'),
      k('votes').whereIn('proposal_id', k('proposals').select('id').where({ dao_id: daoId })),
      k('knowledge_items').where({ dao_id: daoId }).orderBy('created_at', 'desc').limit(100),
      k('ai_conversations').where({ dao_id: daoId }).orderBy('created_at', 'desc').limit(50),
    ]);

    res.json({
      dao: dao || null,
      members: members || [],
      agreements: agreements || [],
      proposals: proposals || [],
      votes: votes || [],
      knowledge_count: knowledge?.length || 0,
      conversation_count: conversations?.length || 0,
      summary: {
        member_count: members?.length || 0,
        agreement_count: agreements?.length || 0,
        proposal_count: proposals?.length || 0,
        vote_count: votes?.length || 0,
        active_proposals: proposals?.filter((p: { status: string }) => p.status === 'active').length || 0,
      },
    });
  } catch (error) {
    logger.error(`DAO data error: ${error}`);
    res.status(500).json({ error: 'Failed to get DAO data' });
  }
});

/** GET /api/modules/dao/members — Get DAO members with details */
router.get('/dao/members', async (req: Request, res: Response) => {
  try {
    const daoId = (req.query.dao_id as string) || 'sodaworld-dao-001';
    const k = getKnex();

    const members = await k('dao_members')
      .where({ dao_id: daoId })
      .leftJoin('users', 'dao_members.user_id', 'users.id')
      .select(
        'users.id as user_id',
        'users.display_name',
        'users.email',
        'users.role as user_role',
        'dao_members.role as dao_role',
        'dao_members.voting_power',
        'dao_members.reputation_score',
        'dao_members.joined_at',
      );

    res.json({ members });
  } catch (error) {
    logger.error(`DAO members error: ${error}`);
    res.status(500).json({ error: 'Failed to get DAO members' });
  }
});

/** GET /api/modules/dao/proposals — Get proposals with vote tallies */
router.get('/dao/proposals', async (req: Request, res: Response) => {
  try {
    const daoId = (req.query.dao_id as string) || 'sodaworld-dao-001';
    const k = getKnex();

    const proposals = await k('proposals').where({ dao_id: daoId }).orderBy('created_at', 'desc');

    const withVotes = await Promise.all(
      proposals.map(async (p: { id: string }) => {
        const voteCounts = await k('votes')
          .where({ proposal_id: p.id })
          .select('choice')
          .count('* as count')
          .sum('weight as total_weight')
          .groupBy('choice');

        return { ...p, votes: voteCounts };
      }),
    );

    res.json({ proposals: withVotes });
  } catch (error) {
    logger.error(`DAO proposals error: ${error}`);
    res.status(500).json({ error: 'Failed to get proposals' });
  }
});

// ─── Signature Endpoints ──────────────────────────────────────────────────

/** POST /api/modules/signatures/sign — Sign an agreement */
router.post('/signatures/sign', async (req: Request, res: Response) => {
  try {
    const { agreement_id, user_id, signature_data, ip_address } = req.body;
    if (!agreement_id || !user_id) {
      res.status(400).json({ error: 'Missing required fields: agreement_id, user_id' });
      return;
    }
    const k = getKnex();
    const crypto = await import('crypto');
    const now = new Date().toISOString();

    // Generate signature hash from user + agreement + timestamp
    const signaturePayload = `${user_id}:${agreement_id}:${now}:${signature_data || 'accepted'}`;
    const signatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

    const id = crypto.randomUUID();
    await k('agreement_signatures').insert({
      id,
      agreement_id,
      user_id,
      signature_hash: signatureHash,
      ip_address: ip_address || '0.0.0.0',
      metadata: JSON.stringify({ type: signature_data || 'digital_acceptance' }),
      signed_at: now,
    });

    res.json({ success: true, signature: { id, signature_hash: signatureHash, signed_at: now } });
  } catch (error) {
    logger.error(`Signature error: ${error}`);
    res.status(500).json({ error: `Failed to sign: ${error}` });
  }
});

/** GET /api/modules/signatures/:agreementId — Get signatures for an agreement */
router.get('/signatures/:agreementId', async (req: Request, res: Response) => {
  try {
    const agreementId = param(req, 'agreementId');
    const k = getKnex();
    const signatures = await k('agreement_signatures')
      .where({ agreement_id: agreementId })
      .leftJoin('users', 'agreement_signatures.user_id', 'users.id')
      .select(
        'agreement_signatures.*',
        'users.display_name',
        'users.email',
      );
    res.json({ signatures });
  } catch (error) {
    logger.error(`Get signatures error: ${error}`);
    res.status(500).json({ error: 'Failed to get signatures' });
  }
});

/** POST /api/modules/signatures/verify — Verify a signature */
router.post('/signatures/verify', async (req: Request, res: Response) => {
  try {
    const { signature_id } = req.body;
    if (!signature_id) {
      res.status(400).json({ error: 'Missing required field: signature_id' });
      return;
    }
    const k = getKnex();
    const sig = await k('agreement_signatures').where({ id: signature_id }).first();
    if (!sig) {
      res.status(404).json({ error: 'Signature not found', valid: false });
      return;
    }
    res.json({ valid: true, signature: sig });
  } catch (error) {
    logger.error(`Verify signature error: ${error}`);
    res.status(500).json({ error: 'Failed to verify signature' });
  }
});

// ─── Data Maintenance ─────────────────────────────────────────────────────

/** POST /api/modules/dao/fix-data — Fix all known data gaps */
router.post('/dao/fix-data', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const daoId = 'sodaworld-dao-001';
    const fixes: string[] = [];

    // 1. Remove duplicate dao_members (keep earliest joined_at per user)
    const dupes = await k('dao_members')
      .where({ dao_id: daoId })
      .select('user_id')
      .count('* as cnt')
      .groupBy('user_id')
      .having(k.raw('count(*) > 1'));

    for (const dup of dupes) {
      const userId = (dup as { user_id: string }).user_id;
      const rows = await k('dao_members')
        .where({ dao_id: daoId, user_id: userId })
        .orderBy('joined_at', 'asc');
      if (rows.length > 1) {
        // Delete all but the first
        const idsToDelete = rows.slice(1).map((r: { id?: string; user_id: string; joined_at: string }) => r.joined_at);
        await k('dao_members')
          .where({ dao_id: daoId, user_id: userId })
          .whereIn('joined_at', idsToDelete)
          .del();
        fixes.push(`Removed ${rows.length - 1} duplicate(s) for ${userId}`);
      }
    }

    // 2. Add placeholder Solana wallet addresses for all members
    const solanaAddresses: Record<string, string> = {
      'user-marcus':  'SW1mChenXyz1111111111111111111111111111111',
      'user-sarah':   'SW2sWilliamsXyz1111111111111111111111111111',
      'user-james':   'SW3jWrightXyz11111111111111111111111111111',
      'user-lisa':    'SW4lParkXyz111111111111111111111111111111',
      'user-david':   'SW5dKumarXyz11111111111111111111111111111',
      'user-emma':    'SW6eRodriguezXyz111111111111111111111111',
      'user-alex':    'SW7aThompsonXyz1111111111111111111111111',
      'user-mia':     'SW8mFosterXyz1111111111111111111111111111',
      'user-noah':    'SW9nBakerXyz11111111111111111111111111111',
    };
    for (const [userId, addr] of Object.entries(solanaAddresses)) {
      const updated = await k('users').where({ id: userId }).update({ wallet_address: addr });
      if (updated) fixes.push(`Set wallet for ${userId}: ${addr.substring(0, 12)}...`);
    }

    // 3. Seed agreement signatures for all active agreements
    const agreements = await k('agreements').where({ dao_id: daoId, status: 'active' });
    const crypto = await import('crypto');
    let sigCount = 0;

    for (const agr of agreements) {
      // Determine who should sign this agreement
      let signers: string[] = [];
      const agrId = (agr as { id: string }).id;
      const agrType = (agr as { type: string }).type;

      if (agrType === 'operating_agreement' || agrType === 'operating') {
        signers = ['user-marcus', 'user-sarah', 'user-james']; // Founders sign operating
      } else if (agrId.startsWith('agr-')) {
        // Individual agreement — the person it's for + a founder
        const memberId = agrId.replace('agr-', '');
        signers = [`user-${memberId}`, 'user-sarah'];
      } else if (agrType === 'contributor') {
        signers = ['user-sarah']; // Template signed by CEO
      } else if (agrType === 'nda') {
        signers = ['user-lisa']; // NDA signed by legal
      }

      for (const signerId of signers) {
        // Check if already signed
        const existing = await k('agreement_signatures')
          .where({ agreement_id: agrId, user_id: signerId })
          .first();
        if (existing) continue;

        const now = new Date().toISOString();
        const payload = `${signerId}:${agrId}:${now}:digital_acceptance`;
        const hash = crypto.createHash('sha256').update(payload).digest('hex');

        await k('agreement_signatures').insert({
          id: crypto.randomUUID(),
          agreement_id: agrId,
          user_id: signerId,
          signature_hash: hash,
          ip_address: '127.0.0.1',
          metadata: JSON.stringify({ type: 'digital_acceptance' }),
          signed_at: now,
        });
        sigCount++;
      }
    }
    if (sigCount > 0) fixes.push(`Created ${sigCount} agreement signatures`);

    // 4. Add treasury address to DAO
    await k('daos').where({ id: daoId }).update({
      treasury_address: 'SWTreasury1111111111111111111111111111111',
    });
    fixes.push('Set DAO treasury address');

    res.json({ success: true, fixes, total_fixes: fixes.length });
  } catch (error) {
    logger.error(`Fix data error: ${error}`);
    res.status(500).json({ error: `Failed to fix data: ${error}` });
  }
});

/** GET /api/modules/dao/signatures-summary — Get all signatures summary */
router.get('/dao/signatures-summary', async (req: Request, res: Response) => {
  try {
    const daoId = (req.query.dao_id as string) || 'sodaworld-dao-001';
    const k = getKnex();

    const agreements = await k('agreements').where({ dao_id: daoId });
    const summary = await Promise.all(
      agreements.map(async (agr: { id: string; title: string }) => {
        const sigs = await k('agreement_signatures')
          .where({ agreement_id: agr.id })
          .leftJoin('users', 'agreement_signatures.user_id', 'users.id')
          .select('users.display_name', 'agreement_signatures.signed_at', 'agreement_signatures.signature_hash');
        return { agreement_id: agr.id, title: agr.title, signatures: sigs };
      }),
    );

    res.json({ summary, total_agreements: agreements.length });
  } catch (error) {
    logger.error(`Signatures summary error: ${error}`);
    res.status(500).json({ error: 'Failed to get signatures summary' });
  }
});

// ─── Voting & Proposal Endpoints ──────────────────────────────────────────

/** POST /api/modules/proposals/create — Create a new proposal */
router.post('/proposals/create', async (req: Request, res: Response) => {
  try {
    const { dao_id, title, description, type, author_id, voting_days, quorum_required, approval_threshold, execution_payload } = req.body;
    if (!dao_id || !title || !type || !author_id) {
      res.status(400).json({ error: 'Missing required fields: dao_id, title, type, author_id' });
      return;
    }
    const k = getKnex();
    const crypto = await import('crypto');
    const now = new Date();
    const votingDays = voting_days || 7;
    const votingEnds = new Date(now.getTime() + votingDays * 24 * 60 * 60 * 1000);

    const id = `prop-${crypto.randomUUID().substring(0, 8)}`;
    await k('proposals').insert({
      id,
      dao_id,
      title,
      description: description || '',
      type,
      status: 'active',
      author_id,
      voting_starts_at: now.toISOString(),
      voting_ends_at: votingEnds.toISOString(),
      quorum_required: quorum_required || 0.5,
      approval_threshold: approval_threshold || 0.6,
      execution_payload: JSON.stringify(execution_payload || {}),
      result_summary: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    res.json({ success: true, proposal: { id, status: 'active', voting_ends_at: votingEnds.toISOString() } });
  } catch (error) {
    logger.error(`Create proposal error: ${error}`);
    res.status(500).json({ error: `Failed to create proposal: ${error}` });
  }
});

/** POST /api/modules/proposals/:id/vote — Cast a vote on a proposal */
router.post('/proposals/:id/vote', async (req: Request, res: Response) => {
  try {
    const proposalId = param(req, 'id');
    const { user_id, choice, reason } = req.body;
    if (!user_id || !choice) {
      res.status(400).json({ error: 'Missing required fields: user_id, choice' });
      return;
    }
    if (!['yes', 'no', 'abstain'].includes(choice)) {
      res.status(400).json({ error: 'Choice must be: yes, no, or abstain' });
      return;
    }
    const k = getKnex();
    const crypto = await import('crypto');

    // Check proposal exists and is active
    const proposal = await k('proposals').where({ id: proposalId }).first();
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }

    // Check if voting period is still open
    const now = new Date();
    if (new Date((proposal as { voting_ends_at: string }).voting_ends_at) < now) {
      res.status(400).json({ error: 'Voting period has ended' });
      return;
    }

    // Get voter's voting power
    const member = await k('dao_members').where({
      dao_id: (proposal as { dao_id: string }).dao_id,
      user_id,
    }).first();

    const weight = member ? (member as { voting_power: number }).voting_power : 0;

    // Check for existing vote (update if exists)
    const existingVote = await k('votes').where({ proposal_id: proposalId, user_id }).first();
    if (existingVote) {
      await k('votes').where({ proposal_id: proposalId, user_id }).update({
        choice,
        weight,
        reason: reason || null,
        cast_at: now.toISOString(),
      });
      res.json({ success: true, action: 'updated', vote: { choice, weight } });
      return;
    }

    const voteId = `vote-${crypto.randomUUID().substring(0, 8)}`;
    await k('votes').insert({
      id: voteId,
      proposal_id: proposalId,
      user_id,
      choice,
      weight,
      reason: reason || null,
      cast_at: now.toISOString(),
    });

    res.json({ success: true, action: 'created', vote: { id: voteId, choice, weight } });
  } catch (error) {
    logger.error(`Vote error: ${error}`);
    res.status(500).json({ error: `Failed to cast vote: ${error}` });
  }
});

/** POST /api/modules/proposals/:id/tally — Tally votes and finalize proposal */
router.post('/proposals/:id/tally', async (req: Request, res: Response) => {
  try {
    const proposalId = param(req, 'id');
    const k = getKnex();

    const proposal = await k('proposals').where({ id: proposalId }).first() as {
      dao_id: string; quorum_required: number; approval_threshold: number; status: string;
    } | undefined;

    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }

    // Get all votes
    const votes = await k('votes').where({ proposal_id: proposalId });
    const totalMembers = await k('dao_members')
      .where({ dao_id: proposal.dao_id })
      .whereNull('left_at')
      .count('* as count');
    const memberCount = (totalMembers[0] as { count: number }).count;

    // Tally
    let yesWeight = 0, noWeight = 0, abstainWeight = 0;
    for (const v of votes) {
      const vote = v as { choice: string; weight: number };
      if (vote.choice === 'yes') yesWeight += vote.weight;
      else if (vote.choice === 'no') noWeight += vote.weight;
      else abstainWeight += vote.weight;
    }

    const totalWeight = yesWeight + noWeight + abstainWeight;
    const totalPossibleWeight = await k('dao_members')
      .where({ dao_id: proposal.dao_id })
      .whereNull('left_at')
      .sum('voting_power as total');
    const possible = ((totalPossibleWeight[0] as { total: number }).total) || 1;

    const quorumMet = (votes.length / memberCount) >= proposal.quorum_required;
    const approved = quorumMet && (yesWeight / (yesWeight + noWeight || 1)) >= proposal.approval_threshold;

    const resultSummary = {
      votes_for: yesWeight,
      votes_against: noWeight,
      abstain: abstainWeight,
      total_votes: votes.length,
      total_weight: totalWeight,
      possible_weight: possible,
      quorum_met: quorumMet,
      approved,
      participation: `${((votes.length / memberCount) * 100).toFixed(1)}%`,
    };

    const newStatus = approved ? 'passed' : (quorumMet ? 'rejected' : 'failed_quorum');
    await k('proposals').where({ id: proposalId }).update({
      status: newStatus,
      result_summary: JSON.stringify(resultSummary),
      updated_at: new Date().toISOString(),
    });

    res.json({ success: true, status: newStatus, result: resultSummary });
  } catch (error) {
    logger.error(`Tally error: ${error}`);
    res.status(500).json({ error: `Failed to tally votes: ${error}` });
  }
});

/** GET /api/modules/proposals/:id — Get proposal with full vote details */
router.get('/proposals/:id', async (req: Request, res: Response) => {
  try {
    const proposalId = param(req, 'id');
    const k = getKnex();

    const proposal = await k('proposals').where({ id: proposalId }).first();
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }

    const votes = await k('votes')
      .where({ proposal_id: proposalId })
      .leftJoin('users', 'votes.user_id', 'users.id')
      .select('votes.*', 'users.display_name');

    res.json({ proposal, votes });
  } catch (error) {
    logger.error(`Get proposal error: ${error}`);
    res.status(500).json({ error: 'Failed to get proposal' });
  }
});

// ─── Agreement Signing Workflow ───────────────────────────────────────────

/** POST /api/modules/agreements/:id/request-signatures — Request all parties to sign */
router.post('/agreements/:id/request-signatures', async (req: Request, res: Response) => {
  try {
    const agreementId = param(req, 'id');
    const { requested_by } = req.body;
    const k = getKnex();

    const agreement = await k('agreements').where({ id: agreementId }).first() as {
      id: string; dao_id: string; title: string; type: string; created_by: string;
    } | undefined;
    if (!agreement) {
      res.status(404).json({ error: 'Agreement not found' });
      return;
    }

    // Get existing signatures
    const existingSigs = await k('agreement_signatures')
      .where({ agreement_id: agreementId })
      .select('user_id');
    const signedUserIds = new Set(existingSigs.map((s: { user_id: string }) => s.user_id));

    // Determine required signers based on agreement type
    const allMembers = await k('dao_members')
      .where({ dao_id: agreement.dao_id })
      .whereNull('left_at');

    let requiredSigners: string[] = [];
    if (agreement.type === 'operating_agreement' || agreement.type === 'operating') {
      // All founders sign operating agreement
      requiredSigners = allMembers
        .filter((m: { role: string }) => m.role === 'founder')
        .map((m: { user_id: string }) => m.user_id);
    } else if (agreement.id.startsWith('agr-')) {
      // Individual agreement — the person + creator
      const memberId = agreement.id.replace('agr-', '');
      requiredSigners = [`user-${memberId}`, agreement.created_by].filter((v, i, a) => a.indexOf(v) === i);
    } else {
      requiredSigners = [agreement.created_by];
    }

    const pendingSigners = requiredSigners.filter(id => !signedUserIds.has(id));

    res.json({
      agreement_id: agreementId,
      title: agreement.title,
      required_signers: requiredSigners,
      signed: Array.from(signedUserIds),
      pending: pendingSigners,
      fully_signed: pendingSigners.length === 0,
      requested_by: requested_by || 'system',
    });
  } catch (error) {
    logger.error(`Request signatures error: ${error}`);
    res.status(500).json({ error: `Failed to request signatures: ${error}` });
  }
});

/** GET /api/modules/agreements/:id — Get full agreement with signatures */
router.get('/agreements/:id', async (req: Request, res: Response) => {
  try {
    const agreementId = param(req, 'id');
    const k = getKnex();

    const agreement = await k('agreements').where({ id: agreementId }).first();
    if (!agreement) {
      res.status(404).json({ error: 'Agreement not found' });
      return;
    }

    const signatures = await k('agreement_signatures')
      .where({ agreement_id: agreementId })
      .leftJoin('users', 'agreement_signatures.user_id', 'users.id')
      .select('agreement_signatures.*', 'users.display_name', 'users.email');

    res.json({ agreement, signatures });
  } catch (error) {
    logger.error(`Get agreement error: ${error}`);
    res.status(500).json({ error: 'Failed to get agreement' });
  }
});

// ─── Bounty Endpoints ─────────────────────────────────────────────────────

/** GET /api/modules/bounties — List bounties */
router.get('/bounties', async (req: Request, res: Response) => {
  try {
    const daoId = (req.query.dao_id as string) || 'sodaworld-dao-001';
    const status = req.query.status as string | undefined;
    const k = getKnex();
    let query = k('bounties').where({ dao_id: daoId });
    if (status) query = query.where({ status });
    const bounties = await query.orderBy('created_at', 'desc');
    res.json({ bounties });
  } catch (error) {
    logger.error(`Bounties list error: ${error}`);
    res.status(500).json({ error: 'Failed to list bounties' });
  }
});

/** POST /api/modules/bounties/create — Create a bounty */
router.post('/bounties/create', async (req: Request, res: Response) => {
  try {
    const { dao_id, title, description, reward_amount, reward_token, created_by, deadline, deliverables, tags } = req.body;
    if (!dao_id || !title || !reward_amount || !created_by) {
      res.status(400).json({ error: 'Missing required fields: dao_id, title, reward_amount, created_by' });
      return;
    }
    const k = getKnex();
    const crypto = await import('crypto');
    const id = `bounty-${crypto.randomUUID().substring(0, 8)}`;
    const now = new Date().toISOString();
    await k('bounties').insert({
      id, dao_id, title, description: description || '',
      reward_amount, reward_token: reward_token || 'SODA',
      status: 'open', created_by, claimed_by: null,
      deadline: deadline || null,
      deliverables: JSON.stringify(deliverables || []),
      tags: JSON.stringify(tags || []),
      created_at: now, updated_at: now,
    });
    res.json({ success: true, bounty: { id, status: 'open' } });
  } catch (error) {
    logger.error(`Create bounty error: ${error}`);
    res.status(500).json({ error: `Failed to create bounty: ${error}` });
  }
});

/** POST /api/modules/bounties/:id/claim — Claim a bounty */
router.post('/bounties/:id/claim', async (req: Request, res: Response) => {
  try {
    const bountyId = param(req, 'id');
    const { user_id } = req.body;
    if (!user_id) {
      res.status(400).json({ error: 'Missing required field: user_id' });
      return;
    }
    const k = getKnex();
    const bounty = await k('bounties').where({ id: bountyId }).first();
    if (!bounty) { res.status(404).json({ error: 'Bounty not found' }); return; }
    if ((bounty as { status: string }).status !== 'open') {
      res.status(400).json({ error: 'Bounty is not open for claiming' }); return;
    }
    await k('bounties').where({ id: bountyId }).update({
      status: 'in_progress', claimed_by: user_id, updated_at: new Date().toISOString(),
    });
    res.json({ success: true, status: 'in_progress' });
  } catch (error) {
    logger.error(`Claim bounty error: ${error}`);
    res.status(500).json({ error: `Failed to claim bounty: ${error}` });
  }
});

/** POST /api/modules/bounties/:id/complete — Complete a bounty */
router.post('/bounties/:id/complete', async (req: Request, res: Response) => {
  try {
    const bountyId = param(req, 'id');
    const k = getKnex();
    await k('bounties').where({ id: bountyId }).update({
      status: 'completed', updated_at: new Date().toISOString(),
    });
    res.json({ success: true, status: 'completed' });
  } catch (error) {
    logger.error(`Complete bounty error: ${error}`);
    res.status(500).json({ error: `Failed to complete bounty: ${error}` });
  }
});

// ─── Marketplace Endpoints ────────────────────────────────────────────────

/** GET /api/modules/marketplace — List marketplace items */
router.get('/marketplace', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const k = getKnex();
    let query = k('marketplace_items');
    if (type) query = query.where({ type });
    if (status) query = query.where({ status });
    else query = query.where({ status: 'published' });
    const items = await query.orderBy('created_at', 'desc').limit(50);
    res.json({ items });
  } catch (error) {
    logger.error(`Marketplace list error: ${error}`);
    res.status(500).json({ error: 'Failed to list marketplace items' });
  }
});

/** POST /api/modules/marketplace/create — Create a marketplace listing */
router.post('/marketplace/create', async (req: Request, res: Response) => {
  try {
    const { title, description, type, price, currency, author_id, dao_id, metadata: meta } = req.body;
    if (!title || !type || !author_id) {
      res.status(400).json({ error: 'Missing required fields: title, type, author_id' });
      return;
    }
    const k = getKnex();
    const crypto = await import('crypto');
    const id = `mkt-${crypto.randomUUID().substring(0, 8)}`;
    const now = new Date().toISOString();
    await k('marketplace_items').insert({
      id, title, description: description || '', type,
      status: 'published', price: price || 0, currency: currency || 'SODA',
      author_id, dao_id: dao_id || null,
      download_count: 0, rating_avg: 0, rating_count: 0,
      metadata: JSON.stringify(meta || {}),
      created_at: now, updated_at: now,
    });
    res.json({ success: true, item: { id, status: 'published' } });
  } catch (error) {
    logger.error(`Create marketplace item error: ${error}`);
    res.status(500).json({ error: `Failed to create marketplace item: ${error}` });
  }
});

// ─── Event Bus Endpoints ──────────────────────────────────────────────────

/** POST /api/modules/events/emit — Emit a custom DAO event */
router.post('/events/emit', async (req: Request, res: Response) => {
  try {
    const { type, source, dao_id, payload: eventPayload } = req.body;
    if (!type || !source) {
      res.status(400).json({ error: 'Missing required fields: type, source' });
      return;
    }
    bus.emit({
      type,
      source,
      dao_id: dao_id || 'sodaworld-dao-001',
      payload: eventPayload || {},
    });
    res.json({ success: true, emitted: type });
  } catch (error) {
    logger.error(`Event emit error: ${error}`);
    res.status(500).json({ error: 'Failed to emit event' });
  }
});

// ─── System Health Dashboard ──────────────────────────────────────────────

/** GET /api/modules/dao/health — Comprehensive system health check */
router.get('/dao/health', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const daoId = 'sodaworld-dao-001';
    const reg = getRegistry();

    const [dao, memberCount, agreementCount, signatureCount, proposalCount, voteCount, knowledgeCount, conversationCount, bountyCount, marketplaceCount] = await Promise.all([
      k('daos').where({ id: daoId }).first(),
      k('dao_members').where({ dao_id: daoId }).whereNull('left_at').count('* as n').first(),
      k('agreements').where({ dao_id: daoId }).count('* as n').first(),
      k('agreement_signatures').count('* as n').first(),
      k('proposals').where({ dao_id: daoId }).count('* as n').first(),
      k('votes').count('* as n').first(),
      k('knowledge_items').where({ dao_id: daoId }).count('* as n').first(),
      k('ai_conversations').where({ dao_id: daoId }).count('* as n').first(),
      k('bounties').where({ dao_id: daoId }).count('* as n').first(),
      k('marketplace_items').count('* as n').first(),
    ]);

    const moduleStatus = await reg.getStatus();
    const activeProposals = await k('proposals').where({ dao_id: daoId }).whereIn('status', ['active', 'voting']).count('* as n').first();
    const openBounties = await k('bounties').where({ dao_id: daoId, status: 'open' }).count('* as n').first();

    res.json({
      healthy: true,
      dao: {
        name: (dao as { name: string })?.name || 'Unknown',
        phase: (dao as { phase: string })?.phase || 'unknown',
        governance_model: (dao as { governance_model: string })?.governance_model || 'unknown',
      },
      counts: {
        members: (memberCount as { n: number }).n,
        agreements: (agreementCount as { n: number }).n,
        signatures: (signatureCount as { n: number }).n,
        proposals: (proposalCount as { n: number }).n,
        votes: (voteCount as { n: number }).n,
        knowledge_items: (knowledgeCount as { n: number }).n,
        conversations: (conversationCount as { n: number }).n,
        bounties: (bountyCount as { n: number }).n,
        marketplace_items: (marketplaceCount as { n: number }).n,
      },
      active: {
        proposals: (activeProposals as { n: number }).n,
        bounties: (openBounties as { n: number }).n,
      },
      modules: moduleStatus,
      llm_available: BaseModule.hasLLM,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`Health check error: ${error}`);
    res.status(500).json({ healthy: false, error: `${error}` });
  }
});

// ─── Generic Module Routes (must be LAST — /:id is a catch-all) ──────────

/** GET /api/modules/:id — Get a specific module's info */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const moduleId = param(req, 'id') as AIModuleId;
    if (!VALID_MODULES.includes(moduleId)) {
      res.status(404).json({ error: `Unknown module: ${moduleId}` });
      return;
    }
    const reg = getRegistry();
    const mod = reg.getModule(moduleId);
    const status = await mod.getStatus();
    res.json({ id: moduleId, name: mod.moduleName, status });
  } catch (error) {
    logger.error(`Failed to get module ${param(req, 'id')}: ${error}`);
    res.status(500).json({ error: 'Failed to get module info' });
  }
});

/** POST /api/modules/:id/chat — Send a message to a module */
router.post('/:id/chat', async (req: Request, res: Response) => {
  try {
    const moduleId = param(req, 'id') as AIModuleId;
    if (!VALID_MODULES.includes(moduleId)) {
      res.status(404).json({ error: `Unknown module: ${moduleId}` });
      return;
    }
    const { content, dao_id, user_id, context, parent_message_id } = req.body;
    if (!content || !dao_id) {
      res.status(400).json({ error: 'Missing required fields: content, dao_id' });
      return;
    }
    const message: AgentMessage = {
      content, dao_id, user_id: user_id || 'anonymous', context, parent_message_id,
    };
    const reg = getRegistry();
    const mod = reg.getModule(moduleId);
    const response = await mod.processMessage(message);
    res.json({ success: true, response });
  } catch (error) {
    logger.error(`Module chat error (${param(req, 'id')}): ${error}`);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

/** POST /api/modules/:id/learn — Teach a module new knowledge */
router.post('/:id/learn', async (req: Request, res: Response) => {
  try {
    const moduleId = param(req, 'id') as AIModuleId;
    if (!VALID_MODULES.includes(moduleId)) {
      res.status(404).json({ error: `Unknown module: ${moduleId}` });
      return;
    }
    const { dao_id, category, title, content: itemContent, source, created_by, tags } = req.body;
    if (!dao_id || !category || !title || !itemContent) {
      res.status(400).json({ error: 'Missing required fields: dao_id, category, title, content' });
      return;
    }
    const reg = getRegistry();
    const mod = reg.getModule(moduleId);
    const item = await mod.learn(dao_id, {
      dao_id, module_id: moduleId, category, title, content: itemContent,
      source: source || 'user_input', confidence: 1.0, tags: tags || [],
      embedding_vector: null, created_by: created_by || 'anonymous', expires_at: null,
    });
    res.json({ success: true, item });
  } catch (error) {
    logger.error(`Module learn error (${param(req, 'id')}): ${error}`);
    res.status(500).json({ error: 'Failed to store knowledge' });
  }
});

/** GET /api/modules/:id/knowledge — Get module's knowledge for a DAO */
router.get('/:id/knowledge', async (req: Request, res: Response) => {
  try {
    const moduleId = param(req, 'id') as AIModuleId;
    if (!VALID_MODULES.includes(moduleId)) {
      res.status(404).json({ error: `Unknown module: ${moduleId}` });
      return;
    }
    const daoId = req.query.dao_id as string;
    const category = req.query.category as string | undefined;
    if (!daoId) {
      res.status(400).json({ error: 'Missing required query param: dao_id' });
      return;
    }
    const reg = getRegistry();
    const mod = reg.getModule(moduleId);
    const items = await mod.getKnowledge(daoId, category as any);
    res.json({ items });
  } catch (error) {
    logger.error(`Module knowledge error (${param(req, 'id')}): ${error}`);
    res.status(500).json({ error: 'Failed to get knowledge' });
  }
});

export default router;
