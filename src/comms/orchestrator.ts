/**
 * PIA Orchestrator
 * The Master Claude that controls all descendant Claude instances
 *
 * Architecture:
 *
 *                    ┌─────────────────┐
 *                    │   YOU (Human)   │
 *                    │  Discord/Email  │
 *                    └────────┬────────┘
 *                             │
 *                    ┌────────▼────────┐
 *                    │   ORCHESTRATOR  │
 *                    │  (Master Claude)│
 *                    └────────┬────────┘
 *                             │
 *        ┌────────────────────┼────────────────────┐
 *        │                    │                    │
 * ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
 * │  MACHINE 1  │     │  MACHINE 2  │     │  MACHINE 3  │
 * │   Claude    │     │   Claude    │     │   Claude    │
 * │  (Finance)  │     │  (Research) │     │  (DevOps)   │
 * └─────────────┘     └─────────────┘     └─────────────┘
 */

import { createLogger } from '../utils/logger.js';
import { ptyManager } from '../tunnel/pty-wrapper.js';

const logger = createLogger('Orchestrator');

interface ClaudeInstance {
  id: string;
  name: string;
  machineId: string;
  sessionId: string;
  purpose: string;
  status: 'idle' | 'working' | 'waiting' | 'offline';
  currentTask?: string;
  lastResponse?: string;
  createdAt: number;
}

interface Task {
  id: string;
  description: string;
  assignedTo?: string;
  status: 'pending' | 'assigned' | 'working' | 'complete' | 'failed';
  result?: string;
  createdAt: number;
  completedAt?: number;
}

interface OrchestratorMessage {
  from: 'human' | 'orchestrator' | string; // string = claude instance id
  to: 'orchestrator' | 'human' | string;
  content: string;
  timestamp: number;
}

export class PIAOrchestrator {
  private instances: Map<string, ClaudeInstance> = new Map();
  private tasks: Map<string, Task> = new Map();
  private messageLog: OrchestratorMessage[] = [];
  private humanMessageHandler?: (message: string) => Promise<string>;

  constructor() {
    logger.info('PIA Orchestrator initialized');
  }

  /**
   * Register a new Claude instance (descendant)
   */
  registerInstance(instance: Omit<ClaudeInstance, 'createdAt'>): ClaudeInstance {
    const fullInstance: ClaudeInstance = {
      ...instance,
      createdAt: Date.now(),
    };
    this.instances.set(instance.id, fullInstance);
    logger.info(`Registered Claude instance: ${instance.name} (${instance.purpose})`);
    return fullInstance;
  }

  /**
   * Spawn a new Claude instance in a terminal session
   */
  async spawnClaudeInstance(
    name: string,
    purpose: string,
    machineId: string,
    initialPrompt?: string
  ): Promise<ClaudeInstance> {
    // Create a new terminal session
    const sessionId = `claude-session-${Date.now()}`;

    try {
      const session = ptyManager.create(sessionId, {
        command: 'powershell.exe',
        cwd: process.cwd(),
      });

      const instance: ClaudeInstance = {
        id: `claude-${Date.now()}`,
        name,
        machineId,
        sessionId,
        purpose,
        status: 'idle',
        createdAt: Date.now(),
      };

      this.instances.set(instance.id, instance);

      // Launch Claude in the session
      setTimeout(() => {
        session.write('claude\r');

        // Wait for Claude to start, then send initial prompt
        if (initialPrompt) {
          setTimeout(() => {
            session.write(initialPrompt + '\r');
            instance.status = 'working';
            instance.currentTask = initialPrompt.substring(0, 100);
          }, 5000);
        }
      }, 1000);

      logger.info(`Spawned Claude instance: ${name} in session ${sessionId}`);
      return instance;
    } catch (error) {
      throw new Error(`Failed to create terminal session: ${error}`);
    }
  }

  /**
   * Send a command to a specific Claude instance
   */
  async sendToInstance(instanceId: string, message: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Get the session and write to it
    const session = ptyManager.get(instance.sessionId);
    if (!session) {
      throw new Error(`Session ${instance.sessionId} not found`);
    }

    session.write(message + '\r');

    // Log the message
    this.messageLog.push({
      from: 'orchestrator',
      to: instanceId,
      content: message,
      timestamp: Date.now(),
    });

    instance.status = 'working';
    instance.currentTask = message.substring(0, 100);

    logger.info(`Sent to ${instance.name}: ${message.substring(0, 50)}...`);
  }

