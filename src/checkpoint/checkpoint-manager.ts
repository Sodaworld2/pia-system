/**
 * Checkpoint Manager for PIA
 * Saves session state periodically so work can resume after memory limits
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../utils/logger.js';
import { getDataDir } from '../electron-paths.js';

const logger = createLogger('Checkpoint');

export interface Checkpoint {
  sessionId: string;
  machineId: string;
  agentId?: string;
  timestamp: number;
  lastTask: string;
  progress: number;
  context: string;       // Summary of what was being worked on
  workingDir: string;
  command: string;
  outputSnippet: string; // Last 500 chars of output
  status: 'active' | 'completed' | 'interrupted';
}

export class CheckpointManager {
  private checkpointDir: string;
  private intervalMs: number;
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(dataDir: string = getDataDir(), intervalMinutes: number = 5) {
    this.checkpointDir = join(dataDir, 'checkpoints');
    this.intervalMs = intervalMinutes * 60 * 1000;

    // Ensure checkpoint directory exists
    if (!existsSync(this.checkpointDir)) {
      mkdirSync(this.checkpointDir, { recursive: true });
    }

    logger.info(`Checkpoint manager initialized (interval: ${intervalMinutes}min)`);
  }

  /**
   * Start checkpointing for a session
   */
  startCheckpointing(
    sessionId: string,
    machineId: string,
    command: string,
    workingDir: string,
    getOutput: () => string,
    agentId?: string
  ): void {
    // Clear any existing interval
    this.stopCheckpointing(sessionId);

    // Create initial checkpoint
    this.saveCheckpoint({
      sessionId,
      machineId,
      agentId,
      timestamp: Date.now(),
      lastTask: 'Session started',
      progress: 0,
      context: `Running ${command} in ${workingDir}`,
      workingDir,
      command,
      outputSnippet: '',
      status: 'active',
    });

    // Set up periodic checkpointing
    const interval = setInterval(() => {
      const output = getOutput();
      const snippet = output.slice(-500); // Last 500 chars

      // Try to extract task info from output
      const taskMatch = output.match(/(?:working on|task:|current:)\s*(.{1,100})/i);
      const progressMatch = output.match(/(\d{1,3})%/);

      this.saveCheckpoint({
        sessionId,
        machineId,
        agentId,
        timestamp: Date.now(),
        lastTask: taskMatch ? taskMatch[1].trim() : 'In progress',
        progress: progressMatch ? parseInt(progressMatch[1]) : 50,
        context: this.extractContext(output),
        workingDir,
        command,
        outputSnippet: snippet,
        status: 'active',
      });

      logger.debug(`Checkpoint saved for session ${sessionId.substring(0, 8)}`);
    }, this.intervalMs);

    this.intervals.set(sessionId, interval);
    logger.info(`Checkpointing started for session ${sessionId.substring(0, 8)}`);
  }

  /**
   * Stop checkpointing for a session
   */
  stopCheckpointing(sessionId: string, status: 'completed' | 'interrupted' = 'interrupted'): void {
    const interval = this.intervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(sessionId);

      // Update final status
      const checkpoint = this.getCheckpoint(sessionId);
      if (checkpoint) {
        checkpoint.status = status;
        checkpoint.timestamp = Date.now();
        this.saveCheckpoint(checkpoint);
      }

      logger.info(`Checkpointing stopped for session ${sessionId.substring(0, 8)} (${status})`);
    }
  }

  /**
   * Save a checkpoint to disk
   */
  saveCheckpoint(checkpoint: Checkpoint): void {
    const filename = `${checkpoint.sessionId}.json`;
    const filepath = join(this.checkpointDir, filename);

    try {
      writeFileSync(filepath, JSON.stringify(checkpoint, null, 2));
    } catch (error) {
      logger.error(`Failed to save checkpoint: ${error}`);
    }
  }

  /**
   * Get checkpoint for a session
   */
  getCheckpoint(sessionId: string): Checkpoint | null {
    const filepath = join(this.checkpointDir, `${sessionId}.json`);

    if (!existsSync(filepath)) {
      return null;
    }

    try {
      const data = readFileSync(filepath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error(`Failed to read checkpoint: ${error}`);
      return null;
    }
  }

  /**
   * Get all interrupted checkpoints (sessions that died)
   */
  getInterruptedCheckpoints(): Checkpoint[] {
    const checkpoints: Checkpoint[] = [];

    try {
      const files = readdirSync(this.checkpointDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filepath = join(this.checkpointDir, file);
        const data = readFileSync(filepath, 'utf-8');
        const checkpoint: Checkpoint = JSON.parse(data);

        if (checkpoint.status === 'interrupted') {
          checkpoints.push(checkpoint);
        }
      }
    } catch (error) {
      logger.error(`Failed to list checkpoints: ${error}`);
    }

    return checkpoints.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get all checkpoints for a machine
   */
  getCheckpointsForMachine(machineId: string): Checkpoint[] {
    const checkpoints: Checkpoint[] = [];

    try {
      const files = readdirSync(this.checkpointDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filepath = join(this.checkpointDir, file);
        const data = readFileSync(filepath, 'utf-8');
        const checkpoint: Checkpoint = JSON.parse(data);

        if (checkpoint.machineId === machineId) {
          checkpoints.push(checkpoint);
        }
      }
    } catch (error) {
      logger.error(`Failed to list checkpoints: ${error}`);
    }

    return checkpoints.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Generate a handoff prompt for resuming work
   */
  generateHandoffPrompt(checkpoint: Checkpoint): string {
    const age = Math.round((Date.now() - checkpoint.timestamp) / 60000);

    return `
# Session Handoff - Resuming Previous Work

You are continuing work from a previous session that was interrupted ${age} minutes ago.

## Previous State
- **Last Task**: ${checkpoint.lastTask}
- **Progress**: ${checkpoint.progress}%
- **Working Directory**: ${checkpoint.workingDir}
- **Context**: ${checkpoint.context}

## Last Output
\`\`\`
${checkpoint.outputSnippet}
\`\`\`

## Instructions
1. Read any relevant state files in the working directory
2. Assess what was completed vs what remains
3. Continue from where the previous session left off
4. Do NOT restart from the beginning

Please acknowledge this handoff and continue the work.
`.trim();
  }

  /**
   * Mark a checkpoint as resumed (so it's not picked up again)
   */
  markAsResumed(sessionId: string, newSessionId: string): void {
    const checkpoint = this.getCheckpoint(sessionId);
    if (checkpoint) {
      checkpoint.status = 'completed';
      (checkpoint as any).resumedBy = newSessionId;
      this.saveCheckpoint(checkpoint);
      logger.info(`Checkpoint ${sessionId.substring(0, 8)} marked as resumed by ${newSessionId.substring(0, 8)}`);
    }
  }

  /**
   * Extract context from terminal output
   */
  private extractContext(output: string): string {
    // Look for common patterns that indicate what's being worked on
    const patterns = [
      /(?:editing|modifying|updating)\s+(\S+)/i,
      /(?:file|path):\s*(\S+)/i,
      /(?:running|executing)\s+(.{1,50})/i,
      /(?:error|failed|issue):\s*(.{1,100})/i,
      /(?:completed|finished|done):\s*(.{1,50})/i,
    ];

    const contexts: string[] = [];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        contexts.push(match[0].trim());
      }
    }

    if (contexts.length === 0) {
      // Fallback: get last meaningful line
      const lines = output.split('\n').filter(l => l.trim().length > 10);
      if (lines.length > 0) {
        return lines[lines.length - 1].substring(0, 200);
      }
      return 'No context available';
    }

    return contexts.slice(0, 3).join('; ');
  }

  /**
   * Clean up old checkpoints (older than N days)
   */
  cleanupOldCheckpoints(maxAgeDays: number = 7): number {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;

    try {
      const files = readdirSync(this.checkpointDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filepath = join(this.checkpointDir, file);
        const data = readFileSync(filepath, 'utf-8');
        const checkpoint: Checkpoint = JSON.parse(data);

        if (now - checkpoint.timestamp > maxAgeMs) {
          unlinkSync(filepath);
          cleaned++;
        }
      }
    } catch (error) {
      logger.error(`Failed to cleanup checkpoints: ${error}`);
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old checkpoints`);
    }

    return cleaned;
  }
}

// Singleton instance
let checkpointManager: CheckpointManager | null = null;

export function getCheckpointManager(): CheckpointManager {
  if (!checkpointManager) {
    checkpointManager = new CheckpointManager();
  }
  return checkpointManager;
}

export function initCheckpointManager(dataDir?: string, intervalMinutes?: number): CheckpointManager {
  checkpointManager = new CheckpointManager(dataDir, intervalMinutes);
  return checkpointManager;
}
