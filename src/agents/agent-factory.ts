/**
 * Agent Factory - Dynamic Agent Creation & Management
 *
 * Defines agent templates (roles) and spawns configured agents
 * into the PIA fleet. Each template specifies capabilities,
 * model preference, and cost tier.
 *
 * Templates:
 *   @local-coder  - Code generation on local Ollama (FREE)
 *   @researcher   - Web research via Claude Haiku (CHEAP)
 *   @reviewer     - Code review via Claude Sonnet (MEDIUM)
 *   @debug        - Debugging on local Ollama (FREE)
 *   @devops       - Infrastructure & CI/CD via Claude Haiku (CHEAP)
 *   @security     - Security auditing via Claude Sonnet (MEDIUM)
 */

import { createLogger } from '../utils/logger.js';
import {
  createAgent,
  getAgentById,
  getAllAgents,
  updateAgentStatus,
  Agent,
} from '../db/queries/agents.js';
import { getAllMachines } from '../db/queries/machines.js';
import { getCostRouter, CostTier } from './cost-router.js';

const logger = createLogger('AgentFactory');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateName =
  | 'local-coder'
  | 'researcher'
  | 'reviewer'
  | 'debug'
  | 'devops'
  | 'security';

export interface AgentTemplate {
  name: TemplateName;
  displayName: string;
  description: string;
  capabilities: string[];
  modelPreference: 'ollama' | 'gemini' | 'openai' | 'grok' | 'claude';
  costTier: CostTier;
  systemPrompt: string;
  maxConcurrent: number;
  autoSpawnCli: boolean;
}

export interface SpawnOptions {
  machineId?: string;
  taskDescription: string;
  autoStart?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SpawnResult {
  agent: Agent;
  template: AgentTemplate;
  costEstimate: string;
}

export interface FactoryStatus {
  templates: AgentTemplate[];
  running: Agent[];
  totalSpawned: number;
  byTemplate: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Template Registry
// ---------------------------------------------------------------------------

const TEMPLATES: Map<TemplateName, AgentTemplate> = new Map([
  [
    'local-coder',
    {
      name: 'local-coder',
      displayName: '@local-coder',
      description: 'Fast local code generation using Ollama. Best for file edits, new functions, boilerplate, and quick iterations.',
      capabilities: ['code-generation', 'file-editing', 'testing', 'refactoring'],
      modelPreference: 'ollama',
      costTier: 'free',
      systemPrompt:
        'You are a fast, precise coding agent. Write clean, minimal code. Follow existing patterns in the codebase. No unnecessary comments or over-engineering.',
      maxConcurrent: 4,
      autoSpawnCli: true,
    },
  ],
  [
    'researcher',
    {
      name: 'researcher',
      displayName: '@researcher',
      description: 'Web research and analysis using Claude Haiku. Summarizes docs, compares libraries, gathers technical intel.',
      capabilities: ['web-search', 'summarization', 'analysis', 'documentation'],
      modelPreference: 'claude',
      costTier: 'cheap',
      systemPrompt:
        'You are a research agent. Find accurate, up-to-date information. Provide concise summaries with sources. Compare options objectively.',
      maxConcurrent: 3,
      autoSpawnCli: false,
    },
  ],
  [
    'reviewer',
    {
      name: 'reviewer',
      displayName: '@reviewer',
      description: 'Thorough code review using Claude Sonnet. Catches bugs, suggests improvements, checks best practices and OWASP compliance.',
      capabilities: ['code-review', 'security-audit', 'best-practices', 'performance-analysis'],
      modelPreference: 'claude',
      costTier: 'medium',
      systemPrompt:
        'You are a senior code reviewer. Find bugs, security issues, and performance problems. Be specific: cite line numbers and suggest fixes. Check OWASP top 10.',
      maxConcurrent: 2,
      autoSpawnCli: false,
    },
  ],
  [
    'debug',
    {
      name: 'debug',
      displayName: '@debug',
      description: 'Local debugging agent using Ollama. Traces errors, analyzes logs, inspects stack traces, reproduces issues.',
      capabilities: ['debugging', 'log-analysis', 'error-tracing', 'stack-inspection'],
      modelPreference: 'ollama',
      costTier: 'free',
      systemPrompt:
        'You are a debugging specialist. Analyze error messages, stack traces, and logs methodically. Identify root causes. Suggest targeted fixes, not shotgun approaches.',
      maxConcurrent: 3,
      autoSpawnCli: true,
    },
  ],
  [
    'devops',
    {
      name: 'devops',
      displayName: '@devops',
      description: 'Infrastructure and CI/CD agent using Claude Haiku. Handles Docker, deployments, scripts, and system configuration.',
      capabilities: ['docker', 'ci-cd', 'scripting', 'system-config', 'monitoring'],
      modelPreference: 'claude',
      costTier: 'cheap',
      systemPrompt:
        'You are a DevOps engineer. Write reliable scripts, Docker configs, and CI pipelines. Prefer simplicity. Always consider security and reproducibility.',
      maxConcurrent: 2,
      autoSpawnCli: true,
    },
  ],
  [
    'security',
    {
      name: 'security',
      displayName: '@security',
      description: 'Security auditing agent using Claude Sonnet. Scans for vulnerabilities, checks dependencies, validates auth flows.',
      capabilities: ['vulnerability-scanning', 'dependency-audit', 'auth-review', 'penetration-testing'],
      modelPreference: 'claude',
      costTier: 'medium',
      systemPrompt:
        'You are a security auditor. Check for OWASP top 10 vulnerabilities, insecure dependencies, auth bypass, injection flaws, and data exposure. Be thorough and specific.',
      maxConcurrent: 1,
      autoSpawnCli: false,
    },
  ],
]);

// ---------------------------------------------------------------------------
// AgentFactory Class
// ---------------------------------------------------------------------------

export class AgentFactory {
  private spawnCount: number = 0;

