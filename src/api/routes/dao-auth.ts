/**
 * DAO Auth Routes — Firebase Authentication for SodaWorld DAO
 *
 * POST /register  — Register new user (Firebase UID + email + display_name)
 * POST /login     — Verify Firebase token, return user + DAO membership
 * GET  /me        — Get current user profile + DAO role + voting power
 */

import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import knex, { Knex } from 'knex';
import { config } from '../../config.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('DAOAuth');

const FOUNDER_UID = '62JOpR8CVEaHOFmpR04ksDVmon23';
const DEFAULT_DAO_ID = 'sodaworld-dao-001';

// ── Knex instance (shared, pointed at same SQLite DB) ──

let db: Knex | null = null;

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

// ── Helper: Verify Firebase ID token from Authorization header ──

async function verifyFirebaseToken(req: Request): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.replace('Bearer ', '');
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded;
  } catch (error) {
    logger.warn(`Firebase token verification failed: ${error}`);
    return null;
  }
}

// ── Helper: Generate a UUID ──

async function generateId(): Promise<string> {
  const crypto = await import('crypto');
  return crypto.randomUUID();
}

// ── Helper: Ensure firebase_uid column exists on users table ──

async function ensureTablesExist(k: Knex): Promise<void> {
  const hasFirebaseUid = await k.schema.hasColumn('users', 'firebase_uid');
  if (!hasFirebaseUid) {
    await k.schema.alterTable('users', (table) => {
      table.string('firebase_uid').unique().nullable();
    });
    logger.info('Added firebase_uid column to users table');
  }
}

// ─── Routes ────────────────────────────────────────────

