/**
 * PIA Documentation Auto-Updater
 * Monitors code changes and automatically updates documentation
 */

import { createLogger } from '../utils/logger.js';
import { EventEmitter } from 'events';
import { getFolderWatcher } from './folder-watcher.js';
import { getAIAssessor } from './ai-assessor.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { createAlert } from '../db/queries/alerts.js';

const logger = createLogger('DocUpdater');

interface DocUpdate {
  path: string;
  type: 'append' | 'section' | 'suggestion';
  content: string;
  codeFiles: string[];
  timestamp: number;
  applied: boolean;
}

// Interface for future changelog parsing
// interface ChangelogEntry {
//   date: string;
//   version?: string;
//   changes: string[];
// }

export class DocAutoUpdater extends EventEmitter {
  private pendingUpdates: Map<string, DocUpdate[]> = new Map();
  private autoApply: boolean = false;

  constructor() {
    super();
  }

  // Start monitoring for documentation updates
  start(projectPath: string, options: { autoApply?: boolean } = {}): void {
    this.autoApply = options.autoApply || false;

    const watcher = getFolderWatcher();
    watcher.watchFolder(projectPath);

    // Listen for code changes
    watcher.on('code-change', async (changes) => {
      await this.handleCodeChanges(projectPath, changes);
    });

    // Listen for drift warnings
    watcher.on('drift-warning', (warning) => {
      this.handleDriftWarning(warning);
    });

    logger.info(`Doc auto-updater started for: ${projectPath}`);
    logger.info(`Auto-apply: ${this.autoApply}`);
  }

  // Stop monitoring
  stop(): void {
    const watcher = getFolderWatcher();
    watcher.stopAll();
    logger.info('Doc auto-updater stopped');
  }

  // Handle code changes
  private async handleCodeChanges(projectPath: string, changes: Array<{ path: string; type: string }>): Promise<void> {
    const changedFiles = changes.map(c => c.path);

    // Check if CHANGELOG needs update
    await this.checkChangelogUpdate(projectPath, changedFiles);

    // Check if README needs update
    await this.checkReadmeUpdate(projectPath, changedFiles);

    // Use AI to assess if more updates needed
    const assessor = getAIAssessor();
    const status = assessor.getStatus();

    if (status.available) {
      const docs = this.findProjectDocs(projectPath);
      const assessment = await assessor.assessDocDrift(changedFiles, docs);

      if (assessment.success && assessment.suggestions) {
        logger.info(`AI suggests documentation updates: ${assessment.suggestions.length} items`);

        for (const suggestion of assessment.suggestions) {
          this.emit('suggestion', {
            type: 'ai-suggestion',
            content: suggestion,
            priority: assessment.priority,
          });
        }
      }
    }
  }

  // Handle drift warning
  private handleDriftWarning(warning: { message: string; files: string[] }): void {
    logger.warn(`Documentation drift detected: ${warning.message}`);

    // Create alert
    createAlert({
      type: 'context_overflow', // Reusing for doc drift
      message: warning.message,
    });

    this.emit('drift', warning);
  }

  // Check if CHANGELOG needs update
  private async checkChangelogUpdate(projectPath: string, changedFiles: string[]): Promise<void> {
    const changelogPath = join(projectPath, 'CHANGELOG.md');

    if (!existsSync(changelogPath)) {
      // Suggest creating a CHANGELOG
      const update: DocUpdate = {
        path: changelogPath,
        type: 'suggestion',
        content: this.generateChangelogTemplate(),
        codeFiles: changedFiles,
        timestamp: Date.now(),
        applied: false,
      };

      this.addPendingUpdate(update);
      this.emit('suggestion', {
        type: 'create-changelog',
        path: changelogPath,
        content: update.content,
      });
      return;
    }

    // Only suggest updates if many files changed
    if (changedFiles.length >= 3) {
      const entry = this.generateChangelogEntry(changedFiles);

      const update: DocUpdate = {
        path: changelogPath,
        type: 'append',
        content: entry,
        codeFiles: changedFiles,
        timestamp: Date.now(),
        applied: false,
      };

      this.addPendingUpdate(update);

      if (this.autoApply) {
        this.applyUpdate(update);
      } else {
        this.emit('suggestion', {
          type: 'changelog-entry',
          path: changelogPath,
          content: entry,
        });
      }
    }
  }

