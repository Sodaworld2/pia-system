/**
 * PIA Auto-Healer Module
 * Combines folder watching, AI assessment, and documentation auto-update
 */

export { FolderWatcher, getFolderWatcher, initFolderWatcher } from './folder-watcher.js';
export { AIAssessor, getAIAssessor, initAIAssessor } from './ai-assessor.js';
export { DocAutoUpdater, getDocUpdater, initDocUpdater } from './doc-updater.js';

import { createLogger } from '../utils/logger.js';
import { initFolderWatcher } from './folder-watcher.js';
import { initAIAssessor } from './ai-assessor.js';
import { initDocUpdater } from './doc-updater.js';

const logger = createLogger('AutoHealer');

export interface AutoHealerConfig {
  projectPath: string;
  enableAI?: boolean;
  autoApplyDocs?: boolean;
  watchFolders?: string[];
}

export async function initAutoHealer(config: AutoHealerConfig): Promise<void> {
  logger.info('Initializing Auto-Healer system...');

  // Initialize folder watcher
  const folders = config.watchFolders || [config.projectPath];
  initFolderWatcher(folders);
  logger.info(`Watching ${folders.length} folder(s)`);

  // Initialize AI assessor if enabled
  if (config.enableAI !== false) {
    const assessor = await initAIAssessor();
    const status = assessor.getStatus();

    if (status.available) {
      logger.info(`AI Assessor ready (model: ${status.model})`);
    } else {
      logger.info('AI Assessor not available (Ollama not running)');
    }
  }

  // Initialize documentation auto-updater
  initDocUpdater(config.projectPath, {
    autoApply: config.autoApplyDocs,
  });

  logger.info('Auto-Healer system ready');
}
