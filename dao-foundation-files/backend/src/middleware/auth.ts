import type { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import type { User, UserRole } from '../../../types/foundation';
import admin from 'firebase-admin';

// ---------------------------------------------------------------------------
// Extend Express Request to carry authenticated user data
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      user?: User;
      firebaseUid?: string;
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let db: Knex;

/**
 * Initialise the auth middleware with a Knex instance.
 * Call once at application startup before mounting routes.
 */
export function initAuth(knexInstance: Knex): void {
  db = knexInstance;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice(7).trim();
}

async function lookupUserByFirebaseUid(uid: string): Promise<User | null> {
  if (!db) {
    throw new Error('Auth middleware not initialised — call initAuth(knex) first');
  }
  const row = await db<User>('users').where('firebase_uid', uid).first();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

/**
 * Verifies the Firebase ID token from the Authorization header,
 * resolves the platform user from the database, and attaches it
 * to `req.user`. Responds with 401 if the token is missing, invalid,
 * or the user does not exist in the local database.
 */
export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearerToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        data: null,
        error: 'Missing or malformed Authorization header. Expected: Bearer <token>',
      });
      return;
    }

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.firebaseUid = decoded.uid;

      const user = await lookupUserByFirebaseUid(decoded.uid);

      if (!user) {
        res.status(401).json({
          success: false,
          data: null,
          error: 'Authenticated Firebase user has no corresponding platform account.',
        });
        return;
      }

      req.user = user;
      next();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Token verification failed';

      res.status(401).json({
        success: false,
        data: null,
        error: `Authentication failed: ${message}`,
      });
    }
  };
}

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

/**
 * Gate access to users whose platform role is included in `allowedRoles`.
 * Must be used **after** `requireAuth()` so that `req.user` is populated.
 *
 * If the request also carries a `dao_id` param (e.g. `/daos/:dao_id/…`),
 * the check will prefer the user's DAO-scoped role from `dao_members`
 * over their global role from `users`.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        data: null,
        error: 'Authentication required before role check.',
      });
      return;
    }

    // When a dao_id is on the route, check the member-level role first
    const daoId = req.params.dao_id ?? req.params.daoId;
    let effectiveRole: UserRole = req.user.role;

    if (daoId && db) {
      const membership = await db('dao_members')
        .where({ dao_id: daoId, user_id: req.user.id })
        .whereNull('left_at')
        .first();

      if (membership) {
        effectiveRole = membership.role as UserRole;
      }
    }

    if (!allowedRoles.includes(effectiveRole)) {
      res.status(403).json({
        success: false,
        data: null,
        error: `Forbidden. Required role: ${allowedRoles.join(' | ')}. Your role: ${effectiveRole}.`,
      });
      return;
    }

    next();
  };
}
