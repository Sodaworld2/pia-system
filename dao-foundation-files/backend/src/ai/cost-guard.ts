/**
 * CostGuard - Lightweight in-memory cost tracking and budget enforcement
 *
 * No database dependency. Tracks per-session daily spend in memory
 * with automatic daily reset. Designed to wrap any AI router/provider
 * call to prevent runaway costs.
 *
 * Usage:
 *   const guard = getCostGuard();
 *   if (!guard.checkBudget(sessionId)) throw new Error('Budget exceeded');
 *   // ...make AI call...
 *   guard.recordUsage(sessionId, 'gemini-pro', inputTokens, outputTokens);
 */

export const DEFAULT_DAILY_LIMIT = 5.0; // USD per session per day

/**
 * Cost per 1K tokens (combined input+output average) by model family.
 * These are simplified estimates for budget-gating purposes only;
 * exact billing comes from the provider.
 */
const COST_PER_1K_TOKENS: Record<string, number> = {
  // Google
  'gemini-flash':   0.0001,
  'gemini-pro':     0.003,

  // Anthropic
  'claude-sonnet':  0.003,
  'claude-opus':    0.015,

  // Aliases / full model IDs that should map to the same rate
  'gemini-1.5-flash':          0.0001,
  'gemini-1.5-pro':            0.003,
  'gemini-2.0-flash':          0.0001,
  'claude-sonnet-4-5-20250929': 0.003,
  'claude-haiku-4-5-20251001':  0.001,
  'claude-opus-4-6':            0.015,
};

/** Fallback cost if the model string is not recognised */
const DEFAULT_COST_PER_1K = 0.003;

interface SessionLedger {
  /** Total estimated USD spend for the current day */
  spend: number;
  /** Number of requests recorded today */
  requests: number;
  /** The calendar day (YYYY-MM-DD) this ledger covers */
  day: string;
}

export class CostGuard {
  private ledger: Map<string, SessionLedger> = new Map();
  private dailyLimit: number;

  constructor(dailyLimitUsd: number = DEFAULT_DAILY_LIMIT) {
    this.dailyLimit = dailyLimitUsd;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Returns `true` if the session is still within its daily budget.
   * Automatically resets the ledger if the calendar day has rolled over.
   */
  checkBudget(sessionId: string): boolean {
    const entry = this.getOrCreate(sessionId);
    return entry.spend < this.dailyLimit;
  }

  /**
   * Record token usage for a completed AI call.
   * Cost is estimated from the model's per-1K-token rate.
   */
  recordUsage(
    sessionId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): void {
    const totalTokens = inputTokens + outputTokens;
    const rate = this.resolveRate(model);
    const cost = (totalTokens / 1000) * rate;

    const entry = this.getOrCreate(sessionId);
    entry.spend += cost;
    entry.requests += 1;

    if (entry.spend >= this.dailyLimit) {
      console.error(
        `[CostGuard] Session "${sessionId}" has reached the daily limit ` +
        `($${entry.spend.toFixed(4)} / $${this.dailyLimit.toFixed(2)})`,
      );
    }
  }

  /**
   * Get the current day's spend for a single session.
   */
  getDailySpend(sessionId: string): number {
    const entry = this.ledger.get(sessionId);
    if (!entry) return 0;
    if (entry.day !== today()) return 0; // stale entry, effectively zero
    return entry.spend;
  }

  /**
   * Get an aggregate report of all tracked sessions for the current day.
   * Sessions from previous days are excluded.
   */
  getReport(): Record<string, { spend: number; requests: number }> {
    const now = today();
    const report: Record<string, { spend: number; requests: number }> = {};

    for (const [sessionId, entry] of this.ledger.entries()) {
      if (entry.day === now) {
        report[sessionId] = {
          spend: parseFloat(entry.spend.toFixed(6)),
          requests: entry.requests,
        };
      }
    }

    return report;
  }

  /**
   * Override the daily limit at runtime (useful for admin endpoints).
   */
  setDailyLimit(usd: number): void {
    this.dailyLimit = usd;
  }

  /**
   * Return the current daily limit.
   */
  getDailyLimit(): number {
    return this.dailyLimit;
  }

  /**
   * Manually reset a single session's ledger (e.g. after an admin override).
   */
  resetSession(sessionId: string): void {
    this.ledger.delete(sessionId);
  }

  /**
   * Purge all tracking data (e.g. at midnight via a cron-like scheduler).
   */
  resetAll(): void {
    this.ledger.clear();
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private getOrCreate(sessionId: string): SessionLedger {
    const now = today();
    let entry = this.ledger.get(sessionId);

    // Auto-reset if the day has rolled over
    if (!entry || entry.day !== now) {
      entry = { spend: 0, requests: 0, day: now };
      this.ledger.set(sessionId, entry);
    }

    return entry;
  }

  /**
   * Resolve the per-1K-token cost for a model string.
   * Tries an exact match first, then checks if any known key
   * is a substring of the provided model name.
   */
  private resolveRate(model: string): number {
    // Exact match
    if (COST_PER_1K_TOKENS[model] !== undefined) {
      return COST_PER_1K_TOKENS[model];
    }

    // Fuzzy match: check if any key is contained in the model string
    const lower = model.toLowerCase();
    for (const [key, rate] of Object.entries(COST_PER_1K_TOKENS)) {
      if (lower.includes(key.toLowerCase())) {
        return rate;
      }
    }

    return DEFAULT_COST_PER_1K;
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ------------------------------------------------------------------
// Singleton
// ------------------------------------------------------------------

let instance: CostGuard | null = null;

export function getCostGuard(): CostGuard {
  if (!instance) {
    instance = new CostGuard();
  }
  return instance;
}
