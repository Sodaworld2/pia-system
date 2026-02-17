/**
 * Shared project scanner — finds git repos by walking common directories.
 * Used by both the hub (aggregator) and workers (hub-client).
 */

import { existsSync, readdirSync } from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { config } from '../config.js';

export interface KnownProject {
  name: string;
  path: string;
}

const SKIP_DIRS = new Set([
  'node_modules', '__pycache__', 'venv', '.venv',
  'dist', 'build', '.cache', '.yarn',
]);

/**
 * Scan common directories for git repos (looks for .git subdirectories).
 * BFS with a deadline to avoid blocking too long.
 */
export function scanGitRepos(extraRoots: string[] = []): KnownProject[] {
  const home = homedir();
  const roots = [
    path.join(home, 'Documents', 'GitHub'),
    path.join(home, 'Downloads'),
    path.join(home, 'Desktop'),
    path.join(home, 'Projects'),
    path.join(home, 'dev'),
    path.join(home, 'repos'),
    path.join(home, 'Source'),
    path.join(home, 'Code'),
    ...config.hub.projectRoots,
    ...extraRoots,
  ];

  const projects: KnownProject[] = [];
  const deadline = Date.now() + 5000;
  const maxDepth = 3;
  const seen = new Set<string>();

  for (const root of roots) {
    if (Date.now() > deadline) break;
    if (!existsSync(root)) continue;

    const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

    while (queue.length > 0 && Date.now() < deadline) {
      const { dir, depth } = queue.shift()!;
      if (depth > maxDepth) continue;

      try {
        const entries = readdirSync(dir, { withFileTypes: true });

        if (entries.some(e => e.name === '.git' && e.isDirectory())) {
          const normalized = dir.replace(/\\/g, '/');
          if (!seen.has(normalized)) {
            seen.add(normalized);
            projects.push({ name: path.basename(dir), path: dir });
          }
          continue; // Don't recurse into git repos
        }

        if (depth < maxDepth) {
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
            queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
          }
        }
      } catch {
        // Permission denied or other FS error — skip
      }
    }
  }

  return projects;
}
