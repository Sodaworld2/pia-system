/**
 * AI Cost Tracker
 * Records usage, calculates costs, enforces budgets
 */

import { getDatabase } from '../db/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('CostTracker');

export interface UsageRecord {
  provider: string;
  model: string;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  sessionId?: string;
  agentId?: string;
  success: boolean;
  errorMessage?: string;
}

export interface DailyCost {
  date: string;
  provider: string;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
  avgDurationMs: number;
}

export interface Budget {
  id: string;
  name: string;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  currentDailyUsd: number;
  currentMonthlyUsd: number;
  alertThreshold: number;
}

export interface CostSummary {
  today: number;
  thisWeek: number;
  thisMonth: number;
  byProvider: Record<string, number>;
  requestCount: number;
  totalTokens: number;
  budgetRemaining: {
    daily: number;
    monthly: number;
  };
  isOverBudget: boolean;
}

// Pricing per 1M tokens (input, output)
const PRICING: Record<string, { input: number; output: number }> = {
  // Ollama - FREE (local)
  'ollama': { input: 0, output: 0 },
  'codellama:13b': { input: 0, output: 0 },
  'deepseek-coder:6.7b': { input: 0, output: 0 },
  'qwen2.5-coder:7b': { input: 0, output: 0 },
  'qwen2.5-coder:32b': { input: 0, output: 0 },

  // Claude (primary cloud provider)
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-opus-4-6': { input: 15.00, output: 75.00 },
};

export class CostTracker {
  /**
   * Calculate cost for a request
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = PRICING[model] || PRICING['claude-haiku-4-5-20251001']; // Default to Haiku pricing
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Record AI usage
   */
  recordUsage(record: UsageRecord): void {
    const db = getDatabase();

    try {
      // Insert usage record
      db.prepare(`
        INSERT INTO ai_usage (
          provider, model, task_type, input_tokens, output_tokens,
          total_tokens, cost_usd, duration_ms, session_id, agent_id,
          success, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.provider,
        record.model,
        record.taskType,
        record.inputTokens,
        record.outputTokens,
        record.totalTokens,
        record.costUsd,
        record.durationMs,
        record.sessionId || null,
        record.agentId || null,
        record.success ? 1 : 0,
        record.errorMessage || null
      );

      // Update daily aggregate
      const today = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO ai_cost_daily (date, provider, request_count, total_tokens, total_cost_usd, avg_duration_ms)
        VALUES (?, ?, 1, ?, ?, ?)
        ON CONFLICT(date, provider) DO UPDATE SET
          request_count = request_count + 1,
          total_tokens = total_tokens + excluded.total_tokens,
          total_cost_usd = total_cost_usd + excluded.total_cost_usd,
          avg_duration_ms = (avg_duration_ms * request_count + excluded.avg_duration_ms) / (request_count + 1)
      `).run(today, record.provider, record.totalTokens, record.costUsd, record.durationMs);

      // Update budget tracking
      db.prepare(`
        UPDATE ai_budgets SET
          current_daily_usd = current_daily_usd + ?,
          current_monthly_usd = current_monthly_usd + ?
        WHERE id = 'default'
      `).run(record.costUsd, record.costUsd);

      logger.debug(`Recorded usage: ${record.provider}/${record.model} - $${record.costUsd.toFixed(4)}`);
    } catch (error) {
      logger.error(`Failed to record usage: ${error}`);
    }
  }

