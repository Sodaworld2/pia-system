/**
 * Cost Router - Martin's Waterfall Model Selection
 *
 * Implements tiered cost routing for agent model selection:
 *
 *   Tier 0: FREE    - Ollama local (qwen2.5-coder:7b)
 *   Tier 1: CHEAP   - Claude Haiku 4.5 ($0.80/1M input)
 *   Tier 2: MEDIUM  - Claude Sonnet 4.5 ($3.00/1M input)
 *
 * The router tries the cheapest viable provider first,
 * falling back up the tier chain if a provider is unavailable.
 */

import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';

const logger = createLogger('CostRouter');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CostTier = 'free' | 'cheap' | 'medium';

export interface TierConfig {
  tier: CostTier;
  rank: number; // 0 = cheapest
  provider: string;
  model: string;
  costPer1MInput: number;
  costPer1MOutput: number;
  costLabel: string;
  checkAvailable: () => boolean;
}

export interface RoutingResult {
  provider: string;
  model: string;
  tier: CostTier;
  costLabel: string;
  estimatedCostPerRequest: number;
  fallbackChain: string[];
}

// ---------------------------------------------------------------------------
// Tier Definitions
// ---------------------------------------------------------------------------

function buildTiers(): TierConfig[] {
  return [
    {
      tier: 'free',
      rank: 0,
      provider: 'ollama',
      model: config.ai.ollamaModel || 'qwen2.5-coder:7b',
      costPer1MInput: 0,
      costPer1MOutput: 0,
      costLabel: 'FREE (local GPU)',
      checkAvailable: () => {
        // Ollama is available if the URL is configured
        // Actual liveness is checked at request time
        return !!config.features.ollamaUrl;
      },
    },
    {
      tier: 'cheap',
      rank: 1,
      provider: 'claude',
      model: 'claude-haiku-4-5-20251001',
      costPer1MInput: 0.80,
      costPer1MOutput: 4.00,
      costLabel: 'CHEAP (~$0.002/req)',
      checkAvailable: () => {
        return !!(process.env.PIA_CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
      },
    },
    {
      tier: 'medium',
      rank: 2,
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      costPer1MInput: 3.00,
      costPer1MOutput: 15.00,
      costLabel: 'MEDIUM (~$0.01/req)',
      checkAvailable: () => {
        return !!(process.env.PIA_CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// CostRouter Class
// ---------------------------------------------------------------------------

export class CostRouter {
  private tiers: TierConfig[];

  constructor() {
    this.tiers = buildTiers();
    logger.info(`CostRouter initialized: ${this.tiers.length} tiers configured`);
  }

  // -------------------------------------------------------------------------
  // Core Routing
  // -------------------------------------------------------------------------

  /**
   * Route to the best provider for a given cost tier + preference.
   *
   * Strategy:
   *   1. Try the exact tier requested
   *   2. If unavailable, waterfall DOWN to cheaper tiers
   *   3. If no cheaper tier works, waterfall UP to more expensive tiers
   *   4. If nothing works, return the requested tier anyway (let it fail at call time)
   */
  route(requestedTier: CostTier, preferredProvider?: string): RoutingResult {
    const targetRank = this.tierRank(requestedTier);
    const available = this.getAvailableTiers();

    // 1. Exact match on preferred provider
    if (preferredProvider) {
      const preferred = available.find(
        t => t.provider === preferredProvider && t.rank <= targetRank
      );
      if (preferred) {
        return this.buildResult(preferred, available);
      }
    }

    // 2. Best available at or below the requested tier
    const atOrBelow = available
      .filter(t => t.rank <= targetRank)
      .sort((a, b) => a.rank - b.rank); // cheapest first

    if (atOrBelow.length > 0) {
      // Prefer the tier closest to requested (use the budget)
      const best = atOrBelow[atOrBelow.length - 1];
      return this.buildResult(best, available);
    }

    // 3. Nothing at or below - escalate up
    const above = available
      .filter(t => t.rank > targetRank)
      .sort((a, b) => a.rank - b.rank);

    if (above.length > 0) {
      const cheapestAbove = above[0];
      logger.warn(
        `No ${requestedTier} tier available, escalating to ${cheapestAbove.tier} (${cheapestAbove.provider})`
      );
      return this.buildResult(cheapestAbove, available);
    }

    // 4. Nothing available at all - return requested tier as-is
    const requestedConfig = this.tiers.find(t => t.tier === requestedTier)!;
    logger.warn(`No providers available, returning ${requestedTier} tier (may fail)`);
    return this.buildResult(requestedConfig, []);
  }

  /**
   * Route specifically for a task complexity level.
   * Maps complexity to cost tiers:
   *   simple  → free
   *   medium  → cheap
   *   complex → medium
   */
  routeByComplexity(complexity: 'simple' | 'medium' | 'complex'): RoutingResult {
    const tierMap: Record<string, CostTier> = {
      simple: 'free',
      medium: 'cheap',
      complex: 'medium',
    };
    return this.route(tierMap[complexity] || 'cheap');
  }

  // -------------------------------------------------------------------------
  // Availability
  // -------------------------------------------------------------------------

  /**
   * Get all currently available tiers.
   */
  getAvailableTiers(): TierConfig[] {
    return this.tiers.filter(t => t.checkAvailable());
  }

  /**
   * Get full status of all tiers (available or not).
   */
  getStatus(): Array<TierConfig & { available: boolean }> {
    return this.tiers.map(t => ({
      ...t,
      available: t.checkAvailable(),
      // Strip the function so it's JSON-serializable
      checkAvailable: t.checkAvailable,
    }));
  }

  /**
   * Estimate cost for a given number of tokens at a tier.
   */
  estimateCost(tier: CostTier, inputTokens: number, outputTokens: number): number {
    const config = this.tiers.find(t => t.tier === tier);
    if (!config) return 0;

    return (
      (inputTokens / 1_000_000) * config.costPer1MInput +
      (outputTokens / 1_000_000) * config.costPer1MOutput
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private tierRank(tier: CostTier): number {
    const ranks: Record<CostTier, number> = { free: 0, cheap: 1, medium: 2 };
    return ranks[tier] ?? 1;
  }

  private buildResult(selected: TierConfig, available: TierConfig[]): RoutingResult {
    // Build fallback chain: tiers above the selected one
    const fallbackChain = available
      .filter(t => t.rank > selected.rank)
      .sort((a, b) => a.rank - b.rank)
      .map(t => `${t.provider}/${t.model}`);

    // Estimate cost for a typical request (~1K input, ~500 output tokens)
    const estimatedCostPerRequest =
      (1000 / 1_000_000) * selected.costPer1MInput +
      (500 / 1_000_000) * selected.costPer1MOutput;

    return {
      provider: selected.provider,
      model: selected.model,
      tier: selected.tier,
      costLabel: selected.costLabel,
      estimatedCostPerRequest,
      fallbackChain,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let costRouter: CostRouter | null = null;

export function getCostRouter(): CostRouter {
  if (!costRouter) {
    costRouter = new CostRouter();
  }
  return costRouter;
}
