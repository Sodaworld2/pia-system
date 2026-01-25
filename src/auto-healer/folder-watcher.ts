/**
 * PIA Folder Watcher
 * Monitors project folders for changes and triggers auto-healing actions
 */

import { watch, FSWatcher } from 'chokidar';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { createLogger } from '../utils/logger.js';
import { EventEmitter } from 'events';
import { getDatabase } from '../db/database.js';
import { extname, basename } from 'path';

const logger = createLogger('FolderWatcher');

interface WatchedDoc {
  id: number;
  path: string;
  type: 'README' | 'TODO' | 'CHANGELOG' | 'API' | 'CONFIG' | 'OTHER';
  last_hash: string;
  last_checked: number;
  auto_update: boolean;
}

interface FileChange {
  path: string;
  type: 'add' | 'change' | 'unlink';
  hash?: string;
  timestamp: number;
}

export class FolderWatcher extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map();
  private changeQueue: FileChange[] = [];
  private processTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 500;

  private readonly IGNORE_PATTERNS = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/__pycache__/**',
    '**/target/**',
    '**/.next/**',
    '**/coverage/**',
  ];

  // Watch a folder
  watchFolder(folderPath: string, options: { deep?: boolean } = {}): void {
    if (this.watchers.has(folderPath)) {
      logger.warn(`Already watching: ${folderPath}`);
      return;
    }

    logger.info(`Starting to watch: ${folderPath}`);

    const watcher = watch(folderPath, {
      ignored: this.IGNORE_PATTERNS,
      persistent: true,
      ignoreInitial: true,
      depth: options.deep ? undefined : 3,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    watcher.on('add', (path) => this.handleChange(path, 'add'));
    watcher.on('change', (path) => this.handleChange(path, 'change'));
    watcher.on('unlink', (path) => this.handleChange(path, 'unlink'));
    watcher.on('error', (error) => logger.error(`Watcher error: ${error}`));

    this.watchers.set(folderPath, watcher);
    logger.info(`Watching ${folderPath} for changes`);
  }

  // Stop watching a folder
  unwatchFolder(folderPath: string): void {
    const watcher = this.watchers.get(folderPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(folderPath);
      logger.info(`Stopped watching: ${folderPath}`);
    }
  }

  // Stop all watchers
  stopAll(): void {
    for (const [path, watcher] of this.watchers) {
      watcher.close();
      logger.info(`Stopped watching: ${path}`);
    }
    this.watchers.clear();
    if (this.processTimer) {
      clearTimeout(this.processTimer);
    }
  }

  // Handle a file change
  private handleChange(path: string, type: 'add' | 'change' | 'unlink'): void {
    const change: FileChange = {
      path,
      type,
      timestamp: Date.now(),
    };

    // Calculate hash for added/changed files
    if (type !== 'unlink' && existsSync(path)) {
      try {
        const content = readFileSync(path);
        change.hash = createHash('md5').update(content).digest('hex');
      } catch {
        // Ignore read errors
      }
    }

    this.changeQueue.push(change);

    // Debounce processing
    if (this.processTimer) {
      clearTimeout(this.processTimer);
    }
    this.processTimer = setTimeout(() => this.processChanges(), this.DEBOUNCE_MS);
  }

  // Process accumulated changes
  private processChanges(): void {
    if (this.changeQueue.length === 0) return;

    const changes = [...this.changeQueue];
    this.changeQueue = [];

    // Group changes by type
    const codeChanges: FileChange[] = [];
    const docChanges: FileChange[] = [];
    const configChanges: FileChange[] = [];
    const otherChanges: FileChange[] = [];

    for (const change of changes) {
      const ext = extname(change.path).toLowerCase();
      const name = basename(change.path).toLowerCase();

      if (this.isCodeFile(ext)) {
        codeChanges.push(change);
      } else if (this.isDocFile(name, ext)) {
        docChanges.push(change);
      } else if (this.isConfigFile(name)) {
        configChanges.push(change);
      } else {
        otherChanges.push(change);
      }
    }

    // Emit events for different change types
    if (codeChanges.length > 0) {
      logger.info(`Code changes detected: ${codeChanges.length} files`);
      this.emit('code-change', codeChanges);
      this.checkDocumentationDrift(codeChanges);
    }

    if (docChanges.length > 0) {
      logger.info(`Documentation changes: ${docChanges.length} files`);
      this.emit('doc-change', docChanges);
      this.updateDocHashes(docChanges);
    }

    if (configChanges.length > 0) {
      logger.info(`Config changes: ${configChanges.length} files`);
      this.emit('config-change', configChanges);
    }

    if (otherChanges.length > 0) {
      this.emit('other-change', otherChanges);
    }

    // Emit consolidated summary
    this.emit('changes', {
      code: codeChanges,
      docs: docChanges,
      config: configChanges,
      other: otherChanges,
      total: changes.length,
      timestamp: Date.now(),
    });
  }

  // Check if documentation might be out of date
  private checkDocumentationDrift(codeChanges: FileChange[]): void {
    // Count significant changes (exclude test files)
    const significantChanges = codeChanges.filter(c => {
      return !c.path.includes('.test.') &&
             !c.path.includes('.spec.') &&
             !c.path.includes('__tests__');
    });

    if (significantChanges.length >= 5) {
      logger.warn('Multiple code changes detected - documentation may need update');
      this.emit('drift-warning', {
        message: `${significantChanges.length} code files changed - consider updating documentation`,
        files: significantChanges.map(c => c.path),
      });
    }
  }

  // Update stored hashes for documentation files
  private updateDocHashes(docChanges: FileChange[]): void {
    const db = getDatabase();

    for (const change of docChanges) {
      if (change.type === 'unlink') {
        // Mark as deleted
        db.prepare('DELETE FROM watched_docs WHERE path = ?').run(change.path);
      } else if (change.hash) {
        // Update or insert hash
        const existing = db.prepare('SELECT id FROM watched_docs WHERE path = ?').get(change.path) as { id: number } | undefined;

        if (existing) {
          db.prepare(`
            UPDATE watched_docs
            SET last_hash = ?, last_checked = ?
            WHERE id = ?
          `).run(change.hash, Date.now(), existing.id);
        } else {
          const docType = this.getDocType(change.path);
          db.prepare(`
            INSERT INTO watched_docs (path, type, last_hash, auto_update)
            VALUES (?, ?, ?, 0)
          `).run(change.path, docType, change.hash);
        }
      }
    }
  }

  // Determine document type from filename
  private getDocType(path: string): WatchedDoc['type'] {
    const name = basename(path).toUpperCase();

    if (name.includes('README')) return 'README';
    if (name.includes('TODO')) return 'TODO';
    if (name.includes('CHANGELOG') || name.includes('HISTORY')) return 'CHANGELOG';
    if (name.includes('API')) return 'API';
    if (name.includes('CONFIG') || name.includes('ENV')) return 'CONFIG';
    return 'OTHER';
  }

  // Helper: is this a code file?
  private isCodeFile(ext: string): boolean {
    return ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.h'].includes(ext);
  }

  // Helper: is this a documentation file?
  private isDocFile(name: string, ext: string): boolean {
    if (ext !== '.md') return false;
    const docNames = ['readme', 'changelog', 'todo', 'api', 'contributing', 'claude', 'docs'];
    return docNames.some(d => name.includes(d)) || ext === '.md';
  }

  // Helper: is this a config file?
  private isConfigFile(name: string): boolean {
    const configNames = ['package.json', 'tsconfig.json', 'pyproject.toml', '.env', 'cargo.toml', 'go.mod', 'requirements.txt'];
    return configNames.includes(name) || name.startsWith('.');
  }

  // Get watched folders status
  getStatus(): { folders: string[]; changesSinceStart: number } {
    return {
      folders: Array.from(this.watchers.keys()),
      changesSinceStart: 0, // Could track total if needed
    };
  }

  // Get all watched documents
  getWatchedDocs(): WatchedDoc[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM watched_docs').all() as WatchedDoc[];
  }
}

// Singleton
let folderWatcher: FolderWatcher | null = null;

export function getFolderWatcher(): FolderWatcher {
  if (!folderWatcher) {
    folderWatcher = new FolderWatcher();
  }
  return folderWatcher;
}

export function initFolderWatcher(folders?: string[]): FolderWatcher {
  const watcher = getFolderWatcher();

  if (folders) {
    for (const folder of folders) {
      watcher.watchFolder(folder);
    }
  }

  return watcher;
}