  /**
   * Get cost summary
   */
  getCostSummary(): CostSummary {
    const db = getDatabase();

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthStart = new Date().toISOString().slice(0, 7) + '-01';

    // Today's cost
    const todayCost = db.prepare(`
      SELECT COALESCE(SUM(total_cost_usd), 0) as total
      FROM ai_cost_daily WHERE date = ?
    `).get(today) as { total: number };

    // This week's cost
    const weekCost = db.prepare(`
      SELECT COALESCE(SUM(total_cost_usd), 0) as total
      FROM ai_cost_daily WHERE date >= ?
    `).get(weekAgo) as { total: number };

    // This month's cost
    const monthCost = db.prepare(`
      SELECT COALESCE(SUM(total_cost_usd), 0) as total
      FROM ai_cost_daily WHERE date >= ?
    `).get(monthStart) as { total: number };

    // By provider (this month)
    const byProvider = db.prepare(`
      SELECT provider, SUM(total_cost_usd) as total
      FROM ai_cost_daily WHERE date >= ?
      GROUP BY provider
    `).all(monthStart) as { provider: string; total: number }[];

    const byProviderMap: Record<string, number> = {};
    for (const row of byProvider) {
      byProviderMap[row.provider] = row.total;
    }

    // Total requests and tokens (this month)
    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(request_count), 0) as requests,
        COALESCE(SUM(total_tokens), 0) as tokens
      FROM ai_cost_daily WHERE date >= ?
    `).get(monthStart) as { requests: number; tokens: number };

    // Budget info
    const budget = db.prepare(`
      SELECT daily_limit_usd, monthly_limit_usd, current_daily_usd, current_monthly_usd
      FROM ai_budgets WHERE id = 'default'
    `).get() as { daily_limit_usd: number; monthly_limit_usd: number; current_daily_usd: number; current_monthly_usd: number } | undefined;

    const dailyLimit = budget?.daily_limit_usd || 10;
    const monthlyLimit = budget?.monthly_limit_usd || 100;

    return {
      today: todayCost.total,
      thisWeek: weekCost.total,
      thisMonth: monthCost.total,
      byProvider: byProviderMap,
      requestCount: totals.requests,
      totalTokens: totals.tokens,
      budgetRemaining: {
        daily: Math.max(0, dailyLimit - todayCost.total),
        monthly: Math.max(0, monthlyLimit - monthCost.total),
      },
      isOverBudget: todayCost.total >= dailyLimit || monthCost.total >= monthlyLimit,
    };
  }

  /**
   * Check if within budget
   */
  checkBudget(): { allowed: boolean; reason?: string } {
    const summary = this.getCostSummary();

    if (summary.budgetRemaining.daily <= 0) {
      return { allowed: false, reason: 'Daily budget exceeded' };
    }
    if (summary.budgetRemaining.monthly <= 0) {
      return { allowed: false, reason: 'Monthly budget exceeded' };
    }

    return { allowed: true };
  }

  /**
   * Get recent usage records
   */
  getRecentUsage(limit: number = 50): UsageRecord[] {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT * FROM ai_usage
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      provider: row.provider,
      model: row.model,
      taskType: row.task_type,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      costUsd: row.cost_usd,
      durationMs: row.duration_ms,
      sessionId: row.session_id,
      agentId: row.agent_id,
      success: row.success === 1,
      errorMessage: row.error_message,
    }));
  }

  /**
   * Get daily costs for chart
   */
  getDailyCosts(days: number = 30): DailyCost[] {
    const db = getDatabase();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const rows = db.prepare(`
      SELECT * FROM ai_cost_daily
      WHERE date >= ?
      ORDER BY date ASC
    `).all(startDate) as any[];

    return rows.map(row => ({
      date: row.date,
      provider: row.provider,
      requestCount: row.request_count,
      totalTokens: row.total_tokens,
      totalCostUsd: row.total_cost_usd,
      avgDurationMs: row.avg_duration_ms,
    }));
  }

  /**
   * Update provider availability
   */
  updateProviderStatus(providerId: string, isConfigured: boolean, isAvailable: boolean): void {
    const db = getDatabase();

    db.prepare(`
      UPDATE ai_providers SET
        is_configured = ?,
        is_available = ?,
        last_checked = unixepoch()
      WHERE id = ?
    `).run(isConfigured ? 1 : 0, isAvailable ? 1 : 0, providerId);
  }

  /**
   * Get provider status
   */
  getProviderStatus(): { id: string; name: string; tier: number; isLocal: boolean; isConfigured: boolean; isAvailable: boolean }[] {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT id, name, tier, is_local, is_configured, is_available
      FROM ai_providers ORDER BY tier ASC
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      tier: row.tier,
      isLocal: row.is_local === 1,
      isConfigured: row.is_configured === 1,
      isAvailable: row.is_available === 1,
    }));
  }

  /**
   * Reset daily budget (called by scheduler)
   */
  resetDailyBudget(): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE ai_budgets SET current_daily_usd = 0, last_reset_daily = unixepoch()
    `).run();
    logger.info('Daily AI budget reset');
  }

  /**
   * Reset monthly budget (called by scheduler)
   */
  resetMonthlyBudget(): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE ai_budgets SET current_monthly_usd = 0, last_reset_monthly = unixepoch()
    `).run();
    logger.info('Monthly AI budget reset');
  }

  /**
   * Set budget limits
   */
  setBudgetLimits(dailyLimit: number, monthlyLimit: number): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE ai_budgets SET daily_limit_usd = ?, monthly_limit_usd = ? WHERE id = 'default'
    `).run(dailyLimit, monthlyLimit);
    logger.info(`Budget limits updated: $${dailyLimit}/day, $${monthlyLimit}/month`);
  }
}

// Singleton
let costTracker: CostTracker | null = null;

export function getCostTracker(): CostTracker {
  if (!costTracker) {
    costTracker = new CostTracker();
  }
  return costTracker;
}
