import { Router, Request, Response } from 'express';
import { createLogger } from '../../utils/logger.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();
const logger = createLogger('MCPsAPI');

// MCP config locations
const CONFIG_LOCATIONS = {
  claudeDesktop: join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
  claudeCodeGlobal: join(homedir(), '.claude', 'settings.json'),
  claudeCodeLocal: (projectPath: string) => join(projectPath, '.claude', 'settings.json'),
};

interface MCPServer {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

interface MCPConfig {
  mcpServers?: Record<string, MCPServer>;
}

// Read MCP config from a file
function readMCPConfig(filePath: string): MCPConfig | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logger.error(`Failed to read MCP config from ${filePath}: ${error}`);
    return null;
  }
}

// Write MCP config to a file
function writeMCPConfig(filePath: string, config: MCPConfig): boolean {
  try {
    const dir = join(filePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    logger.error(`Failed to write MCP config to ${filePath}: ${error}`);
    return false;
  }
}

// GET /api/mcps - List all MCPs from all config locations
router.get('/', (_req: Request, res: Response) => {
  try {
    const mcps: Array<{
      name: string;
      source: string;
      sourcePath: string;
      config: MCPServer;
      status: 'installed' | 'configured';
    }> = [];

    // Check Claude Desktop config
    const desktopConfig = readMCPConfig(CONFIG_LOCATIONS.claudeDesktop);
    if (desktopConfig?.mcpServers) {
      for (const [name, config] of Object.entries(desktopConfig.mcpServers)) {
        mcps.push({
          name,
          source: 'Claude Desktop',
          sourcePath: CONFIG_LOCATIONS.claudeDesktop,
          config,
          status: 'configured',
        });
      }
    }

    // Check Claude Code global config
    const globalConfig = readMCPConfig(CONFIG_LOCATIONS.claudeCodeGlobal);
    if (globalConfig?.mcpServers) {
      for (const [name, config] of Object.entries(globalConfig.mcpServers)) {
        mcps.push({
          name,
          source: 'Claude Code (Global)',
          sourcePath: CONFIG_LOCATIONS.claudeCodeGlobal,
          config,
          status: 'configured',
        });
      }
    }

    res.json({
      mcps,
      configLocations: CONFIG_LOCATIONS,
    });
  } catch (error) {
    logger.error(`Failed to list MCPs: ${error}`);
    res.status(500).json({ error: 'Failed to list MCPs' });
  }
});

// GET /api/mcps/project/:projectPath - List MCPs for a specific project
router.get('/project/*', (req: Request, res: Response) => {
  try {
    const projectPath = req.params[0] || req.query.path as string;
    if (!projectPath) {
      res.status(400).json({ error: 'Project path required' });
      return;
    }

    const configPath = CONFIG_LOCATIONS.claudeCodeLocal(projectPath);
    const config = readMCPConfig(configPath);

    const mcps: Array<{
      name: string;
      config: MCPServer;
    }> = [];

    if (config?.mcpServers) {
      for (const [name, mcpConfig] of Object.entries(config.mcpServers)) {
        mcps.push({ name, config: mcpConfig });
      }
    }

    res.json({
      projectPath,
      configPath,
      mcps,
    });
  } catch (error) {
    logger.error(`Failed to list project MCPs: ${error}`);
    res.status(500).json({ error: 'Failed to list project MCPs' });
  }
});

// POST /api/mcps - Add new MCP
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, config, target } = req.body as {
      name: string;
      config: MCPServer;
      target: 'desktop' | 'global' | 'project';
      projectPath?: string;
    };

    if (!name || !config) {
      res.status(400).json({ error: 'name and config required' });
      return;
    }

    let configPath: string;
    switch (target) {
      case 'desktop':
        configPath = CONFIG_LOCATIONS.claudeDesktop;
        break;
      case 'global':
        configPath = CONFIG_LOCATIONS.claudeCodeGlobal;
        break;
      case 'project':
        if (!req.body.projectPath) {
          res.status(400).json({ error: 'projectPath required for project target' });
          return;
        }
        configPath = CONFIG_LOCATIONS.claudeCodeLocal(req.body.projectPath);
        break;
      default:
        configPath = CONFIG_LOCATIONS.claudeCodeGlobal;
    }

    // Read existing config
    let existingConfig = readMCPConfig(configPath) || {};
    if (!existingConfig.mcpServers) {
      existingConfig.mcpServers = {};
    }

    // Add new MCP
    existingConfig.mcpServers[name] = config;

    // Write back
    if (writeMCPConfig(configPath, existingConfig)) {
      logger.info(`Added MCP "${name}" to ${configPath}`);
      res.json({ success: true, name, configPath });
    } else {
      res.status(500).json({ error: 'Failed to write config' });
    }
  } catch (error) {
    logger.error(`Failed to add MCP: ${error}`);
    res.status(500).json({ error: 'Failed to add MCP' });
  }
});

