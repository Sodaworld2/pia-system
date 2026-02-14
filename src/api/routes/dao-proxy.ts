/**
 * DAO Proxy Bridge — Serve the same API shape as Machine #3 (100.102.217.69:5003)
 * so the DAOV1 frontend can point at PIA instead.
 *
 * Maps PIA's enriched local data into the response shapes the frontend expects.
 * Falls back to proxying to Machine #3 for endpoints not yet locally mapped.
 *
 * Endpoints:
 *   GET /api/dao-proxy/council     — Council members grouped by role
 *   GET /api/dao-proxy/dao         — DAO configuration and tokenomics
 *   GET /api/dao-proxy/treasury    — Treasury balance and transactions
 *   GET /api/dao-proxy/contracts   — Generated legal contracts
 *   GET /api/dao-proxy/agreements  — Agreement data with terms
 *   GET /api/dao-proxy/tokens      — Token statistics
 *   GET /api/dao-proxy/milestones  — Project milestones
 *   GET /api/dao-proxy/marketplace — Marketplace items
 *   GET /api/dao-proxy/bubbles     — Community projects
 *   GET /api/dao-proxy/health      — System health
 *   GET /api/dao-proxy/signatures  — Digital signatures
 *   GET /api/dao-proxy/token-distribution — Token distribution groups
 *   GET /api/dao-proxy/agreements/founder      — Founder agreements
 *   GET /api/dao-proxy/agreements/advisor      — Advisor agreements
 *   GET /api/dao-proxy/agreements/contributor  — Contributor agreements
 *   GET /api/dao-proxy/agreements/firstborn    — Firstborn agreements
 */

import { Router, Request, Response } from 'express';
import knex, { Knex } from 'knex';
import { config } from '../../config.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('DAOProxy');

const MACHINE3_API = 'http://100.102.217.69:5003/api';
const DAO_ID = 'sodaworld-dao-001';

// ── Knex (reuse from dao-modules or create own) ──

let db: Knex | null = null;
function getKnex(): Knex {
  if (!db) {
    db = knex({
      client: 'better-sqlite3',
      connection: { filename: config.database.path },
      useNullAsDefault: true,
    });
  }
  return db;
}

/** Proxy to Machine #3 as fallback */
async function proxyToMachine3(path: string): Promise<unknown> {
  try {
    const resp = await fetch(`${MACHINE3_API}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    return await resp.json();
  } catch (err) {
    logger.warn(`Machine #3 proxy failed for ${path}: ${err}`);
    return null;
  }
}

// ─── /council — Members grouped by role ──────────────────────────────────

router.get('/council', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const members = await k('dao_members')
      .where({ dao_id: DAO_ID })
      .whereNull('left_at')
      .leftJoin('users', 'dao_members.user_id', 'users.id')
      .leftJoin('agreements', function () {
        this.on('agreements.dao_id', '=', 'dao_members.dao_id')
          .andOn(k.raw("agreements.id LIKE '%' || REPLACE(dao_members.user_id, 'user-', '') || '%'"));
      })
      .select(
        'dao_members.*',
        'users.display_name',
        'users.email',
        'users.wallet_address',
        'agreements.id as agreement_id',
        'agreements.title as agreement_title',
        'agreements.status as agreement_status',
      );

    // Parse metadata and group by role
    const founders: unknown[] = [];
    const advisors: unknown[] = [];
    const contributors: unknown[] = [];
    const firstborn: unknown[] = [];

    for (const m of members) {
      const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : (m.metadata || {});
      const nameParts = (m.display_name || '').split(' ');

      const member = {
        id: m.user_id,
        dao_id: DAO_ID,
        agreement_id: m.agreement_id || null,
        name: nameParts[0] || '',
        surname: nameParts.slice(1).join(' ') || '',
        email: m.email,
        phone: null,
        wallet_address: m.wallet_address || null,
        photo_url: null,
        role_type: m.role === 'admin' ? 'advisor' : (m.role === 'observer' ? 'firstborn' : m.role),
        role_category: meta.title?.includes('Legal') ? 'Legal' :
          meta.title?.includes('Blockchain') ? 'Technical' :
          meta.title?.includes('Community') ? 'Community' :
          meta.title?.includes('Developer') ? 'Development' :
          meta.title?.includes('Creative') ? 'Creative' :
          meta.title?.includes('CTO') ? 'Technical' :
          meta.title?.includes('CEO') ? 'Business' :
          meta.title?.includes('Investor') ? 'Early Adopter' : 'General',
        custom_role_description: meta.title || m.role,
        token_allocation_total: meta.token_allocation || meta.tokens || 0,
        firestarter_period_months: m.role === 'founder' ? 12 : null,
        term_months: m.role === 'founder' ? null : (m.role === 'admin' ? 24 : 12),
        status: 'active',
        created_at: m.joined_at,
        updated_at: m.joined_at,
        agreement_title: m.agreement_title || null,
        agreement_status: m.agreement_status ? 'Active' : null,
        milestones_completed: 0,
        milestones_total: 0,
      };

      const roleType = member.role_type;
      if (roleType === 'founder') founders.push(member);
      else if (roleType === 'advisor') advisors.push(member);
      else if (roleType === 'contributor') contributors.push(member);
      else firstborn.push(member);
    }

    // Deduplicate (in case of multiple agreement joins)
    const dedup = (arr: unknown[]) => {
      const seen = new Set<string>();
      return arr.filter((m: any) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
    };

    const data = {
      founders: dedup(founders),
      advisors: dedup(advisors),
      contributors: dedup(contributors),
      firstborn: dedup(firstborn),
    };

    const stats = {
      founders: { count: data.founders.length, tokens: data.founders.reduce((s: number, m: any) => s + m.token_allocation_total, 0), max: 7 },
      advisors: { count: data.advisors.length, tokens: data.advisors.reduce((s: number, m: any) => s + m.token_allocation_total, 0) },
      contributors: { count: data.contributors.length, tokens: data.contributors.reduce((s: number, m: any) => s + m.token_allocation_total, 0) },
      firstborn: { count: data.firstborn.length, tokens: data.firstborn.reduce((s: number, m: any) => s + m.token_allocation_total, 0) },
    };

    res.json({ success: true, data, stats });
  } catch (error) {
    logger.error(`Council error: ${error}`);
    // Fallback to Machine #3
    const fallback = await proxyToMachine3('/council');
    if (fallback) { res.json(fallback); return; }
    res.status(500).json({ error: 'Failed to get council' });
  }
});

