import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';
import { platform } from 'os';

const logger = createLogger('PTY');

export interface PTYOptions {
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface PTYEvents {
  output: (data: string) => void;
  exit: (code: number) => void;
  error: (error: Error) => void;
}

export class PTYWrapper extends EventEmitter {
  private ptyProcess: pty.IPty | null = null;
  private outputBuffer: string[] = [];
  private maxBufferSize: number = 10000;
  private sessionId: string;
  private isAlive: boolean = false;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  spawn(options: PTYOptions): number {
    const shell = platform() === 'win32' ? 'powershell.exe' : options.command;
    const args = platform() === 'win32' ? [] : options.args || [];

    logger.info(`Spawning PTY: ${shell} ${args.join(' ')} in ${options.cwd}`);

    try {
      this.ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: options.cols || 120,
        rows: options.rows || 30,
        cwd: options.cwd,
        env: {
          ...process.env,
          ...options.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        } as Record<string, string>,
      });

      this.isAlive = true;

      this.ptyProcess.onData((data: string) => {
        this.outputBuffer.push(data);

        // Trim buffer if too large
        while (this.outputBuffer.length > this.maxBufferSize) {
          this.outputBuffer.shift();
        }

        this.emit('output', data);
      });

      this.ptyProcess.onExit(({ exitCode }) => {
        logger.info(`PTY exited with code: ${exitCode}`);
        this.isAlive = false;
        this.emit('exit', exitCode);
      });

      logger.info(`PTY spawned with PID: ${this.ptyProcess.pid}`);
      return this.ptyProcess.pid;
    } catch (error) {
      logger.error(`Failed to spawn PTY: ${error}`);
      this.emit('error', error as Error);
      throw error;
    }
  }

  write(data: string): void {
    if (this.ptyProcess && this.isAlive) {
      this.ptyProcess.write(data);
    } else {
      logger.warn('Attempted to write to dead PTY');
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ptyProcess && this.isAlive) {
      this.ptyProcess.resize(cols, rows);
      logger.debug(`PTY resized to ${cols}x${rows}`);
    }
  }

  kill(signal?: string): void {
    if (this.ptyProcess && this.isAlive) {
      logger.info(`Killing PTY (signal: ${signal || 'SIGTERM'})`);
      this.ptyProcess.kill(signal);
      this.isAlive = false;
    }
  }

  getBuffer(): string[] {
    return [...this.outputBuffer];
  }

  getBufferAsString(): string {
    return this.outputBuffer.join('');
  }

  clearBuffer(): void {
    this.outputBuffer = [];
  }

  getPid(): number | null {
    return this.ptyProcess?.pid || null;
  }

  getIsAlive(): boolean {
    return this.isAlive;
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

// Manager for multiple PTY sessions
export class PTYManager {
  private sessions: Map<string, PTYWrapper> = new Map();

  create(sessionId: string, options: PTYOptions): PTYWrapper {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const wrapper = new PTYWrapper(sessionId);
    wrapper.spawn(options);

    wrapper.on('exit', () => {
      this.sessions.delete(sessionId);
      logger.info(`Session ${sessionId} removed from manager`);
    });

    this.sessions.set(sessionId, wrapper);
    logger.info(`Session ${sessionId} created and managed`);

    return wrapper;
  }

  get(sessionId: string): PTYWrapper | undefined {
    return this.sessions.get(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  kill(sessionId: string): boolean {
    const wrapper = this.sessions.get(sessionId);
    if (wrapper) {
      wrapper.kill();
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  killAll(): void {
    for (const [sessionId, wrapper] of this.sessions) {
      logger.info(`Killing session: ${sessionId}`);
      wrapper.kill();
    }
    this.sessions.clear();
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}

// Singleton instance
export const ptyManager = new PTYManager();
