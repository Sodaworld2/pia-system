/**
 * Clean Exec API
 * Run commands and get clean stdout/stderr back — no ANSI escape codes.
 *
 * POST /api/exec  { command, cwd?, timeout? }
 */

import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../../utils/logger.js';

const execAsync = promisify(exec);
const router = Router();
const logger = createLogger('ExecAPI');

// Strip ANSI escape codes
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]|\x1B\].*?\x07|\x1B\[[\?]?[0-9;]*[hlm]/g, '');
}

// Safety: block dangerous commands
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /format\s+[a-z]:/i,
  /del\s+\/s\s+\/q\s+[a-z]:\\/i,
  /mkfs/i,
  /shutdown/i,
  /:\(\)\{.*\}.*:/,  // fork bomb
];

function isCommandSafe(command: string): boolean {
  return !BLOCKED_PATTERNS.some(p => p.test(command));
}

/**
 * POST /api/exec
 * Run a command and return clean output
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { command, cwd, timeout } = req.body;

    if (!command) {
      res.status(400).json({ error: 'command is required' });
      return;
    }

    if (!isCommandSafe(command)) {
      res.status(403).json({ error: 'Command blocked by safety rules' });
      return;
    }

    const execTimeout = Math.min(timeout || 60000, 300000); // Max 5 min
    const startTime = Date.now();

    logger.info(`Executing: ${command.substring(0, 100)}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(),
        timeout: execTimeout,
        maxBuffer: 2 * 1024 * 1024, // 2MB
        shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
      });

      const durationMs = Date.now() - startTime;

      res.json({
        stdout: stripAnsi(stdout || ''),
        stderr: stripAnsi(stderr || ''),
        exitCode: 0,
        durationMs,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean };
      const durationMs = Date.now() - startTime;

      res.json({
        stdout: stripAnsi(error.stdout || ''),
        stderr: stripAnsi(error.stderr || ''),
        exitCode: error.code || 1,
        killed: error.killed || false,
        durationMs,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error(`Exec failed: ${error}`);
    res.status(500).json({ error: `Exec failed: ${(error as Error).message}` });
  }
});

export default router;
