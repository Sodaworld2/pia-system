/**
 * Browser Agent — Specialized agent session with Playwright MCP
 *
 * Uses the Claude Agent SDK with Playwright MCP server attached,
 * giving the agent browser control capabilities (navigate, click, fill, screenshot).
 *
 * This is a thin wrapper around AgentSessionManager — it spawns a standard
 * SDK session with Playwright MCP pre-configured.
 */

import { getAgentSessionManager, AgentSessionConfig } from '../mission-control/agent-session.js';
import { createLogger } from '../utils/logger.js';
import { resolveFromAppRoot, getAppRoot, getNodeBinary } from '../electron-paths.js';

const logger = createLogger('BrowserAgent');

// Resolve to locally installed @playwright/mcp — no npx, no PATH issues
const PLAYWRIGHT_MCP_CLI = resolveFromAppRoot('node_modules/@playwright/mcp/cli.js');
const PLAYWRIGHT_MCP_CONFIG = resolveFromAppRoot('playwright-mcp.config.json');

const PLAYWRIGHT_MCP_SERVER = {
  name: 'playwright',
  transport: 'stdio' as const,
  // Use getNodeBinary() instead of hardcoded 'node' — in packaged Electron,
  // 'node' may not be on PATH. getNodeBinary() returns process.execPath which
  // is the Electron binary (acts as Node.js with ELECTRON_RUN_AS_NODE=1 env var).
  command: getNodeBinary(),
  args: [PLAYWRIGHT_MCP_CLI, '--config', PLAYWRIGHT_MCP_CONFIG],
};

const BROWSER_SYSTEM_PROMPT = `You are a browser automation agent. You have access to a Playwright MCP server that lets you control a web browser.

Your capabilities:
- Navigate to URLs
- Click elements on pages
- Fill in form fields
- Take screenshots
- Read page content and accessibility snapshots

When given a URL to navigate to, use the browser tools to load the page and report what you see.
When asked to interact with a page, use click/fill/type tools.
Always take a screenshot after significant actions so the user can see the result.

Be concise in your responses. Describe what you see and what actions you took.`;

export interface BrowserTaskOptions {
  url?: string;
  task?: string;
  cwd?: string;
  approvalMode?: 'auto' | 'manual' | 'yolo';
  model?: string;
  maxBudgetUsd?: number;
}

/**
 * Spawn a browser agent session with Playwright MCP pre-configured.
 * Returns the session ID.
 */
export function spawnBrowserAgent(opts: BrowserTaskOptions): string {
  const mgr = getAgentSessionManager();

  const task = opts.task || (opts.url ? `Navigate to ${opts.url} and describe what you see. Take a screenshot.` : '');

  const config: AgentSessionConfig = {
    machineId: 'local',
    mode: 'sdk',
    task,
    cwd: opts.cwd || getAppRoot(),
    approvalMode: opts.approvalMode || 'auto',
    model: opts.model || 'claude-sonnet-4-5-20250929', // Sonnet is fast enough for browser tasks
    maxBudgetUsd: opts.maxBudgetUsd || 2.00,
    systemPrompt: BROWSER_SYSTEM_PROMPT,
    mcpServers: [PLAYWRIGHT_MCP_SERVER],
    maxTurns: 30,
    enableCheckpointing: false, // No file edits to checkpoint
    loadProjectSettings: false, // Browser agent doesn't need project context
  };

  const session = mgr.spawn(config);
  logger.info(`Browser agent spawned: ${session.id} (url: ${opts.url || 'none'})`);
  return session.id;
}
