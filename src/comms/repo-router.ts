/**
 * Repo Router - Registry and task routing for alive repos
 *
 * Each repo registers with PIA hub via its identity.
 * Tasks can be sent to any repo by name.
 * All jobs are tracked with full history.
 */

import { createLogger } from '../utils/logger.js';
import { getCrossMachineRelay } from './cross-machine.js';
import { getAgentBus } from './agent-bus.js';
import { nanoid } from 'nanoid';

const logger = createLogger('RepoRouter');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepoIdentity {
  name: string;
  displayName: string;
  description: string;
  capabilities: string[];
  techStack: string[];
  machineId: string;
  machineName: string;
  port: number;
  acceptsTasksFrom: string[];
  hubUrl?: string;
}

export interface RepoState {
  status: 'idle' | 'working' | 'error' | 'offline';
  currentTask: string | null;
  lastActivity: string;
  totalJobsCompleted: number;
  totalJobsFailed: number;
}

export interface RepoRecord {
  identity: RepoIdentity;
  state: RepoState;
  registeredAt: number;
  lastSeen: number;
}

export interface RepoJob {
  id: string;
  repoName: string;
  action: string;
  description: string;
  params?: Record<string, unknown>;
  requestedBy: string;          // who sent the task (repo name or "human")
  requestedAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  duration?: number;            // ms
}

// ---------------------------------------------------------------------------
// RepoRouter Class
// ---------------------------------------------------------------------------

export class RepoRouter {
  private repos: Map<string, RepoRecord> = new Map();
  private jobs: Map<string, RepoJob[]> = new Map();    // repoName -> jobs
  private allJobs: RepoJob[] = [];                       // global log
  private subscribers: Set<(event: string, data: unknown) => void> = new Set();

  constructor() {
    logger.info('RepoRouter initialized');
  }

  // -------------------------------------------------------------------------
  // Repo Registration
  // -------------------------------------------------------------------------

  registerRepo(identity: RepoIdentity, state?: Partial<RepoState>): RepoRecord {
    const now = Date.now();
    const existing = this.repos.get(identity.name);

    const record: RepoRecord = {
      identity,
      state: {
        status: state?.status || 'idle',
        currentTask: state?.currentTask || null,
        lastActivity: state?.lastActivity || new Date().toISOString(),
        totalJobsCompleted: existing?.state.totalJobsCompleted || state?.totalJobsCompleted || 0,
        totalJobsFailed: existing?.state.totalJobsFailed || state?.totalJobsFailed || 0,
      },
      registeredAt: existing?.registeredAt || now,
      lastSeen: now,
    };

    this.repos.set(identity.name, record);

    if (!this.jobs.has(identity.name)) {
      this.jobs.set(identity.name, []);
    }

    logger.info(`Repo registered: ${identity.displayName} (${identity.name}) on ${identity.machineName} [${identity.capabilities.join(', ')}]`);

    this.notify('repo:registered', { name: identity.name, displayName: identity.displayName });
    return record;
  }

  unregisterRepo(name: string): void {
    const repo = this.repos.get(name);
    if (repo) {
      repo.state.status = 'offline';
      logger.info(`Repo unregistered: ${name}`);
      this.notify('repo:offline', { name });
    }
  }

  updateRepoState(name: string, state: Partial<RepoState>): void {
    const repo = this.repos.get(name);
    if (repo) {
      Object.assign(repo.state, state);
      repo.lastSeen = Date.now();
      this.notify('repo:state', { name, state: repo.state });
    }
  }

  getRepo(name: string): RepoRecord | undefined {
    return this.repos.get(name);
  }

  getAllRepos(): RepoRecord[] {
    return Array.from(this.repos.values());
  }

  findRepoByCapability(capability: string): RepoRecord[] {
    return this.getAllRepos().filter(r =>
      r.identity.capabilities.includes(capability) && r.state.status !== 'offline'
    );
  }

  // -------------------------------------------------------------------------
  // Task Routing
  // -------------------------------------------------------------------------

  /**
   * Send a task to a repo. Routes through the cross-machine relay.
   */
  sendTask(
    toRepo: string,
    action: string,
    description: string,
    requestedBy: string = 'human',
    params?: Record<string, unknown>,
  ): RepoJob {
    const repo = this.repos.get(toRepo);
    if (!repo) {
      throw new Error(`Repo "${toRepo}" not found. Available: ${Array.from(this.repos.keys()).join(', ')}`);
    }

    // Check if the repo accepts tasks from the requester
    if (!repo.identity.acceptsTasksFrom.includes('*') &&
        !repo.identity.acceptsTasksFrom.includes(requestedBy)) {
      throw new Error(`Repo "${toRepo}" does not accept tasks from "${requestedBy}"`);
    }

    const job: RepoJob = {
      id: nanoid(),
      repoName: toRepo,
      action,
      description,
      params,
      requestedBy,
      requestedAt: Date.now(),
      status: 'queued',
    };

    // Store the job
    this.allJobs.push(job);
    if (this.allJobs.length > 10000) {
      this.allJobs.splice(0, this.allJobs.length - 10000);
    }

    const repoJobs = this.jobs.get(toRepo) || [];
    repoJobs.push(job);
    if (repoJobs.length > 2000) {
      repoJobs.splice(0, repoJobs.length - 2000);
    }
    this.jobs.set(toRepo, repoJobs);

    // Route the task via cross-machine relay
    try {
      const relay = getCrossMachineRelay();
      relay.send(
        repo.identity.machineId,
        JSON.stringify({
          type: 'repo:task',
          job,
          targetRepo: toRepo,
        }),
        'task',
        'websocket',
        { repoName: toRepo, action, jobId: job.id },
      );
    } catch (err) {
      logger.warn(`Could not route task via relay (repo may be local): ${err}`);
    }

    // Also notify via agent bus
    const bus = getAgentBus();
    bus.send(
      `repo:${requestedBy}`,
      `repo:${toRepo}`,
      JSON.stringify({ action, description, params, jobId: job.id }),
      'command',
      { repoTask: true },
    );

    logger.info(`Task sent to ${toRepo}: ${action} - ${description} (job ${job.id})`);
    this.notify('job:queued', job);

    return job;
  }

