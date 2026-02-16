/**
 * File Transfer API
 * Direct file read/write on this machine — replaces the 3-step base64 PTY dance.
 *
 * POST /api/files/write  { path, content, encoding? }
 * GET  /api/files/read?path=...
 * GET  /api/files/list?path=...
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('FilesAPI');

// Safety: block system directories
function isPathAllowed(filePath: string): boolean {
  const normalized = path.resolve(filePath);
  const blocked = ['C:\\Windows', 'C:\\Program Files', '/usr/bin', '/sbin', '/etc/shadow'];
  return !blocked.some(b => normalized.startsWith(b));
}

/**
 * POST /api/files/write
 * Write a file to this machine
 */
router.post('/write', (req: Request, res: Response): void => {
  try {
    const { path: filePath, content, encoding } = req.body;

    if (!filePath || content === undefined) {
      res.status(400).json({ error: 'path and content are required' });
      return;
    }

    if (!isPathAllowed(filePath)) {
      res.status(403).json({ error: 'Path not allowed' });
      return;
    }

    // Create parent directories
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, (encoding as BufferEncoding) || 'utf8');
    const stat = fs.statSync(filePath);

    logger.info(`File written: ${filePath} (${stat.size} bytes)`);
    res.json({ success: true, path: filePath, size: stat.size });
  } catch (error) {
    logger.error(`File write failed: ${error}`);
    res.status(500).json({ error: `Write failed: ${(error as Error).message}` });
  }
});

/**
 * GET /api/files/read?path=...
 * Read a file from this machine
 */
router.get('/read', (req: Request, res: Response): void => {
  try {
    const filePath = req.query.path as string;

    if (!filePath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }

    if (!isPathAllowed(filePath)) {
      res.status(403).json({ error: 'Path not allowed' });
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const stat = fs.statSync(filePath);

    res.json({ content, path: filePath, size: stat.size });
  } catch (error) {
    logger.error(`File read failed: ${error}`);
    res.status(500).json({ error: `Read failed: ${(error as Error).message}` });
  }
});

/**
 * GET /api/files/list?path=...
 * List directory contents
 */
router.get('/list', (req: Request, res: Response): void => {
  try {
    const dirPath = req.query.path as string;

    if (!dirPath) {
      res.status(400).json({ error: 'path query parameter is required' });
      return;
    }

    if (!fs.existsSync(dirPath)) {
      res.status(404).json({ error: 'Directory not found' });
      return;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items = entries.map(e => {
      try {
        const stat = fs.statSync(path.join(dirPath, e.name));
        return {
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
          size: e.isFile() ? stat.size : undefined,
          mtime: stat.mtimeMs,
        };
      } catch {
        return { name: e.name, type: e.isDirectory() ? 'directory' : 'file' };
      }
    });

    res.json({ path: dirPath, items, count: items.length });
  } catch (error) {
    logger.error(`Directory list failed: ${error}`);
    res.status(500).json({ error: `List failed: ${(error as Error).message}` });
  }
});

/**
 * GET /api/files/search?q=...&root=...&maxDepth=...
 * Search for directories by name (recursive, breadth-first)
 */
router.get('/search', (req: Request, res: Response): void => {
  try {
    const query = (req.query.q as string || '').toLowerCase();
    const root = (req.query.root as string) || 'C:\\Users';
    const maxDepth = parseInt(req.query.maxDepth as string) || 4;
    const maxResults = parseInt(req.query.maxResults as string) || 20;

    if (!query || query.length < 2) {
      res.status(400).json({ error: 'q must be at least 2 characters' });
      return;
    }

    if (!fs.existsSync(root)) {
      res.status(404).json({ error: 'Root directory not found' });
      return;
    }

    const results: { name: string; path: string; depth: number }[] = [];
    const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];

    while (queue.length > 0 && results.length < maxResults) {
      const { dir, depth } = queue.shift()!;
      if (depth > maxDepth) continue;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '$Recycle.Bin' || entry.name === 'AppData') continue;

          const fullPath = path.join(dir, entry.name);

          if (entry.name.toLowerCase().includes(query)) {
            results.push({ name: entry.name, path: fullPath, depth });
            if (results.length >= maxResults) break;
          }

          if (depth < maxDepth) {
            queue.push({ dir: fullPath, depth: depth + 1 });
          }
        }
      } catch {
        // Permission denied or other read error — skip
      }
    }

    res.json({ query, root, results, count: results.length });
  } catch (error) {
    logger.error(`Directory search failed: ${error}`);
    res.status(500).json({ error: `Search failed: ${(error as Error).message}` });
  }
});

export default router;
