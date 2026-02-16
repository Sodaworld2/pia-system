/**
 * Cortex REST API — Fleet Intelligence Brain
 *
 * Universal JSON API that powers every viewing surface:
 * browser dashboard, Vision Pro, tablet, WhatsApp, CLI.
 *
 * Endpoints:
 *   GET /api/cortex/overview       — fleet-wide summary
 *   GET /api/cortex/machine/:id    — deep dive on one machine
 *   GET /api/cortex/timeline       — activity over time
 *   GET /api/cortex/alerts         — active alerts/suggestions
 *   GET /api/cortex/insights       — AI-generated observations
 *   GET /api/cortex/health         — system-wide health score
 *   GET /api/cortex/workload       — load distribution
 *   POST /api/cortex/insights/:id/acknowledge — acknowledge an insight
 *   POST /api/cortex/insights/acknowledge-all — acknowledge all
 *   GET /api/cortex/status         — Cortex system status
 */

import { Router, Request, Response } from 'express';
import { getCortexCollector } from '../../cortex/data-collector.js';
import { getCortexIntelligence } from '../../cortex/intelligence.js';

const router = Router();

// -------------------------------------------------------------------------
// GET /api/cortex/overview — Fleet-wide summary
// -------------------------------------------------------------------------
router.get('/overview', (_req: Request, res: Response) => {
  try {
    const collector = getCortexCollector();
    const intelligence = getCortexIntelligence();

    const overview = collector.getLatestOverview();
    if (!overview) {
      res.json({
        status: 'initializing',
        message: 'Cortex is still gathering initial data. Try again in a few seconds.',
      });
      return;
    }

    const insights = intelligence.getLatestInsights();
    const criticalCount = insights.filter(i => i.type === 'critical').length;
    const warningCount = insights.filter(i => i.type === 'warning').length;

    res.json({
      ...overview,
      insights: {
        total: insights.length,
        critical: criticalCount,
        warnings: warningCount,
        latest: insights.slice(0, 5),
      },
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to get overview: ${error}` });
  }
});

// -------------------------------------------------------------------------
// GET /api/cortex/machine/:id — Deep dive on one machine
// -------------------------------------------------------------------------
router.get('/machine/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const hours = parseInt(req.query.hours as string) || 24;
    const collector = getCortexCollector();
    const intelligence = getCortexIntelligence();

    // Current overview
    const overview = collector.getLatestOverview();
    const machine = overview?.machines.find(m => m.id === id);

    if (!machine) {
      res.status(404).json({ error: `Machine ${id} not found` });
      return;
    }

    // Historical data
    const history = collector.getMachineHistory(id, hours);

    // Machine-specific insights
    const allInsights = intelligence.getLatestInsights();
    const machineInsights = allInsights.filter(i => i.machine_id === id);

    // Build CPU/memory charts from history
    const cpuHistory = history.map(s => ({ t: s.collected_at, v: s.cpu_usage }));
    const memHistory = history.map(s => ({ t: s.collected_at, v: s.memory_used_percent }));
    const agentHistory = history.map(s => ({ t: s.collected_at, v: s.agent_count }));

    res.json({
      machine,
      history: {
        snapshots: history.length,
        hours,
        cpu: cpuHistory,
        memory: memHistory,
        agents: agentHistory,
      },
      insights: machineInsights,
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to get machine data: ${error}` });
  }
});

// -------------------------------------------------------------------------
// GET /api/cortex/timeline — Activity over time
// -------------------------------------------------------------------------
router.get('/timeline', (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const limit = parseInt(req.query.limit as string) || 100;
    const since = req.query.since ? parseInt(req.query.since as string) : undefined;
    const collector = getCortexCollector();

    const events = collector.getTimelineEvents(limit, since);

    // Also get recent telemetry trend
    const snapshots = collector.getFleetTimeline(hours, 200);

    // Group snapshots by machine for charting
    const byMachine: Record<string, Array<{ t: number; cpu: number; mem: number; agents: number }>> = {};
    for (const s of snapshots) {
      if (!byMachine[s.machine_id]) byMachine[s.machine_id] = [];
      byMachine[s.machine_id].push({
        t: s.collected_at || 0,
        cpu: s.cpu_usage,
        mem: s.memory_used_percent,
        agents: s.agent_count,
      });
    }

    res.json({
      events,
      trends: byMachine,
      hours,
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to get timeline: ${error}` });
  }
});

// -------------------------------------------------------------------------
// GET /api/cortex/alerts — Active alerts & suggestions
// -------------------------------------------------------------------------
router.get('/alerts', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const unacknowledgedOnly = req.query.unacknowledged === 'true';
    const intelligence = getCortexIntelligence();

    const insights = intelligence.getStoredInsights(limit, unacknowledgedOnly);

    // Parse JSON data field
    const parsed = insights.map(i => ({
      ...i,
      data: typeof i.data === 'string' ? JSON.parse(i.data as string) : i.data,
    }));

    res.json({
      alerts: parsed,
      count: parsed.length,
      unacknowledgedOnly,
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to get alerts: ${error}` });
  }
});

