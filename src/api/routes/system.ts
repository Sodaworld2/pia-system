/**
 * System Management API Routes
 *
 * POST /api/system/update   - Pull latest code, install deps, build, restart
 * POST /api/system/restart  - Restart the server process
 * GET  /api/system/info     - Return machine and version info
 */

import { Router, Request, Response } from 'express';
import { execSync } from 'child_process';
import { hostname, uptime } from 'os';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../../utils/logger.js';
import { getAppRoot } from '../../electron-paths.js';

const router = Router();
const logger = createLogger('SystemAPI');

// POST /api/system/update - git pull, npm install, build, then restart
router.post('/update', (_req: Request, res: Response) => {
  const cwd = getAppRoot();
  const results: { step: string; output: string; success: boolean }[] = [];

  // Step 1: git pull
  try {
    const gitOutput = execSync('git pull origin master', { cwd, encoding: 'utf8', timeout: 60000 });
    results.push({ step: 'git pull', output: gitOutput.trim(), success: true });
    logger.info(`git pull: ${gitOutput.trim()}`);
  } catch (error: any) {
    const msg = error.stderr || error.stdout || error.message;
    results.push({ step: 'git pull', output: msg, success: false });
    logger.error(`git pull failed: ${msg}`);
    res.status(500).json({ error: 'git pull failed', results });
    return;
  }

  // Step 2: npm install --production
  try {
    const npmOutput = execSync('npm install --production', { cwd, encoding: 'utf8', timeout: 120000 });
    results.push({ step: 'npm install', output: npmOutput.trim(), success: true });
    logger.info('npm install completed');
  } catch (error: any) {
    const msg = error.stderr || error.stdout || error.message;
    results.push({ step: 'npm install', output: msg, success: false });
    logger.error(`npm install failed: ${msg}`);
    res.status(500).json({ error: 'npm install failed', results });
    return;
  }

  // Step 3: npm run build (tsc)
  try {
    const buildOutput = execSync('npx tsc', { cwd, encoding: 'utf8', timeout: 120000 });
    results.push({ step: 'build', output: buildOutput.trim() || 'Build succeeded', success: true });
    logger.info('Build completed');
  } catch (error: any) {
    const msg = error.stderr || error.stdout || error.message;
    results.push({ step: 'build', output: msg, success: false });
    logger.error(`Build failed: ${msg}`);
    res.status(500).json({ error: 'Build failed', results });
    return;
  }

  // Send success response before restarting
  res.json({ message: 'Update complete, restarting in 2 seconds...', results });

  // Schedule restart after response is sent
  logger.info('Scheduling server restart in 2 seconds...');
  setTimeout(() => {
    logger.info('Restarting server process (exit 0)');
    process.exit(0);
  }, 2000);
});

// POST /api/system/restart - Restart the server process
router.post('/restart', (_req: Request, res: Response) => {
  res.json({ message: 'Server restarting in 2 seconds...' });

  logger.info('Scheduling server restart in 2 seconds...');
  setTimeout(() => {
    logger.info('Restarting server process (exit 0)');
    process.exit(0);
  }, 2000);
});

// GET /api/system/info - Return machine and version info
router.get('/info', (_req: Request, res: Response) => {
  const cwd = getAppRoot();

  // Read PIA version from package.json
  let piaVersion = 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    piaVersion = pkg.version;
  } catch {
    logger.warn('Could not read package.json for version');
  }

  // Get git branch
  let gitBranch = 'unknown';
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    logger.warn('Could not determine git branch');
  }

  // Get git commit
  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    logger.warn('Could not determine git commit');
  }

  res.json({
    hostname: hostname(),
    uptime: uptime(),
    nodeVersion: process.version,
    gitBranch,
    gitCommit,
    piaVersion,
  });
});

export default router;