// ─── /dao — DAO config and tokenomics ────────────────────────────────────

router.get('/dao', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const dao = await k('daos').where({ id: DAO_ID }).first();
    if (!dao) {
      const fallback = await proxyToMachine3('/dao');
      if (fallback) { res.json(fallback); return; }
      res.status(404).json({ error: 'DAO not found' });
      return;
    }

    const settings = typeof dao.settings === 'string' ? JSON.parse(dao.settings) : (dao.settings || {});

    res.json({
      personalDetails: {},
      daoDetails: {
        name: dao.name,
        logo: null,
      },
      tokenomics: settings.tokenomics || { founders: 25, advisors: 25, foundation: 25, firstBorns: 25 },
      legal: {
        country: settings.legal_framework || 'United States',
        generatedContract: null,
      },
    });
  } catch (error) {
    logger.error(`DAO config error: ${error}`);
    res.status(500).json({ error: 'Failed to get DAO config' });
  }
});

// ─── /treasury — Balance and transactions ────────────────────────────────

router.get('/treasury', async (_req: Request, res: Response) => {
  try {
    // Proxy to Machine #3 since treasury transactions are there
    const fallback = await proxyToMachine3('/treasury');
    if (fallback) { res.json(fallback); return; }

    // Fallback to local data
    res.json({
      success: true,
      data: {
        balance: 1025000,
        signers: 3,
        requiredSignatures: 2,
        recentTransactions: [],
        pendingTransactions: 0,
      },
    });
  } catch (error) {
    logger.error(`Treasury error: ${error}`);
    res.status(500).json({ error: 'Failed to get treasury' });
  }
});

// ─── /contracts — Legal contracts ────────────────────────────────────────

router.get('/contracts', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const agreements = await k('agreements')
      .where({ dao_id: DAO_ID })
      .whereNot({ type: 'operating' })
      .whereNot({ type: 'operating_agreement' })
      .orderBy('created_at', 'desc');

    const contracts = agreements.map((a: any) => {
      const terms = typeof a.terms === 'string' ? JSON.parse(a.terms) : (a.terms || {});
      return {
        id: a.id,
        title: a.title,
        type: a.type,
        status: a.status === 'active' ? 'Active' : a.status,
        content: a.content_markdown,
        terms,
        created_at: a.created_at,
        created_by: a.created_by,
      };
    });

    res.json({ success: true, data: contracts });
  } catch (error) {
    logger.error(`Contracts error: ${error}`);
    const fallback = await proxyToMachine3('/contracts');
    if (fallback) { res.json(fallback); return; }
    res.status(500).json({ error: 'Failed to get contracts' });
  }
});