// -------------------------------------------------------------------------
// GET /api/cortex/insights — AI-generated observations
// -------------------------------------------------------------------------
router.get('/insights', (req: Request, res: Response) => {
  try {
    const intelligence = getCortexIntelligence();

    // Fresh analysis
    const live = intelligence.getLatestInsights();

    // Stored insights (historical)
    const limit = parseInt(req.query.limit as string) || 30;
    const stored = intelligence.getStoredInsights(limit);

    res.json({
      live,
      stored: stored.map(i => ({
        ...i,
        data: typeof i.data === 'string' ? JSON.parse(i.data as string) : i.data,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to get insights: ${error}` });
  }
});

// -------------------------------------------------------------------------
// GET /api/cortex/health — System-wide health score
// -------------------------------------------------------------------------
router.get('/health', (_req: Request, res: Response) => {
  try {
    const collector = getCortexCollector();
    const intelligence = getCortexIntelligence();
    const overview = collector.getLatestOverview();

    if (!overview) {
      res.json({ status: 'initializing', healthScore: null });
      return;
    }

    const insights = intelligence.getLatestInsights();
    const criticals = insights.filter(i => i.type === 'critical');
    const warnings = insights.filter(i => i.type === 'warning');

    res.json({
      healthScore: overview.healthScore,
      status: overview.healthScore >= 80 ? 'healthy' :
              overview.healthScore >= 50 ? 'degraded' : 'critical',
      machines: {
        online: overview.totals.machinesOnline,
        offline: overview.totals.machinesOffline,
        total: overview.totals.machinesTotal,
      },
      agents: {
        total: overview.totals.agentsTotal,
        working: overview.totals.agentsWorking,
        error: overview.totals.agentsError,
      },
      resources: {
        avgCpu: overview.totals.avgCpuUsage,
        avgMemory: overview.totals.avgMemoryPercent,
      },
      issues: {
        critical: criticals.length,
        warnings: warnings.length,
        criticalDetails: criticals.map(c => c.title),
        warningDetails: warnings.map(w => w.title),
      },
      collectedAt: overview.collectedAt,
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to get health: ${error}` });
  }
});

// -------------------------------------------------------------------------
// GET /api/cortex/workload — Load distribution across fleet
// -------------------------------------------------------------------------
router.get('/workload', (_req: Request, res: Response) => {
  try {
    const collector = getCortexCollector();
    const overview = collector.getLatestOverview();

    if (!overview) {
      res.json({ status: 'initializing' });
      return;
    }

    const machines = overview.machines
      .filter(m => m.status === 'online')
      .map(m => ({
        id: m.id,
        name: m.name,
        agents_total: m.agent_count,
        agents_working: m.agents_working,
        cpu_usage: m.cpu_usage,
        memory_percent: m.memory_used_percent,
        load_score: Math.round((m.agents_working * 30) + (m.cpu_usage * 0.4) + (m.memory_used_percent * 0.3)),
      }))
      .sort((a, b) => b.load_score - a.load_score);

    res.json({
      machines,
      totalAgentsWorking: overview.totals.agentsWorking,
      totalAgentsIdle: overview.totals.agentsIdle,
      balanced: machines.length < 2 || (
        Math.max(...machines.map(m => m.load_score)) -
        Math.min(...machines.map(m => m.load_score))
      ) < 30,
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to get workload: ${error}` });
  }
});

// -------------------------------------------------------------------------
// POST /api/cortex/insights/:id/acknowledge — Acknowledge an insight
// -------------------------------------------------------------------------
router.post('/insights/:id/acknowledge', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    getCortexIntelligence().acknowledgeInsight(id);
    res.json({ ok: true, id });
  } catch (error) {
    res.status(500).json({ error: `Failed to acknowledge: ${error}` });
  }
});

// -------------------------------------------------------------------------
// POST /api/cortex/insights/acknowledge-all — Acknowledge all insights
// -------------------------------------------------------------------------
router.post('/insights/acknowledge-all', (_req: Request, res: Response) => {
  try {
    getCortexIntelligence().acknowledgeAll();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: `Failed to acknowledge all: ${error}` });
  }
});

// -------------------------------------------------------------------------
// GET /api/cortex/status — Cortex system status
// -------------------------------------------------------------------------
router.get('/status', (_req: Request, res: Response) => {
  try {
    const collector = getCortexCollector();
    const intelligence = getCortexIntelligence();

    res.json({
      collector: {
        running: collector.isRunning(),
        collections: collector.getCollectionCount(),
      },
      intelligence: {
        running: intelligence.isRunning(),
      },
      database: {
        initialized: true,
      },
    });
  } catch (error) {
    res.json({
      collector: { running: false },
      intelligence: { running: false },
      database: { initialized: false },
      error: String(error),
    });
  }
});

export default router;
