/**
 * Delegation Enforcement - Martin's Template Rules
 *
 * PostToolUse hook logic that enforces delegation rules:
 * - Agents must stay within their role boundaries
 * - Cost-aware routing suggestions
 * - Complexity detection for tier escalation
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('Delegation');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DelegationContext {
  agentId: string;
  agentType: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId?: string;
}

export interface DelegationResult {
  allowed: boolean;
  reason?: string;
  suggestedDelegate?: string;
  costWarning?: string;
  warnings: string[];
}

export interface DelegationRule {
  name: string;
  description: string;
  check: (context: DelegationContext) => RuleResult;
}

interface RuleResult {
  allowed: boolean;
  reason?: string;
  suggestedDelegate?: string;
  costWarning?: string;
}

// ---------------------------------------------------------------------------
// Role Capability Map
// ---------------------------------------------------------------------------

const ROLE_CAPABILITIES: Record<string, string[]> = {
  'local-coder': ['code-generation', 'file-editing', 'testing', 'refactoring', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
  'researcher': ['web-search', 'summarization', 'analysis', 'documentation', 'WebFetch', 'WebSearch', 'Read'],
  'reviewer': ['code-review', 'security-audit', 'best-practices', 'Read', 'Grep', 'Glob'],
  'debug': ['debugging', 'log-analysis', 'error-tracing', 'Read', 'Bash', 'Grep'],
  'devops': ['docker', 'ci-cd', 'scripting', 'system-config', 'Bash', 'Read', 'Write', 'Edit'],
  'security': ['vulnerability-scanning', 'dependency-audit', 'auth-review', 'Read', 'Grep', 'Bash'],
};

const TOOL_TO_ROLE: Record<string, string> = {
  'WebSearch': 'researcher',
  'WebFetch': 'researcher',
};

// ---------------------------------------------------------------------------
// Delegation Rules
// ---------------------------------------------------------------------------

const RULES: DelegationRule[] = [
  {
    name: 'ROLE_BOUNDARY',
    description: 'Agents must stay within their role capabilities. Cross-role operations suggest delegation.',
    check: (ctx: DelegationContext): RuleResult => {
      const capabilities = ROLE_CAPABILITIES[ctx.agentType];
      if (!capabilities) {
        // Unknown agent type - allow everything
        return { allowed: true };
      }

      // Check if tool is in capability list
      if (capabilities.includes(ctx.toolName)) {
        return { allowed: true };
      }

      // Suggest delegate based on tool
      const suggestedRole = TOOL_TO_ROLE[ctx.toolName];
      if (suggestedRole && suggestedRole !== ctx.agentType) {
        return {
          allowed: true, // Allow but warn
          reason: `@${ctx.agentType} using ${ctx.toolName} outside its role`,
          suggestedDelegate: suggestedRole,
        };
      }

      // For coder doing web search
      if (ctx.agentType === 'local-coder' && ['WebSearch', 'WebFetch'].includes(ctx.toolName)) {
        return {
          allowed: true,
          reason: 'Coder doing web research - consider delegating',
          suggestedDelegate: 'researcher',
        };
      }

      // For researcher doing code edits
      if (ctx.agentType === 'researcher' && ['Write', 'Edit'].includes(ctx.toolName)) {
        return {
          allowed: true,
          reason: 'Researcher editing code - consider delegating',
          suggestedDelegate: 'local-coder',
        };
      }

      // For debug doing security work
      if (ctx.agentType === 'debug' && ctx.toolName === 'security-scan') {
        return {
          allowed: true,
          reason: 'Debug agent doing security work - consider delegating',
          suggestedDelegate: 'security',
        };
      }

      return { allowed: true };
    },
  },

  {
    name: 'COST_AWARENESS',
    description: 'Warns when free-tier agents attempt operations better suited for higher tiers.',
    check: (ctx: DelegationContext): RuleResult => {
      const freeTierAgents = ['local-coder', 'debug'];
      if (!freeTierAgents.includes(ctx.agentType)) {
        return { allowed: true };
      }

      // Complex analysis tools that benefit from better models
      const complexTools = ['code-review', 'security-audit', 'architecture-analysis'];
      if (complexTools.includes(ctx.toolName)) {
        return {
          allowed: true,
          costWarning: `Free-tier agent ${ctx.agentType} running ${ctx.toolName}. Consider escalating to medium tier for better results.`,
        };
      }

      return { allowed: true };
    },
  },

  {
    name: 'COMPLEXITY_CHECK',
    description: 'Detects very large inputs that may benefit from more capable models.',
    check: (ctx: DelegationContext): RuleResult => {
      // Check input size
      let totalSize = 0;
      for (const value of Object.values(ctx.toolInput)) {
        if (typeof value === 'string') {
          totalSize += value.length;
        }
      }

      if (totalSize > 10000) {
        return {
          allowed: true,
          costWarning: `Large input detected (${Math.round(totalSize / 1000)}k chars). A medium-tier model may produce better results.`,
          suggestedDelegate: 'reviewer',
        };
      }

      return { allowed: true };
    },
  },
];

// ---------------------------------------------------------------------------
// Main Validation Function
// ---------------------------------------------------------------------------

/**
 * Validate a delegation context against all rules.
 * Returns aggregated result with warnings.
 */
export function validateDelegation(context: DelegationContext): DelegationResult {
  const warnings: string[] = [];
  let costWarning: string | undefined;
  let suggestedDelegate: string | undefined;

  for (const rule of RULES) {
    const result = rule.check(context);

    if (!result.allowed) {
      logger.warn(`Delegation blocked by ${rule.name}: ${result.reason}`);
      return {
        allowed: false,
        reason: result.reason,
        suggestedDelegate: result.suggestedDelegate,
        costWarning: result.costWarning,
        warnings,
      };
    }

    if (result.reason) warnings.push(`[${rule.name}] ${result.reason}`);
    if (result.costWarning) costWarning = result.costWarning;
    if (result.suggestedDelegate) suggestedDelegate = result.suggestedDelegate;
  }

  return {
    allowed: true,
    suggestedDelegate,
    costWarning,
    warnings,
  };
}

/**
 * Get all configured delegation rules for introspection.
 */
export function getDelegationRules(): DelegationRule[] {
  return RULES.map(r => ({
    name: r.name,
    description: r.description,
    check: r.check,
  }));
}
