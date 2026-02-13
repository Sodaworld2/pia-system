/**
 * Daily Review AI — Fisher2050's brain for daily operations
 *
 * Processes project data and generates actionable insights:
 * - Overdue task identification
 * - Risk assessment
 * - Team nudges
 * - Status summaries
 */

import { getDb } from '../db.js';
import { getPiaClient } from '../integrations/pia.js';

export interface DailyReviewResult {
  overdueTasks: any[];
  riskyProjects: any[];
  completedToday: any[];
  recommendations: string[];
  healthScore: number;
}

export async function runDailyReview(): Promise<DailyReviewResult> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;

  // Get overdue tasks
  const overdueTasks = db.prepare(`
    SELECT t.*, p.name as project_name FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.status IN ('pending', 'in_progress') AND t.due_date < ?
    ORDER BY t.due_date ASC
  `).all(now) as any[];

  // Get tasks completed today
  const completedToday = db.prepare(`
    SELECT t.*, p.name as project_name FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'completed' AND t.completed_at > ?
    ORDER BY t.completed_at DESC
  `).all(dayAgo) as any[];

  // Identify risky projects (many overdue tasks, no recent activity)
  const projects = db.prepare("SELECT * FROM projects WHERE status = 'active'").all() as any[];
  const riskyProjects: any[] = [];

  for (const project of projects) {
    const overdueCount = (db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND status IN ('pending','in_progress') AND due_date < ?"
    ).get(project.id, now) as any).c;

    const recentActivity = (db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND updated_at > ?"
    ).get(project.id, dayAgo) as any).c;

    if (overdueCount > 2 || (overdueCount > 0 && recentActivity === 0)) {
      riskyProjects.push({
        ...project,
        overdueCount,
        recentActivity,
        risk: overdueCount > 3 ? 'high' : 'medium',
      });
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (overdueTasks.length > 0) {
    recommendations.push(`${overdueTasks.length} overdue task(s) need attention.`);
    const unassigned = overdueTasks.filter(t => !t.assigned_to);
    if (unassigned.length > 0) {
      recommendations.push(`${unassigned.length} overdue task(s) are unassigned — assign them ASAP.`);
    }
  }

  if (riskyProjects.length > 0) {
    recommendations.push(`${riskyProjects.length} project(s) flagged as at risk.`);
  }

  if (completedToday.length === 0) {
    recommendations.push('No tasks completed in the last 24 hours. Check if anything is blocked.');
  } else {
    recommendations.push(`${completedToday.length} task(s) completed today. Good progress!`);
  }

  // Calculate health score
  const totalActive = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending','in_progress')").get() as any).c;
  const overdueRatio = totalActive > 0 ? overdueTasks.length / totalActive : 0;
  const healthScore = Math.max(0, Math.min(100, Math.round(100 - overdueRatio * 100 - riskyProjects.length * 10)));

  return {
    overdueTasks,
    riskyProjects,
    completedToday,
    recommendations,
    healthScore,
  };
}

/** Trigger a Ziggi review for a project after a work session */
export async function triggerPostSessionReview(projectDir: string): Promise<string | null> {
  try {
    const pia = getPiaClient();
    const result = await pia.triggerZiggiReview(projectDir);
    return result.taskId;
  } catch (error) {
    console.error('[DailyReview] Failed to trigger post-session review:', error);
    return null;
  }
}