  /**
   * Update a job's status (called when repo reports back).
   */
  updateJob(
    jobId: string,
    update: {
      status?: RepoJob['status'];
      result?: string;
      error?: string;
      startedAt?: number;
      completedAt?: number;
    },
  ): RepoJob | null {
    const job = this.allJobs.find(j => j.id === jobId);
    if (!job) return null;

    if (update.status) job.status = update.status;
    if (update.result) job.result = update.result;
    if (update.error) job.error = update.error;
    if (update.startedAt) job.startedAt = update.startedAt;
    if (update.completedAt) {
      job.completedAt = update.completedAt;
      job.duration = job.completedAt - (job.startedAt || job.requestedAt);
    }

    // Update repo counters
    const repo = this.repos.get(job.repoName);
    if (repo && (job.status === 'completed' || job.status === 'failed')) {
      if (job.status === 'completed') repo.state.totalJobsCompleted++;
      if (job.status === 'failed') repo.state.totalJobsFailed++;
      repo.state.currentTask = null;
      repo.state.status = 'idle';
      repo.state.lastActivity = new Date().toISOString();
    }

    if (repo && job.status === 'running') {
      repo.state.currentTask = `${job.action}: ${job.description}`;
      repo.state.status = 'working';
    }

    logger.info(`Job ${jobId} updated: ${job.status}${job.result ? ` - ${job.result.substring(0, 100)}` : ''}`);
    this.notify(`job:${job.status}`, job);

    return job;
  }

  // -------------------------------------------------------------------------
  // Job History
  // -------------------------------------------------------------------------

  getJobsForRepo(repoName: string, opts?: { status?: string; limit?: number }): RepoJob[] {
    let jobs = this.jobs.get(repoName) || [];
    if (opts?.status) {
      jobs = jobs.filter(j => j.status === opts.status);
    }
    jobs = [...jobs].sort((a, b) => b.requestedAt - a.requestedAt);
    if (opts?.limit) {
      jobs = jobs.slice(0, opts.limit);
    }
    return jobs;
  }

  getAllJobs(opts?: { status?: string; limit?: number }): RepoJob[] {
    let jobs = [...this.allJobs];
    if (opts?.status) {
      jobs = jobs.filter(j => j.status === opts.status);
    }
    jobs.sort((a, b) => b.requestedAt - a.requestedAt);
    if (opts?.limit) {
      jobs = jobs.slice(0, opts.limit);
    }
    return jobs;
  }

  getJob(jobId: string): RepoJob | undefined {
    return this.allJobs.find(j => j.id === jobId);
  }

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  getStats(): {
    totalRepos: number;
    reposByStatus: Record<string, number>;
    totalJobs: number;
    jobsByStatus: Record<string, number>;
    repos: Array<{
      name: string;
      displayName: string;
      machine: string;
      status: string;
      capabilities: string[];
      jobsCompleted: number;
      jobsFailed: number;
      lastSeen: number;
    }>;
  } {
    const reposByStatus: Record<string, number> = {};
    const jobsByStatus: Record<string, number> = {};

    for (const repo of this.repos.values()) {
      reposByStatus[repo.state.status] = (reposByStatus[repo.state.status] || 0) + 1;
    }
    for (const job of this.allJobs) {
      jobsByStatus[job.status] = (jobsByStatus[job.status] || 0) + 1;
    }

    return {
      totalRepos: this.repos.size,
      reposByStatus,
      totalJobs: this.allJobs.length,
      jobsByStatus,
      repos: this.getAllRepos().map(r => ({
        name: r.identity.name,
        displayName: r.identity.displayName,
        machine: r.identity.machineName,
        status: r.state.status,
        capabilities: r.identity.capabilities,
        jobsCompleted: r.state.totalJobsCompleted,
        jobsFailed: r.state.totalJobsFailed,
        lastSeen: r.lastSeen,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  subscribe(callback: (event: string, data: unknown) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify(event: string, data: unknown): void {
    for (const cb of this.subscribers) {
      try { cb(event, data); } catch { /* subscriber error */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let router: RepoRouter | null = null;

export function getRepoRouter(): RepoRouter {
  if (!router) {
    router = new RepoRouter();
  }
  return router;
}