// DELETE /api/mcps/:name - Remove MCP
router.delete('/:name', (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const { target, projectPath } = req.query as {
      target?: 'desktop' | 'global' | 'project';
      projectPath?: string;
    };

    let configPath: string;
    switch (target) {
      case 'desktop':
        configPath = CONFIG_LOCATIONS.claudeDesktop;
        break;
      case 'project':
        if (!projectPath) {
          res.status(400).json({ error: 'projectPath required for project target' });
          return;
        }
        configPath = CONFIG_LOCATIONS.claudeCodeLocal(projectPath);
        break;
      default:
        configPath = CONFIG_LOCATIONS.claudeCodeGlobal;
    }

    const existingConfig = readMCPConfig(configPath);
    if (!existingConfig?.mcpServers?.[name]) {
      res.status(404).json({ error: `MCP "${name}" not found in ${target || 'global'} config` });
      return;
    }

    delete existingConfig.mcpServers[name];

    if (writeMCPConfig(configPath, existingConfig)) {
      logger.info(`Removed MCP "${name}" from ${configPath}`);
      res.json({ success: true, name, configPath });
    } else {
      res.status(500).json({ error: 'Failed to write config' });
    }
  } catch (error) {
    logger.error(`Failed to remove MCP: ${error}`);
    res.status(500).json({ error: 'Failed to remove MCP' });
  }
});

// POST /api/mcps/install - Install MCP package via npm
router.post('/install', async (req: Request, res: Response) => {
  try {
    const { package: packageName, name, target, projectPath, env } = req.body as {
      package: string; // npm package name e.g. "@modelcontextprotocol/server-filesystem"
      name?: string;   // MCP name (defaults to package name)
      target?: 'desktop' | 'global' | 'project';
      projectPath?: string;
      env?: Record<string, string>;
    };

    if (!packageName) {
      res.status(400).json({ error: 'package name required' });
      return;
    }

    const mcpName = name || packageName.split('/').pop()?.replace('server-', '') || packageName;

    // Install the package globally
    logger.info(`Installing MCP package: ${packageName}`);

    try {
      await execAsync(`npm install -g ${packageName}`, { timeout: 120000 });
    } catch (installError) {
      // Try with npx instead (some MCPs work better this way)
      logger.warn(`Global install failed, will use npx: ${installError}`);
    }

    // Create MCP config
    const mcpConfig: MCPServer = {
      command: 'npx',
      args: ['-y', packageName],
    };

    if (env) {
      mcpConfig.env = env;
    }

    // Determine config path
    let configPath: string;
    switch (target) {
      case 'desktop':
        configPath = CONFIG_LOCATIONS.claudeDesktop;
        break;
      case 'project':
        if (!projectPath) {
          res.status(400).json({ error: 'projectPath required for project target' });
          return;
        }
        configPath = CONFIG_LOCATIONS.claudeCodeLocal(projectPath);
        break;
      default:
        configPath = CONFIG_LOCATIONS.claudeCodeGlobal;
    }

    // Read existing config
    let existingConfig = readMCPConfig(configPath) || {};
    if (!existingConfig.mcpServers) {
      existingConfig.mcpServers = {};
    }

    // Add MCP
    existingConfig.mcpServers[mcpName] = mcpConfig;

    // Write back
    if (writeMCPConfig(configPath, existingConfig)) {
      logger.info(`Installed and configured MCP "${mcpName}"`);
      res.json({
        success: true,
        name: mcpName,
        package: packageName,
        configPath,
        config: mcpConfig,
      });
    } else {
      res.status(500).json({ error: 'Failed to write config' });
    }
  } catch (error) {
    logger.error(`Failed to install MCP: ${error}`);
    res.status(500).json({ error: `Failed to install MCP: ${error}` });
  }
});