  /**
   * Broadcast a message to all Claude instances
   */
  async broadcast(message: string): Promise<void> {
    for (const [id, instance] of this.instances) {
      if (instance.status !== 'offline') {
        await this.sendToInstance(id, message);
      }
    }
  }

  /**
   * Create a new task and optionally assign it
   */
  createTask(description: string, assignTo?: string): Task {
    const task: Task = {
      id: `task-${Date.now()}`,
      description,
      assignedTo: assignTo,
      status: assignTo ? 'assigned' : 'pending',
      createdAt: Date.now(),
    };

    this.tasks.set(task.id, task);

    if (assignTo) {
      const instance = this.instances.get(assignTo);
      if (instance) {
        this.sendToInstance(assignTo, description);
      }
    }

    logger.info(`Created task: ${description.substring(0, 50)}...`);
    return task;
  }

  /**
   * Handle incoming message from human (via Discord/Email)
   */
  async handleHumanMessage(message: string): Promise<string> {
    this.messageLog.push({
      from: 'human',
      to: 'orchestrator',
      content: message,
      timestamp: Date.now(),
    });

    logger.info(`Received from human: ${message.substring(0, 50)}...`);

    // Parse the message to determine action
    const lowerMessage = message.toLowerCase();

    // Status check
    if (lowerMessage.includes('status') || lowerMessage.includes('report')) {
      return this.getStatusReport();
    }

    // List instances
    if (lowerMessage.includes('list') && lowerMessage.includes('instance')) {
      return this.listInstances();
    }

    // Spawn new instance
    if (lowerMessage.includes('spawn') || lowerMessage.includes('create') && lowerMessage.includes('claude')) {
      // Extract purpose from message
      const purpose = message.replace(/spawn|create|claude|new|instance/gi, '').trim() || 'General Assistant';
      const instance = await this.spawnClaudeInstance(
        `Claude-${this.instances.size + 1}`,
        purpose,
        'local'
      );
      return `Spawned new Claude instance: ${instance.name} for ${purpose}`;
    }

    // Send to specific instance
    const sendMatch = message.match(/^@(\w+)\s+(.+)$/i);
    if (sendMatch) {
      const [, targetName, command] = sendMatch;
      const instance = Array.from(this.instances.values()).find(
        i => i.name.toLowerCase().includes(targetName.toLowerCase())
      );
      if (instance) {
        await this.sendToInstance(instance.id, command);
        return `Sent to ${instance.name}: ${command}`;
      }
      return `Instance "${targetName}" not found`;
    }

    // Default: process as a general command
    if (this.humanMessageHandler) {
      return await this.humanMessageHandler(message);
    }

    return `Received: "${message}". Use @InstanceName to send to specific Claude, or "spawn [purpose]" to create a new instance.`;
  }

  /**
   * Set handler for processing human messages
   */
  onHumanMessage(handler: (message: string) => Promise<string>): void {
    this.humanMessageHandler = handler;
  }

  /**
   * Get status report of all instances
   */
  getStatusReport(): string {
    const lines = [
      '═══════════════════════════════════════════',
      '  PIA ORCHESTRATOR STATUS REPORT',
      '═══════════════════════════════════════════',
      '',
      `Total Instances: ${this.instances.size}`,
      `Pending Tasks: ${Array.from(this.tasks.values()).filter(t => t.status === 'pending').length}`,
      '',
      'INSTANCES:',
    ];

    for (const instance of this.instances.values()) {
      lines.push(`  • ${instance.name} [${instance.status}]`);
      lines.push(`    Purpose: ${instance.purpose}`);
      if (instance.currentTask) {
        lines.push(`    Working on: ${instance.currentTask}`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════');
    return lines.join('\n');
  }

  /**
   * List all instances
   */
  listInstances(): string {
    if (this.instances.size === 0) {
      return 'No Claude instances registered. Use "spawn [purpose]" to create one.';
    }

    const lines = ['Claude Instances:', ''];
    for (const instance of this.instances.values()) {
      lines.push(`• ${instance.name} - ${instance.purpose} [${instance.status}]`);
    }
    return lines.join('\n');
  }

  /**
   * Get all instances
   */
  getInstances(): ClaudeInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get instance by ID
   */
  getInstance(id: string): ClaudeInstance | undefined {
    return this.instances.get(id);
  }
}

// Singleton
let orchestrator: PIAOrchestrator | null = null;

export function getOrchestrator(): PIAOrchestrator {
  if (!orchestrator) {
    orchestrator = new PIAOrchestrator();
  }
  return orchestrator;
}