  // Check if README needs update
  private async checkReadmeUpdate(projectPath: string, changedFiles: string[]): Promise<void> {
    // Check for specific file patterns that typically need README updates
    const needsReadmeUpdate = changedFiles.some(f => {
      const name = basename(f).toLowerCase();
      return name === 'package.json' ||
             name === 'requirements.txt' ||
             name === 'cargo.toml' ||
             name === 'go.mod' ||
             f.includes('/api/') ||
             f.includes('/cli/');
    });

    if (needsReadmeUpdate) {
      const readmePath = join(projectPath, 'README.md');

      if (existsSync(readmePath)) {
        this.emit('suggestion', {
          type: 'readme-check',
          path: readmePath,
          message: 'Config or API files changed - verify README is up to date',
          files: changedFiles,
        });
      }
    }
  }

  // Find documentation files in a project
  private findProjectDocs(projectPath: string): string[] {
    const docs: string[] = [];
    const candidates = [
      'README.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'API.md',
      'CLAUDE.md',
      'docs/README.md',
      'docs/API.md',
    ];

    for (const candidate of candidates) {
      const fullPath = join(projectPath, candidate);
      if (existsSync(fullPath)) {
        docs.push(fullPath);
      }
    }

    return docs;
  }

  // Generate a CHANGELOG template
  private generateChangelogTemplate(): string {
    return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project setup

### Changed

### Fixed

### Removed

`;
  }

  // Generate a changelog entry
  private generateChangelogEntry(changedFiles: string[]): string {
    const date = new Date().toISOString().split('T')[0];
    const uniqueDirs = [...new Set(changedFiles.map(f => dirname(f).split('/').slice(-2).join('/')))];

    return `\n### [${date}]\n\n- Updated: ${uniqueDirs.slice(0, 5).join(', ')}${uniqueDirs.length > 5 ? ` (+${uniqueDirs.length - 5} more)` : ''}\n`;
  }

  // Add a pending update
  private addPendingUpdate(update: DocUpdate): void {
    const updates = this.pendingUpdates.get(update.path) || [];
    updates.push(update);
    this.pendingUpdates.set(update.path, updates);
  }

  // Apply an update
  private applyUpdate(update: DocUpdate): void {
    try {
      if (update.type === 'append' && existsSync(update.path)) {
        const content = readFileSync(update.path, 'utf-8');

        // Insert after [Unreleased] section if exists
        const insertPoint = content.indexOf('## [Unreleased]');
        if (insertPoint !== -1) {
          const afterSection = content.indexOf('\n###', insertPoint + 20);
          if (afterSection !== -1) {
            const newContent =
              content.slice(0, afterSection) +
              update.content +
              content.slice(afterSection);
            writeFileSync(update.path, newContent);
            update.applied = true;
            logger.info(`Applied update to: ${update.path}`);
            return;
          }
        }

        // Fallback: append to end
        writeFileSync(update.path, content + update.content);
        update.applied = true;
        logger.info(`Appended update to: ${update.path}`);
      } else if (update.type === 'suggestion') {
        // Don't auto-apply suggestions for new files
        this.emit('create-file-suggestion', update);
      }
    } catch (error) {
      logger.error(`Failed to apply update: ${error}`);
      this.emit('error', { update, error });
    }
  }

  // Get pending updates
  getPendingUpdates(): Map<string, DocUpdate[]> {
    return this.pendingUpdates;
  }

  // Clear pending updates
  clearPendingUpdates(): void {
    this.pendingUpdates.clear();
  }

  // Apply all pending updates
  applyAllPending(): number {
    let applied = 0;

    for (const [_path, updates] of this.pendingUpdates) {
      for (const update of updates) {
        if (!update.applied) {
          this.applyUpdate(update);
          if (update.applied) applied++;
        }
      }
    }

    return applied;
  }
}

// Singleton
let docUpdater: DocAutoUpdater | null = null;

export function getDocUpdater(): DocAutoUpdater {
  if (!docUpdater) {
    docUpdater = new DocAutoUpdater();
  }
  return docUpdater;
}

export function initDocUpdater(projectPath: string, options?: { autoApply?: boolean }): DocAutoUpdater {
  const updater = getDocUpdater();
  updater.start(projectPath, options);
  return updater;
}