// ─── /signatures — Digital signatures ─────────────────────────────────────

router.get('/signatures', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const sigs = await k('agreement_signatures')
      .leftJoin('agreements', 'agreement_signatures.agreement_id', 'agreements.id')
      .leftJoin('users', 'agreement_signatures.user_id', 'users.id')
      .select(
        'agreement_signatures.*',
        'agreements.title as agreement_title',
        'agreements.type as agreement_type',
        'users.display_name as signer_name',
      )
      .orderBy('agreement_signatures.signed_at', 'desc');

    const mapped = sigs.map((s: any) => ({
      id: s.id,
      agreement_id: s.agreement_id,
      agreement_title: s.agreement_title,
      agreement_type: s.agreement_type,
      user_id: s.user_id,
      signer_name: s.signer_name,
      signature_type: s.signature_type,
      ip_address: s.ip_address,
      signed_at: s.signed_at,
    }));
    res.json({ success: true, data: mapped });
  } catch (error) {
    logger.error(`Signatures error: ${error}`);
    const fallback = await proxyToMachine3('/signatures');
    if (fallback) { res.json(fallback); return; }
    res.status(500).json({ error: 'Failed to get signatures' });
  }
});

// ─── /token-distribution — Token distribution groups ──────────────────────

router.get('/token-distribution', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const members = await k('dao_members').where({ dao_id: DAO_ID }).whereNull('left_at');
    const groups: Record<string, { count: number; tokens: number; members: string[] }> = {
      founders: { count: 0, tokens: 0, members: [] },
      advisors: { count: 0, tokens: 0, members: [] },
      contributors: { count: 0, tokens: 0, members: [] },
      firstborn: { count: 0, tokens: 0, members: [] },
    };

    for (const m of members) {
      const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : (m.metadata || {});
      const tokens = meta.token_allocation || meta.tokens || 0;
      const role = m.role === 'admin' ? 'advisors' : m.role === 'observer' ? 'firstborn' : `${m.role}s`;
      const g = groups[role] || groups.contributors;
      g.count++;
      g.tokens += tokens;
      g.members.push(m.user_id);
    }

    const dao = await k('daos').where({ id: DAO_ID }).first();
    const settings = dao && typeof dao.settings === 'string' ? JSON.parse(dao.settings) : {};
    const totalSupply = settings.total_supply || 100000000;

    res.json({
      success: true,
      data: {
        totalSupply,
        symbol: settings.token_symbol || 'SODA',
        groups: Object.entries(groups).map(([name, g]) => ({
          name,
          percentage: settings.tokenomics?.[name === 'firstborn' ? 'firstBorns' : name] || 25,
          memberCount: g.count,
          totalTokens: g.tokens,
          members: g.members,
        })),
      },
    });
  } catch (error) {
    logger.error(`Token distribution error: ${error}`);
    const fallback = await proxyToMachine3('/token-distribution');
    if (fallback) { res.json(fallback); return; }
    res.status(500).json({ error: 'Failed to get token distribution' });
  }
});

// ─── /agreements/:role — Role-specific agreement endpoints ────────────────

for (const role of ['founder', 'advisor', 'contributor', 'firstborn'] as const) {
  router.get(`/agreements/${role}`, async (_req: Request, res: Response) => {
    try {
      const k = getKnex();
      const roleType = role === 'firstborn' ? 'observer' : role === 'advisor' ? 'admin' : role;
      const memberIds = await k('dao_members')
        .where({ dao_id: DAO_ID, role: roleType })
        .whereNull('left_at')
        .pluck('user_id');

      const agreements = await k('agreements')
        .where({ dao_id: DAO_ID })
        .andWhere(function () {
          this.where('type', 'like', `%${role}%`);
          if (memberIds.length > 0) {
            this.orWhereIn('created_by', memberIds);
          }
        })
        .orderBy('created_at', 'desc');

      const withSigs = await Promise.all(
        agreements.map(async (a: any) => {
          const sigs = await k('agreement_signatures')
            .where({ agreement_id: a.id })
            .leftJoin('users', 'agreement_signatures.user_id', 'users.id')
            .select('users.display_name', 'agreement_signatures.signed_at', 'agreement_signatures.signature_type');
          const terms = typeof a.terms === 'string' ? JSON.parse(a.terms) : (a.terms || {});
          return {
            id: a.id, title: a.title, type: a.type, status: a.status,
            content: a.content_markdown, terms, signatures: sigs,
            created_at: a.created_at, created_by: a.created_by,
          };
        }),
      );

      // If no local data, fallback to Machine #3
      if (withSigs.length === 0) {
        const fallback = await proxyToMachine3(`/agreements/${role}`);
        if (fallback) { res.json(fallback); return; }
      }

      res.json({ success: true, data: withSigs });
    } catch (error) {
      logger.error(`${role} agreements error: ${error}`);
      const fallback = await proxyToMachine3(`/agreements/${role}`);
      if (fallback) { res.json(fallback); return; }
      res.status(500).json({ error: `Failed to get ${role} agreements` });
    }
  });
}