/**
 * POST /api/dao/auth/register
 *
 * Register a new DAO user. Verifies Firebase token, creates user record,
 * auto-creates dao_members entry. First user with founder UID gets founder role.
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const k = getKnex();
    await ensureTablesExist(k);

    // Verify Firebase token
    const decoded = await verifyFirebaseToken(req);
    if (!decoded) {
      res.status(401).json({ error: 'Invalid or missing Firebase token' });
      return;
    }

    const firebase_uid = decoded.uid;
    const email = req.body.email || decoded.email || '';
    const display_name = req.body.display_name || decoded.name || email.split('@')[0] || 'Anonymous';

    // Check if user already exists by firebase_uid
    const existing = await k('users').where({ firebase_uid }).first();
    if (existing) {
      res.status(409).json({
        error: 'User already registered',
        user: {
          id: existing.id,
          firebase_uid: existing.firebase_uid,
          email: existing.email,
          display_name: existing.display_name,
          role: existing.role,
        },
      });
      return;
    }

    // Also check by email — link Firebase UID to existing user
    const existingByEmail = await k('users').where({ email }).first();
    if (existingByEmail) {
      await k('users').where({ id: existingByEmail.id }).update({
        firebase_uid,
        updated_at: new Date().toISOString(),
      });

      const updated = await k('users').where({ id: existingByEmail.id }).first();
      const membership = await k('dao_members').where({ user_id: existingByEmail.id, dao_id: DEFAULT_DAO_ID }).first();

      res.json({
        message: 'Firebase UID linked to existing user',
        user: {
          id: updated.id,
          firebase_uid: updated.firebase_uid,
          email: updated.email,
          display_name: updated.display_name,
          role: updated.role,
        },
        dao_member: membership || null,
      });
      return;
    }

    // Determine role — founder gets special treatment
    const isFounder = firebase_uid === FOUNDER_UID;
    const role = isFounder ? 'founder' : 'member';

    // Create user
    const userId = `user-fb-${await generateId()}`;
    const now = new Date().toISOString();

    await k('users').insert({
      id: userId,
      firebase_uid,
      email,
      display_name,
      avatar_url: decoded.picture || null,
      role,
      wallet_address: null,
      metadata: JSON.stringify({
        auth_provider: decoded.firebase?.sign_in_provider || 'unknown',
        registered_at: now,
      }),
      created_at: now,
      updated_at: now,
    });

    // Auto-create DAO membership
    const memberId = `dm-${await generateId()}`;
    const daoRole = isFounder ? 'founder' : 'member';
    const votingPower = isFounder ? 3.0 : 1.0;

    await k('dao_members').insert({
      id: memberId,
      dao_id: DEFAULT_DAO_ID,
      user_id: userId,
      role: daoRole,
      joined_at: now,
      left_at: null,
      voting_power: votingPower,
      reputation_score: isFounder ? 100.0 : 0.0,
      metadata: JSON.stringify({
        joined_via: 'firebase_auth',
        auto_enrolled: true,
      }),
    });

    logger.info(`New user registered: ${email} (${firebase_uid}) as ${role}`);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: userId,
        firebase_uid,
        email,
        display_name,
        role,
        avatar_url: decoded.picture || null,
      },
      dao_member: {
        id: memberId,
        dao_id: DEFAULT_DAO_ID,
        role: daoRole,
        voting_power: votingPower,
        reputation_score: isFounder ? 100.0 : 0.0,
        joined_at: now,
      },
    });
  } catch (error) {
    logger.error(`Registration error: ${error}`);
    res.status(500).json({ error: `Registration failed: ${error}` });
  }
});

/**
 * POST /api/dao/auth/login
 *
 * Verify Firebase ID token, look up or create user, return user + DAO membership info.
 * This is the main sign-in endpoint for the frontend.
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const k = getKnex();
    await ensureTablesExist(k);

    // Verify Firebase token
    const decoded = await verifyFirebaseToken(req);
    if (!decoded) {
      res.status(401).json({ error: 'Invalid or missing Firebase token' });
      return;
    }

    const firebase_uid = decoded.uid;
    const email = decoded.email || '';
    const display_name = decoded.name || email.split('@')[0] || 'Anonymous';

    // Look up user by firebase_uid
    let user = await k('users').where({ firebase_uid }).first();

    // If not found by UID, try by email and link
    if (!user && email) {
      user = await k('users').where({ email }).first();
      if (user) {
        await k('users').where({ id: user.id }).update({
          firebase_uid,
          avatar_url: decoded.picture || user.avatar_url,
          updated_at: new Date().toISOString(),
        });
        user = await k('users').where({ id: user.id }).first();
      }
    }

    // If still not found, auto-register
    if (!user) {
      const isFounder = firebase_uid === FOUNDER_UID;
      const role = isFounder ? 'founder' : 'member';
      const userId = `user-fb-${await generateId()}`;
      const now = new Date().toISOString();

      await k('users').insert({
        id: userId,
        firebase_uid,
        email,
        display_name,
        avatar_url: decoded.picture || null,
        role,
        wallet_address: null,
        metadata: JSON.stringify({
          auth_provider: decoded.firebase?.sign_in_provider || 'unknown',
          auto_created_at: now,
        }),
        created_at: now,
        updated_at: now,
      });

      // Auto-create DAO membership
      const memberId = `dm-${await generateId()}`;
      const daoRole = isFounder ? 'founder' : 'member';
      const votingPower = isFounder ? 3.0 : 1.0;

      await k('dao_members').insert({
        id: memberId,
        dao_id: DEFAULT_DAO_ID,
        user_id: userId,
        role: daoRole,
        joined_at: now,
        left_at: null,
        voting_power: votingPower,
        reputation_score: isFounder ? 100.0 : 0.0,
        metadata: JSON.stringify({
          joined_via: 'firebase_auth_auto',
          auto_enrolled: true,
        }),
      });

      user = await k('users').where({ id: userId }).first();
      logger.info(`Auto-registered user on login: ${email} (${firebase_uid})`);
    }

    // Update last login
    await k('users').where({ id: user.id }).update({
      updated_at: new Date().toISOString(),
    });

    // Get DAO membership
    const membership = await k('dao_members')
      .where({ user_id: user.id, dao_id: DEFAULT_DAO_ID })
      .first();

    // Get DAO info
    const dao = await k('daos').where({ id: DEFAULT_DAO_ID }).first();

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        firebase_uid: user.firebase_uid,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        avatar_url: user.avatar_url,
        wallet_address: user.wallet_address,
      },
      dao_member: membership ? {
        dao_id: membership.dao_id,
        role: membership.role,
        voting_power: membership.voting_power,
        reputation_score: membership.reputation_score,
        joined_at: membership.joined_at,
      } : null,
      dao: dao ? {
        id: dao.id,
        name: dao.name,
        phase: dao.phase,
        governance_model: dao.governance_model,
      } : null,
    });
  } catch (error) {
    logger.error(`Login error: ${error}`);
    res.status(500).json({ error: `Login failed: ${error}` });
  }
});

/**
 * GET /api/dao/auth/me
 *
 * Get current authenticated user profile, DAO role, and voting power.
 * Requires Firebase auth (Bearer token in Authorization header).
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const k = getKnex();
    await ensureTablesExist(k);

    // Verify Firebase token
    const decoded = await verifyFirebaseToken(req);
    if (!decoded) {
      res.status(401).json({ error: 'Invalid or missing Firebase token' });
      return;
    }

    const firebase_uid = decoded.uid;

    // Look up user
    const user = await k('users').where({ firebase_uid }).first();
    if (!user) {
      res.status(404).json({ error: 'User not found. Please register or login first.' });
      return;
    }

    // Get DAO membership
    const membership = await k('dao_members')
      .where({ user_id: user.id, dao_id: DEFAULT_DAO_ID })
      .whereNull('left_at')
      .first();

    // Get DAO info
    const dao = await k('daos').where({ id: DEFAULT_DAO_ID }).first();

    // Get user recent activity
    const recentVotes = await k('votes')
      .where({ user_id: user.id })
      .orderBy('cast_at', 'desc')
      .limit(5);

    const signatureCount = await k('agreement_signatures')
      .where({ user_id: user.id })
      .count('* as count')
      .first();

    res.json({
      user: {
        id: user.id,
        firebase_uid: user.firebase_uid,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        avatar_url: user.avatar_url,
        wallet_address: user.wallet_address,
        created_at: user.created_at,
      },
      dao_membership: membership ? {
        dao_id: membership.dao_id,
        dao_name: dao?.name || DEFAULT_DAO_ID,
        role: membership.role,
        voting_power: membership.voting_power,
        reputation_score: membership.reputation_score,
        joined_at: membership.joined_at,
      } : null,
      activity: {
        recent_votes: recentVotes.length,
        total_signatures: (signatureCount as any)?.count || 0,
      },
    });
  } catch (error) {
    logger.error(`Get profile error: ${error}`);
    res.status(500).json({ error: `Failed to get profile: ${error}` });
  }
});

export default router;