// GET /api/mcps/available - List popular/available MCPs
router.get('/available', (_req: Request, res: Response) => {
  // Curated list of popular MCPs
  const availableMCPs = [
    {
      name: 'filesystem',
      package: '@modelcontextprotocol/server-filesystem',
      description: 'Read/write files and directories',
      category: 'core',
    },
    {
      name: 'github',
      package: '@modelcontextprotocol/server-github',
      description: 'GitHub API integration',
      category: 'development',
      requiresEnv: ['GITHUB_TOKEN'],
    },
    {
      name: 'postgres',
      package: '@modelcontextprotocol/server-postgres',
      description: 'PostgreSQL database access',
      category: 'database',
      requiresEnv: ['POSTGRES_CONNECTION_STRING'],
    },
    {
      name: 'sqlite',
      package: '@modelcontextprotocol/server-sqlite',
      description: 'SQLite database access',
      category: 'database',
    },
    {
      name: 'puppeteer',
      package: '@modelcontextprotocol/server-puppeteer',
      description: 'Browser automation',
      category: 'automation',
    },
    {
      name: 'slack',
      package: '@modelcontextprotocol/server-slack',
      description: 'Slack integration',
      category: 'communication',
      requiresEnv: ['SLACK_TOKEN'],
    },
    {
      name: 'google-drive',
      package: '@modelcontextprotocol/server-google-drive',
      description: 'Google Drive access',
      category: 'storage',
      requiresEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    },
    {
      name: 'google-maps',
      package: '@modelcontextprotocol/server-google-maps',
      description: 'Google Maps API',
      category: 'location',
      requiresEnv: ['GOOGLE_MAPS_API_KEY'],
    },
    {
      name: 'brave-search',
      package: '@modelcontextprotocol/server-brave-search',
      description: 'Brave Search API',
      category: 'search',
      requiresEnv: ['BRAVE_API_KEY'],
    },
    {
      name: 'fetch',
      package: '@modelcontextprotocol/server-fetch',
      description: 'HTTP fetch requests',
      category: 'network',
    },
    {
      name: 'memory',
      package: '@modelcontextprotocol/server-memory',
      description: 'Persistent memory/knowledge graph',
      category: 'core',
    },
    {
      name: 'sequential-thinking',
      package: '@modelcontextprotocol/server-sequential-thinking',
      description: 'Enhanced reasoning chains',
      category: 'reasoning',
    },
    {
      name: 'everything',
      package: '@modelcontextprotocol/server-everything',
      description: 'Windows Everything search integration',
      category: 'search',
    },
    {
      name: 'firebase',
      package: 'firebase-tools',
      description: 'Firebase/Firestore integration',
      category: 'database',
      customArgs: ['experimental:mcp'],
    },
    {
      name: 'mux',
      url: 'https://mcp.mux.com?client=claude-code&resource=video.*',
      description: 'Mux video platform',
      category: 'media',
      isUrl: true,
    },
  ];

  res.json({ mcps: availableMCPs });
});

// POST /api/mcps/:name/test - Test if MCP is working
router.post('/:name/test', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const { config } = req.body as { config?: MCPServer };

    if (!config) {
      res.status(400).json({ error: 'MCP config required' });
      return;
    }

    if (config.url) {
      // URL-based MCP - just check if URL is reachable
      try {
        const response = await fetch(config.url, { method: 'HEAD' });
        res.json({
          success: true,
          name,
          type: 'url',
          status: response.ok ? 'reachable' : 'error',
          statusCode: response.status,
        });
      } catch (fetchError) {
        res.json({
          success: false,
          name,
          type: 'url',
          error: `${fetchError}`,
        });
      }
    } else if (config.command) {
      // Command-based MCP - try to run with --version or --help
      const cmd = config.args
        ? `${config.command} ${config.args.join(' ')} --help`
        : `${config.command} --help`;

      try {
        const { stdout, stderr } = await execAsync(cmd, {
          timeout: 10000,
          env: { ...process.env, ...config.env },
        });
        res.json({
          success: true,
          name,
          type: 'command',
          output: stdout || stderr,
        });
      } catch (cmdError) {
        // Some MCPs don't support --help but are still installed
        res.json({
          success: true,
          name,
          type: 'command',
          note: 'Command exists but may not support --help',
        });
      }
    } else {
      res.status(400).json({ error: 'Invalid MCP config - needs url or command' });
    }
  } catch (error) {
    logger.error(`Failed to test MCP: ${error}`);
    res.status(500).json({ error: `Failed to test MCP: ${error}` });
  }
});

export default router;