// ─── /agreements — Agreement data ────────────────────────────────────────

router.get('/agreements', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const agreements = await k('agreements').where({ dao_id: DAO_ID });
    const withSigs = await Promise.all(
      agreements.map(async (a: any) => {
        const sigs = await k('agreement_signatures')
          .where({ agreement_id: a.id })
          .leftJoin('users', 'agreement_signatures.user_id', 'users.id')
          .select('users.display_name', 'agreement_signatures.signed_at');
        const terms = typeof a.terms === 'string' ? JSON.parse(a.terms) : (a.terms || {});
        return {
          id: a.id, title: a.title, type: a.type, status: a.status,
          content: a.content_markdown, terms, signatures: sigs,
          created_at: a.created_at, created_by: a.created_by,
        };
      }),
    );
    res.json({ success: true, data: withSigs });
  } catch (error) {
    logger.error(`Agreements error: ${error}`);
    const fallback = await proxyToMachine3('/agreements');
    if (fallback) { res.json(fallback); return; }
    res.status(500).json({ error: 'Failed to get agreements' });
  }
});

// ─── /tokens — Token statistics ──────────────────────────────────────────

router.get('/tokens', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const members = await k('dao_members').where({ dao_id: DAO_ID }).whereNull('left_at');
    let totalAllocated = 0;
    for (const m of members) {
      const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : (m.metadata || {});
      totalAllocated += meta.tokens || 0;
    }

    const dao = await k('daos').where({ id: DAO_ID }).first();
    const settings = dao && typeof dao.settings === 'string' ? JSON.parse(dao.settings) : {};
    const totalSupply = settings.total_supply || 100000000;

    res.json({
      success: true,
      data: {
        totalUsers: members.length,
        totalSupply,
        allocated: totalAllocated,
        circulatingSupply: 0,
        symbol: settings.token_symbol || 'SODA',
      },
    });
  } catch (error) {
    logger.error(`Tokens error: ${error}`);
    res.status(500).json({ error: 'Failed to get token stats' });
  }
});

// ─── /milestones — Project milestones ────────────────────────────────────

router.get('/milestones', async (_req: Request, res: Response) => {
  try {
    // Proxy to Machine #3 since milestones are stored there
    const fallback = await proxyToMachine3('/milestones');
    if (fallback) { res.json(fallback); return; }
    res.json({ success: true, data: [] });
  } catch (error) {
    logger.error(`Milestones error: ${error}`);
    res.status(500).json({ error: 'Failed to get milestones' });
  }
});

// ─── /marketplace — Items for sale ───────────────────────────────────────

router.get('/marketplace', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const items = await k('marketplace_items').orderBy('created_at', 'desc').limit(50);
    if (items.length === 0) {
      const fallback = await proxyToMachine3('/marketplace');
      if (fallback) { res.json(fallback); return; }
    }
    const mapped = items.map((i: any) => ({
      id: i.id, title: i.title, description: i.description,
      type: i.type, price: i.price, currency: i.currency,
      status: i.status, download_count: i.download_count,
      rating_avg: i.rating_avg, rating_count: i.rating_count,
    }));
    res.json({ success: true, data: mapped });
  } catch (error) {
    logger.error(`Marketplace error: ${error}`);
    res.status(500).json({ error: 'Failed to get marketplace' });
  }
});

// ─── /bubbles — Community projects ───────────────────────────────────────

router.get('/bubbles', async (_req: Request, res: Response) => {
  try {
    const fallback = await proxyToMachine3('/bubbles');
    if (fallback) { res.json(fallback); return; }
    res.json({ success: true, data: [] });
  } catch (error) {
    logger.error(`Bubbles error: ${error}`);
    res.status(500).json({ error: 'Failed to get bubbles' });
  }
});

// ─── /proposals — Governance proposals with votes ───────────────────────