  constructor() {
    logger.info(`AgentFactory initialized with ${TEMPLATES.size} templates`);
  }

  // -------------------------------------------------------------------------
  // Template Management
  // -------------------------------------------------------------------------

  /**
   * Get all available templates
   */
  getTemplates(): AgentTemplate[] {
    return Array.from(TEMPLATES.values());
  }

  /**
   * Get a specific template by name. Accepts with or without @ prefix.
   */
  getTemplate(name: string): AgentTemplate | null {
    const normalized = name.replace(/^@/, '') as TemplateName;
    return TEMPLATES.get(normalized) || null;
  }

  // -------------------------------------------------------------------------
  // Spawn
  // -------------------------------------------------------------------------

  /**
   * Spawn a new agent from a template.
   *
   * 1. Validates the template exists
   * 2. Checks concurrency limits
   * 3. Resolves the target machine
   * 4. Routes through CostRouter for model selection
   * 5. Creates the agent record in the database
   * 6. Returns the agent + routing info
   */
  spawn(templateName: string, options: SpawnOptions): SpawnResult {
    const template = this.getTemplate(templateName);
    if (!template) {
      const available = Array.from(TEMPLATES.keys()).map(k => `@${k}`).join(', ');
      throw new Error(`Unknown template "${templateName}". Available: ${available}`);
    }

    // Check concurrency
    const running = this.getRunningByTemplate(template.name);
    if (running.length >= template.maxConcurrent) {
      throw new Error(
        `Concurrency limit reached for @${template.name}: ${running.length}/${template.maxConcurrent} running. Stop one first.`
      );
    }

    // Resolve machine
    const machineId = options.machineId || this.resolveDefaultMachine();

    // Get cost routing decision
    const costRouter = getCostRouter();
    const routing = costRouter.route(template.costTier, template.modelPreference);

    // Build agent name
    const seq = this.spawnCount + 1;
    const agentName = `${template.displayName}-${seq}`;

    // Create in database
    const agent = createAgent({
      machine_id: machineId,
      name: agentName,
      type: template.name,
      metadata: {
        template: template.name,
        taskDescription: options.taskDescription,
        capabilities: template.capabilities,
        routing: {
          provider: routing.provider,
          model: routing.model,
          tier: routing.tier,
          estimatedCostPerRequest: routing.estimatedCostPerRequest,
        },
        systemPrompt: template.systemPrompt,
        ...options.metadata,
      },
    });

    // Set to working if autoStart
    if (options.autoStart !== false) {
      updateAgentStatus(agent.id, 'working', {
        current_task: options.taskDescription,
        progress: 0,
      });
    }

    this.spawnCount++;

    logger.info(
      `Spawned ${agentName} on ${machineId} → ${routing.provider}/${routing.model} (${routing.tier})`
    );

    return {
      agent: getAgentById(agent.id)!,
      template,
      costEstimate: routing.costLabel,
    };
  }

  // -------------------------------------------------------------------------
  // List
  // -------------------------------------------------------------------------

  /**
   * Get full factory status: templates, running agents, counts.
   */
  list(): FactoryStatus {
    const allAgents = getAllAgents();
    const running = allAgents.filter(a =>
      a.status === 'working' || a.status === 'waiting' || a.status === 'idle'
    );

    const byTemplate: Record<string, number> = {};
    for (const agent of running) {
      const tpl = agent.type || 'unknown';
      byTemplate[tpl] = (byTemplate[tpl] || 0) + 1;
    }

    return {
      templates: this.getTemplates(),
      running,
      totalSpawned: this.spawnCount,
      byTemplate,
    };
  }

  /**
   * Get running agents that were spawned from a specific template.
   */
  getRunningByTemplate(templateName: string): Agent[] {
    const normalized = templateName.replace(/^@/, '');
    return getAllAgents().filter(
      a =>
        a.type === normalized &&
        (a.status === 'working' || a.status === 'waiting' || a.status === 'idle')
    );
  }

  // -------------------------------------------------------------------------
  // Stop
  // -------------------------------------------------------------------------

  /**
   * Gracefully stop an agent.
   * Sets status to 'completed' and clears its task.
   */
  stop(agentId: string): Agent {
    const agent = getAgentById(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    updateAgentStatus(agent.id, 'completed', {
      current_task: null,
      progress: 100,
      last_output: `Stopped by AgentFactory at ${new Date().toISOString()}`,
    });

    logger.info(`Stopped agent ${agent.name} (${agent.id})`);
    return getAgentById(agent.id)!;
  }

  /**
   * Stop all agents of a given template.
   */
  stopAll(templateName?: string): number {
    let agents: Agent[];

    if (templateName) {
      agents = this.getRunningByTemplate(templateName);
    } else {
      agents = getAllAgents().filter(
        a => a.status === 'working' || a.status === 'waiting' || a.status === 'idle'
      );
    }

    for (const agent of agents) {
      this.stop(agent.id);
    }

    logger.info(`Stopped ${agents.length} agents${templateName ? ` (template: @${templateName})` : ''}`);
    return agents.length;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve the default machine ID. Uses the first online machine,
   * or falls back to 'local'.
   */
  private resolveDefaultMachine(): string {
    try {
      const machines = getAllMachines();
      const online = machines.find(m => m.status === 'online');
      if (online) return online.id;
      if (machines.length > 0) return machines[0].id;
    } catch {
      // DB not ready
    }
    return 'local';
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let factory: AgentFactory | null = null;

export function getAgentFactory(): AgentFactory {
  if (!factory) {
    factory = new AgentFactory();
  }
  return factory;
}
