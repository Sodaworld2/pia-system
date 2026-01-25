/**
 * PIA Local Service
 * Runs on each machine to manage local agents and report to Hub
 */

import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { initHubClient, getHubClient } from './hub-client.js';
import { ptyManager, PTYWrapper } from '../tunnel/pty-wrapper.js';
import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';

const logger = createLogger('LocalService');

interface LocalAgent {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'working' | 'waiting' | 'error' | 'completed';
  progress: number;
  currentTask?: string;
  lastOutput?: string;
  sessionId?: string;
  pty?: PTYWrapper;
}

export class PIALocalService extends EventEmitter {
  private agents: Map<string, LocalAgent> = new Map();
  private running: boolean = false;

  async start(): Promise<void> {
    logger.info('='.repeat(50));
    logger.info('  PIA Local Service');
    logger.info('='.repeat(50));
    logger.info(`Machine: ${config.hub.machineName}`);
    logger.info(`Hub: ${config.hub.url}`);
    logger.info('');

    // Connect to Hub
    logger.info('Connecting to Hub...');
    initHubClient();

    this.running = true;

    // Start monitoring existing Claude processes (optional)
    // this.monitorExistingProcesses();

    logger.info('');
    logger.info('='.repeat(50));
    logger.info('  PIA Local Service Ready');
    logger.info('='.repeat(50));
    logger.info('');

    // Handle shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  async stop(): Promise<void> {
    logger.info('');
    logger.info('Shutting down PIA Local Service...');

    this.running = false;

    // Kill all local agents
    for (const [_id, agent] of this.agents) {
      logger.info(`Stopping agent: ${agent.name}`);
      if (agent.pty) {
        agent.pty.kill();
      }
    }
    this.agents.clear();

    // Disconnect from Hub
    getHubClient().disconnect();

    logger.info('Goodbye!');
    process.exit(0);
  }

  // Spawn a new agent (Claude CLI session)
  spawnAgent(options: {
    name?: string;
    type?: string;
    task?: string;
    cwd?: string;
    command?: string;
  }): LocalAgent {
    const id = nanoid();
    const name = options.name || `agent-${id.substring(0, 6)}`;
    const type = options.type || 'coder';
    const sessionId = nanoid();

    logger.info(`Spawning agent: ${name} (${type})`);

    // Create PTY session
    const pty = ptyManager.create(sessionId, {
      command: options.command || 'claude',
      cwd: options.cwd || process.cwd(),
    });

    const agent: LocalAgent = {
      id,
      name,
      type,
      status: 'idle',
      progress: 0,
      sessionId,
      pty,
    };

    // Monitor PTY output
    pty.on('output', (data) => {
      agent.lastOutput = data;
      this.analyzeOutput(agent, data);
    });

    pty.on('exit', (code) => {
      logger.info(`Agent ${name} exited with code: ${code}`);
      agent.status = 'completed';
      this.updateAgentInHub(agent);
    });

    this.agents.set(id, agent);

    // Register with Hub
    this.registerAgentInHub(agent);

    // If task provided, inject it
    if (options.task) {
      this.assignTask(id, options.task);
    }

    return agent;
  }

  // Assign a task to an agent
  assignTask(agentId: string, task: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn(`Agent not found: ${agentId}`);
      return;
    }

    logger.info(`Assigning task to ${agent.name}: ${task.substring(0, 50)}...`);

    agent.status = 'working';
    agent.currentTask = task;
    agent.progress = 0;

    // Send task to the PTY (type it in)
    if (agent.pty) {
      // Wait a moment for Claude to be ready
      setTimeout(() => {
        agent.pty?.write(task + '\n');
      }, 1000);
    }

    this.updateAgentInHub(agent);
  }

  // Send input to an agent
  sendInput(agentId: string, input: string): void {
    const agent = this.agents.get(agentId);
    if (!agent?.pty) {
      logger.warn(`Agent or PTY not found: ${agentId}`);
      return;
    }

    agent.pty.write(input);
  }

  // Kill an agent
  killAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      logger.warn(`Agent not found: ${agentId}`);
      return;
    }

    logger.info(`Killing agent: ${agent.name}`);

    if (agent.pty) {
      agent.pty.kill();
    }

    if (agent.sessionId) {
      ptyManager.kill(agent.sessionId);
    }

    this.agents.delete(agentId);

    // Notify Hub
    getHubClient().removeAgent(agentId);
  }

  // Analyze agent output to detect status changes
  private analyzeOutput(agent: LocalAgent, output: string): void {
    // Detect waiting for input
    if (
      output.includes('? ') ||
      output.includes('[Y/n]') ||
      output.includes('(y/n)') ||
      output.includes('Press enter') ||
      output.includes('continue?')
    ) {
      if (agent.status !== 'waiting') {
        agent.status = 'waiting';
        this.updateAgentInHub(agent);
        this.emit('agent:waiting', agent);
      }
    }

    // Detect errors
    if (
      output.includes('Error:') ||
      output.includes('error:') ||
      output.includes('FAILED') ||
      output.includes('Exception')
    ) {
      agent.status = 'error';
      this.updateAgentInHub(agent);
      this.emit('agent:error', agent);
    }

    // Detect progress (simple heuristics)
    if (output.includes('✓') || output.includes('done') || output.includes('complete')) {
      agent.progress = Math.min(agent.progress + 10, 100);
      this.updateAgentInHub(agent);
    }

    // Detect completion
    if (
      output.includes('Task completed') ||
      output.includes('All done') ||
      agent.progress >= 100
    ) {
      agent.status = 'completed';
      this.updateAgentInHub(agent);
      this.emit('agent:completed', agent);
    }
  }

  private registerAgentInHub(agent: LocalAgent): void {
    getHubClient().registerAgent({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      progress: agent.progress,
      current_task: agent.currentTask,
      last_output: agent.lastOutput?.substring(0, 200),
    });
  }

  private updateAgentInHub(agent: LocalAgent): void {
    getHubClient().updateAgent(agent.id, {
      status: agent.status,
      progress: agent.progress,
      current_task: agent.currentTask,
      last_output: agent.lastOutput?.substring(0, 200),
    });
  }

  // Get all local agents
  getAgents(): LocalAgent[] {
    return Array.from(this.agents.values());
  }

  // Get agent by ID
  getAgent(id: string): LocalAgent | undefined {
    return this.agents.get(id);
  }

  isRunning(): boolean {
    return this.running;
  }
}

// Singleton instance
let localService: PIALocalService | null = null;

export function getLocalService(): PIALocalService {
  if (!localService) {
    localService = new PIALocalService();
  }
  return localService;
}

export async function startLocalService(): Promise<PIALocalService> {
  const service = getLocalService();
  await service.start();
  return service;
}