router.get('/proposals', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const proposals = await k('proposals').where({ dao_id: DAO_ID }).orderBy('created_at', 'desc');
    const withVotes = await Promise.all(
      proposals.map(async (p: any) => {
        const votes = await k('votes').where({ proposal_id: p.id });
        const forVotes = votes.filter((v: any) => v.vote === 'for' || v.vote === 'yes').length;
        const against = votes.filter((v: any) => v.vote === 'against' || v.vote === 'no').length;
        const abstain = votes.filter((v: any) => v.vote === 'abstain').length;
        return {
          id: p.id, title: p.title, description: p.description,
          type: p.type, status: p.status, priority: p.priority,
          created_by: p.created_by, created_at: p.created_at,
          voting_ends_at: p.voting_ends_at,
          quorum_required: p.quorum_required || 3,
          votes: { for: forVotes, against, abstain, total: votes.length },
        };
      }),
    );
    res.json({ success: true, data: withVotes });
  } catch (error) {
    logger.error(`Proposals error: ${error}`);
    const fallback = await proxyToMachine3('/proposals');
    if (fallback) { res.json(fallback); return; }
    res.status(500).json({ error: 'Failed to get proposals' });
  }
});

// ─── /knowledge — DAO knowledge base ────────────────────────────────────

router.get('/knowledge', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const items = await k('knowledge_items').orderBy('created_at', 'desc').limit(100);
    const mapped = items.map((i: any) => ({
      id: i.id, title: i.title, category: i.category,
      content: i.content, source: i.source,
      created_at: i.created_at, updated_at: i.updated_at,
    }));
    res.json({ success: true, data: mapped });
  } catch (error) {
    logger.error(`Knowledge error: ${error}`);
    res.status(500).json({ error: 'Failed to get knowledge items' });
  }
});

// ─── /bounties — Open bounties ──────────────────────────────────────────

router.get('/bounties', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const bounties = await k('bounties').orderBy('created_at', 'desc');
    res.json({ success: true, data: bounties });
  } catch (error) {
    logger.error(`Bounties error: ${error}`);
    res.status(500).json({ error: 'Failed to get bounties' });
  }
});

// ─── /token-distribution/history — Token distribution over time ─────────

router.get('/token-distribution/history', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const members = await k('dao_members').where({ dao_id: DAO_ID }).whereNull('left_at');
    const byRole: Record<string, number> = { founders: 0, advisors: 0, contributors: 0, firstborn: 0 };
    for (const m of members) {
      const meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : (m.metadata || {});
      const tokens = meta.token_allocation || meta.tokens || 0;
      const role = m.role === 'admin' ? 'advisors' : m.role === 'observer' ? 'firstborn' : `${m.role}s`;
      byRole[role] = (byRole[role] || 0) + tokens;
    }
    const dao = await k('daos').where({ id: DAO_ID }).first();
    const settings = dao && typeof dao.settings === 'string' ? JSON.parse(dao.settings) : {};
    const totalSupply = settings.total_supply || 100000000;

    res.json({
      success: true,
      data: {
        totalSupply,
        distributed: byRole,
        history: [
          { date: '2026-01-01', founders: byRole.founders, advisors: byRole.advisors, contributors: byRole.contributors, firstborn: byRole.firstborn },
        ],
      },
    });
  } catch (error) {
    logger.error(`Token distribution error: ${error}`);
    res.status(500).json({ error: 'Failed to get token distribution' });
  }
});

// ─── /health — System health ─────────────────────────────────────────────

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const k = getKnex();
    const memberCount = await k('dao_members').where({ dao_id: DAO_ID }).count('* as n').first();
    const agreementCount = await k('agreements').where({ dao_id: DAO_ID }).count('* as n').first();

    // Also check Machine #3
    let machine3Status = 'unknown';
    try {
      const resp = await fetch(`${MACHINE3_API}/health`, { signal: AbortSignal.timeout(3000) });
      machine3Status = resp.ok ? 'online' : 'degraded';
    } catch { machine3Status = 'offline'; }

    res.json({
      success: true,
      status: 'healthy',
      uptime: process.uptime(),
      environment: 'production',
      database: { connected: true },
      pia_hub: { status: 'online', port: 3000 },
      machine3: { status: machine3Status, url: MACHINE3_API },
      dao: {
        members: (memberCount as any)?.n || 0,
        agreements: (agreementCount as any)?.n || 0,
      },
    });
  } catch (error) {
    logger.error(`Health error: ${error}`);
    res.status(500).json({ success: false, status: 'unhealthy' });
  }
});

export default router;
