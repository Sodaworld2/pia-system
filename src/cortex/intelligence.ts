/**
 * Cortex Intelligence Engine
 *
 * Rule-based observation and suggestion engine (Phase 1 — no LLM).
 * Analyzes fleet telemetry and produces actionable insights:
 *
 * - Observations: "Machine X has high CPU", "Agent stuck for 10 min"
 * - Suggestions: "Restart stuck agent", "Balance workload across machines"
 * - Warnings: "Machine offline", "Error spike detected"
 * - Critical: "All machines down", "Budget exceeded"
 */

import { createLogger } from '../utils/logger.js';
import { getCortexDatabase } from './cortex-db.js';
import { getCortexCollector, type FleetOverview } from './data-collector.js';
import { getDoctor } from '../agents/doctor.js';

const logger = createLogger('CortexIntel');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Insight {
  type: 'observation' | 'suggestion' | 'warning' | 'critical';
  category: string;
  title: string;
  description: string;
  machine_id?: string;
  machine_name?: string;
  severity: number; // 1-10
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Intelligence Engine
// ---------------------------------------------------------------------------

export class CortexIntelligence {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastInsights: Insight[] = [];

  start(intervalMs = 120000): void {
    if (this.running) {
      logger.warn('CortexIntelligence already running');
      return;
    }

    this.running = true;

    // Analyze after a short delay (let collector gather first)
    setTimeout(() => {
      try { this.analyze(); } catch (err) { logger.error(`First analysis failed: ${err}`); }
    }, 5000);

    this.intervalId = setInterval(() => {
      try { this.analyze(); } catch (err) { logger.error(`Analysis error: ${err}`); }
    }, intervalMs);

    logger.info(`CortexIntelligence started (interval: ${intervalMs}ms)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    logger.info('CortexIntelligence stopped');
  }

  /**
   * Run a full analysis cycle. Returns new insights.
   */
  analyze(): Insight[] {
    const overview = getCortexCollector().getLatestOverview();
    if (!overview) {
      return [];
    }

    const insights: Insight[] = [];

    // Run all rule checks
    insights.push(...this.checkMachineHealth(overview));
    insights.push(...this.checkAgentHealth(overview));
    insights.push(...this.checkResourcePressure(overview));
    insights.push(...this.checkWorkloadBalance(overview));
    insights.push(...this.checkFleetSync(overview));

    // Store new insights in Cortex DB (deduplicate by title within last 10 min)
    this.storeInsights(insights);

    this.lastInsights = insights;

    if (insights.length > 0) {
      const criticals = insights.filter(i => i.type === 'critical').length;
      const warnings = insights.filter(i => i.type === 'warning').length;
      logger.info(`Analysis complete: ${insights.length} insights (${criticals} critical, ${warnings} warnings)`);
    }

    return insights;
  }

  /**
   * Get the latest insights from last analysis.
   */
  getLatestInsights(): Insight[] {
    return this.lastInsights;
  }

  /**
   * Get stored insights from database.
   */
  getStoredInsights(limit = 50, unacknowledgedOnly = false): Array<Record<string, unknown>> {
    const db = getCortexDatabase();
    if (unacknowledgedOnly) {
      return db.prepare(
        'SELECT * FROM fleet_insights WHERE acknowledged = 0 ORDER BY severity DESC, created_at DESC LIMIT ?'
      ).all(limit) as Array<Record<string, unknown>>;
    }
    return db.prepare(
      'SELECT * FROM fleet_insights ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as Array<Record<string, unknown>>;
  }

  /**
   * Acknowledge an insight.
   */
  acknowledgeInsight(insightId: number): void {
    const db = getCortexDatabase();
    db.prepare('UPDATE fleet_insights SET acknowledged = 1 WHERE id = ?').run(insightId);
  }

  /**
   * Acknowledge all insights.
   */
  acknowledgeAll(): void {
    const db = getCortexDatabase();
    db.prepare('UPDATE fleet_insights SET acknowledged = 1 WHERE acknowledged = 0').run();
  }

  isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Rule Checks
  // -------------------------------------------------------------------------

  private checkMachineHealth(overview: FleetOverview): Insight[] {
    const insights: Insight[] = [];

    // All machines offline
    if (overview.totals.machinesTotal > 0 && overview.totals.machinesOnline === 0) {
      insights.push({
        type: 'critical',
        category: 'fleet',
        title: 'All machines offline',
        description: `None of the ${overview.totals.machinesTotal} registered machines are responding.`,
        severity: 10,
        data: { total: overview.totals.machinesTotal },
      });
    }

    // Individual machines offline
    for (const machine of overview.machines) {
      if (machine.status === 'offline' || machine.status === 'error') {
        insights.push({
          type: 'warning',
          category: 'machine_health',
          title: `${machine.name} is ${machine.status}`,
          description: `Machine ${machine.name} (${machine.hostname}) is ${machine.status}. Last seen: ${machine.last_seen ? new Date(machine.last_seen * 1000).toLocaleTimeString() : 'never'}.`,
          machine_id: machine.id,
          machine_name: machine.name,
          severity: 7,
          data: { status: machine.status, last_seen: machine.last_seen },
        });
      }
    }

    return insights;
  }

  private checkAgentHealth(overview: FleetOverview): Insight[] {
    const insights: Insight[] = [];

    // Agents in error state
    if (overview.totals.agentsError > 0) {
      insights.push({
        type: 'warning',
        category: 'agent_health',
        title: `${overview.totals.agentsError} agent(s) in error state`,
        description: `${overview.totals.agentsError} out of ${overview.totals.agentsTotal} agents have errors. Check the Doctor for auto-heal actions.`,
        severity: 6,
        data: { errorCount: overview.totals.agentsError, total: overview.totals.agentsTotal },
      });
    }

    // Doctor health report
    try {
      const doctor = getDoctor();
      const report = doctor.getHealthReport();
      if (report && report.agents.stuck > 0) {
        insights.push({
          type: 'warning',
          category: 'agent_health',
          title: `${report.agents.stuck} stuck agent(s) detected`,
          description: `The Doctor found ${report.agents.stuck} agents stuck for over 5 minutes. Auto-healing is ${doctor.isRunning() ? 'active' : 'disabled'}.`,
          severity: 7,
          data: { stuck: report.agents.stuck, autoHeal: doctor.isRunning() },
        });
      }
    } catch {
      // Doctor not initialized
    }

    return insights;
  }

  private checkResourcePressure(overview: FleetOverview): Insight[] {
    const insights: Insight[] = [];

    for (const machine of overview.machines) {
      if (machine.status !== 'online') continue;

      // High CPU
      if (machine.cpu_usage > 90) {
        insights.push({
          type: 'warning',
          category: 'resources',
          title: `${machine.name}: CPU critical (${Math.round(machine.cpu_usage)}%)`,
          description: `CPU usage on ${machine.name} is at ${Math.round(machine.cpu_usage)}%. Consider moving workload to another machine.`,
          machine_id: machine.id,
          machine_name: machine.name,
          severity: 8,
          data: { cpu: machine.cpu_usage },
        });
      } else if (machine.cpu_usage > 75) {
        insights.push({
          type: 'observation',
          category: 'resources',
          title: `${machine.name}: CPU high (${Math.round(machine.cpu_usage)}%)`,
          description: `CPU usage on ${machine.name} is elevated at ${Math.round(machine.cpu_usage)}%.`,
          machine_id: machine.id,
          machine_name: machine.name,
          severity: 4,
          data: { cpu: machine.cpu_usage },
        });
      }

      // High memory
      if (machine.memory_used_percent > 90) {
        insights.push({
          type: 'warning',
          category: 'resources',
          title: `${machine.name}: Memory critical (${machine.memory_used_percent}%)`,
          description: `Memory usage on ${machine.name} is at ${machine.memory_used_percent}%. Risk of OOM if it continues.`,
          machine_id: machine.id,
          machine_name: machine.name,
          severity: 8,
          data: { memory: machine.memory_used_percent },
        });
      } else if (machine.memory_used_percent > 80) {
        insights.push({
          type: 'observation',
          category: 'resources',
          title: `${machine.name}: Memory high (${machine.memory_used_percent}%)`,
          description: `Memory usage on ${machine.name} is elevated at ${machine.memory_used_percent}%.`,
          machine_id: machine.id,
          machine_name: machine.name,
          severity: 4,
          data: { memory: machine.memory_used_percent },
        });
      }
    }

    return insights;
  }

  private checkWorkloadBalance(overview: FleetOverview): Insight[] {
    const insights: Insight[] = [];
    const onlineMachines = overview.machines.filter(m => m.status === 'online');

    if (onlineMachines.length < 2) return insights;

    // Find busiest and idlest
    const sorted = [...onlineMachines].sort((a, b) => b.agents_working - a.agents_working);
    const busiest = sorted[0];
    const idlest = sorted[sorted.length - 1];

    // Significant imbalance: busiest has 3+ more working agents than idlest
    if (busiest.agents_working - idlest.agents_working >= 3) {
      insights.push({
        type: 'suggestion',
        category: 'workload',
        title: `Workload imbalance: ${busiest.name} vs ${idlest.name}`,
        description: `${busiest.name} has ${busiest.agents_working} working agents while ${idlest.name} has ${idlest.agents_working}. Consider moving tasks to ${idlest.name} for better balance.`,
        severity: 5,
        data: {
          busiest: { name: busiest.name, working: busiest.agents_working },
          idlest: { name: idlest.name, working: idlest.agents_working },
        },
      });
    }

    // Idle machines with capacity
    for (const machine of onlineMachines) {
      if (machine.agent_count === 0 && overview.totals.agentsWorking > 0) {
        insights.push({
          type: 'observation',
          category: 'workload',
          title: `${machine.name} is idle with capacity`,
          description: `${machine.name} has no agents running while other machines are busy. Available for task delegation.`,
          machine_id: machine.id,
          machine_name: machine.name,
          severity: 3,
          data: { agentCount: 0 },
        });
      }
    }

    return insights;
  }

  private checkFleetSync(overview: FleetOverview): Insight[] {
    const insights: Insight[] = [];

    // Fleet health score alerts
    if (overview.healthScore < 30) {
      insights.push({
        type: 'critical',
        category: 'fleet',
        title: `Fleet health critical: ${overview.healthScore}/100`,
        description: `The overall fleet health score is ${overview.healthScore}/100. Multiple systems need attention.`,
        severity: 9,
        data: { healthScore: overview.healthScore },
      });
    } else if (overview.healthScore < 60) {
      insights.push({
        type: 'warning',
        category: 'fleet',
        title: `Fleet health degraded: ${overview.healthScore}/100`,
        description: `The fleet health score has dropped to ${overview.healthScore}/100.`,
        severity: 6,
        data: { healthScore: overview.healthScore },
      });
    }

    return insights;
  }

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------

  private storeInsights(insights: Insight[]): void {
    if (insights.length === 0) return;

    const db = getCortexDatabase();
    const tenMinAgo = Math.floor(Date.now() / 1000) - 600;

    const insertStmt = db.prepare(`
      INSERT INTO fleet_insights (type, category, title, description, machine_id, machine_name, severity, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const checkDuplicate = db.prepare(
      'SELECT id FROM fleet_insights WHERE title = ? AND created_at > ? LIMIT 1'
    );

    for (const insight of insights) {
      // Skip if same title was recorded in the last 10 minutes
      const existing = checkDuplicate.get(insight.title, tenMinAgo);
      if (existing) continue;

      insertStmt.run(
        insight.type,
        insight.category,
        insight.title,
        insight.description,
        insight.machine_id || null,
        insight.machine_name || null,
        insight.severity,
        JSON.stringify(insight.data),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let intelligence: CortexIntelligence | null = null;

export function getCortexIntelligence(): CortexIntelligence {
  if (!intelligence) {
    intelligence = new CortexIntelligence();
  }
  return intelligence;
}
