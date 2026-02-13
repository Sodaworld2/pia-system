/**
 * PIA API Client — Fisher2050 talks to PIA via REST
 */

import { config } from '../config.js';

interface PiaHealth {
  status: string;
  mode: string;
  timestamp: string;
}

interface RunTaskOptions {
  task: string;
  soulId?: string;
  model?: string;
  maxBudgetUsd?: number;
  maxTurns?: number;
  projectDir?: string;
}

interface RunTaskResult {
  taskId: string;
  status: string;
  message: string;
}

interface TaskStatus {
  status: 'running' | 'completed';
  taskId?: string;
  result?: {
    taskId: string;
    success: boolean;
    summary: string;
    toolCalls: number;
    totalTokens: number;
    costUsd: number;
    durationMs: number;
  };
}

interface Soul {
  id: string;
  name: string;
  role: string;
  personality: string;
  goals: string[];
  relationships: Record<string, string>;
  email: string | null;
  status: string;
}

export class PiaClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = baseUrl || config.pia.url;
    this.token = token || config.pia.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Token': this.token,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PIA API error (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /** Health check */
  async health(): Promise<PiaHealth> {
    // Health check doesn't need auth
    const response = await fetch(`${this.baseUrl}/api/health`);
    return response.json() as Promise<PiaHealth>;
  }

  /** Get system stats */
  async stats(): Promise<Record<string, unknown>> {
    return this.request('/api/stats');
  }

  // -- Autonomous Worker --

  /** Run an autonomous task on PIA (async — returns taskId) */
  async runTask(options: RunTaskOptions): Promise<RunTaskResult> {
    return this.request('/api/orchestrator/run', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /** Run an autonomous task and wait for result */
  async runTaskSync(options: RunTaskOptions): Promise<TaskStatus['result']> {
    return this.request('/api/orchestrator/run-sync', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /** Check task status */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    return this.request(`/api/orchestrator/task/${taskId}`);
  }

  /** Cancel a running task */
  async cancelTask(taskId: string): Promise<{ success: boolean }> {
    return this.request(`/api/orchestrator/cancel/${taskId}`, { method: 'POST' });
  }

  /** Get active tasks */
  async getActiveTasks(): Promise<{ activeTasks: string[] }> {
    return this.request('/api/orchestrator/active');
  }

  // -- Souls --

  /** List all souls */
  async listSouls(): Promise<Soul[]> {
    return this.request('/api/souls');
  }

  /** Get a soul by ID */
  async getSoul(id: string): Promise<Soul> {
    return this.request(`/api/souls/${id}`);
  }

  /** Generate a soul's system prompt */
  async getSoulPrompt(id: string, context?: string): Promise<{ prompt: string }> {
    const params = context ? `?context=${encodeURIComponent(context)}` : '';
    return this.request(`/api/souls/${id}/prompt${params}`);
  }

  /** Add a memory to a soul */
  async addSoulMemory(soulId: string, category: string, content: string, importance?: number): Promise<unknown> {
    return this.request(`/api/souls/${soulId}/memories`, {
      method: 'POST',
      body: JSON.stringify({ category, content, importance }),
    });
  }

  /** Log an interaction between souls */
  async logInteraction(fromSoulId: string, toSoulId: string, type: string, content: string): Promise<unknown> {
    return this.request('/api/souls/interact', {
      method: 'POST',
      body: JSON.stringify({
        from_soul_id: fromSoulId,
        to_soul_id: toSoulId,
        interaction_type: type,
        content,
      }),
    });
  }

  // -- Agent Bus --

  /** Send a message via agent bus */
  async sendMessage(from: string, to: string, content: string, metadata?: Record<string, unknown>): Promise<unknown> {
    return this.request('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ from, to, content, metadata }),
    });
  }

  // -- Task Queue --

  /** Enqueue a task in PIA's task queue */
  async enqueueTask(title: string, description: string, priority = 3): Promise<unknown> {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, description, priority }),
    });
  }

  // -- Trigger Agent Tasks (Fisher2050's key function) --

  /** Trigger Ziggi to do a post-session review */
  async triggerZiggiReview(projectDir: string, description?: string): Promise<RunTaskResult> {
    return this.runTask({
      task: description || `Post-session code review for project at ${projectDir}. Review recent git changes, update documentation, assess code quality.`,
      soulId: 'ziggi',
      projectDir,
      model: 'claude-sonnet-4-5-20250929',
      maxBudgetUsd: 1.0,
    });
  }

  /** Trigger Eliyahu for knowledge processing */
  async triggerEliyahuAnalysis(description: string): Promise<RunTaskResult> {
    return this.runTask({
      task: description,
      soulId: 'eliyahu',
      model: 'claude-sonnet-4-5-20250929',
      maxBudgetUsd: 0.5,
    });
  }

  /** Run a task as Fisher2050 */
  async runAsFisher(task: string, projectDir?: string): Promise<RunTaskResult> {
    return this.runTask({
      task,
      soulId: 'fisher2050',
      projectDir,
      model: 'claude-sonnet-4-5-20250929',
      maxBudgetUsd: 0.5,
    });
  }
}

// Singleton
let instance: PiaClient | null = null;

export function getPiaClient(): PiaClient {
  if (!instance) {
    instance = new PiaClient();
  }
  return instance;
}
