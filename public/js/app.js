// PIA Dashboard Application

// API token - in production, this should be securely managed
const API_TOKEN = localStorage.getItem('pia_token') || 'pia-local-dev-token-2024';

// Helper for authenticated fetch
async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Token': API_TOKEN,
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Token expired or invalid - prompt for new one
    const newToken = prompt('Enter API Token:');
    if (newToken) {
      localStorage.setItem('pia_token', newToken);
      location.reload();
    }
  }

  return response;
}

class PIADashboard {
  constructor() {
    this.ws = null;
    this.terminal = null;
    this.fitAddon = null;
    this.currentSession = null;
    this.agents = new Map();
    this.machines = new Map();
    this.alerts = [];
    this.connected = false;

    this.init();
  }

  async init() {
    // Setup navigation
    this.setupNavigation();

    // Load initial data
    await this.loadData();

    // Connect WebSocket
    this.connectWebSocket();

    // Setup terminal
    this.setupTerminal();

    // Setup event listeners
    this.setupEventListeners();

    // Setup MCP event listeners
    this.setupMCPEventListeners();

    // Load MCPs
    await this.loadMCPs();

    // Setup AI event listeners and load AI status
    this.setupAIEventListeners();
    await this.loadAIStatus();

    // Setup Hooks view
    this.setupHooksView();
    await this.loadHookEvents();

    // Setup new module views
    this.setupTasksView();
    this.setupBusView();
    this.setupDoctorView();
    this.setupDelegationView();

    // Start polling for updates
    this.startPolling();
  }

  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        this.switchView(view);
      });
    });
  }

  switchView(view) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    // Update views
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${view}`);
    });

    // Fit terminal when switching to tunnel view
    if (view === 'tunnel' && this.fitAddon) {
      setTimeout(() => this.fitAddon.fit(), 100);
    }
  }

  async loadData() {
    try {
      // Load stats
      const statsRes = await apiFetch('/api/stats');
      if (statsRes.ok) {
        const stats = await statsRes.json();
        this.updateStats(stats);
      }

      // Load machines
      const machinesRes = await apiFetch('/api/machines');
      if (machinesRes.ok) {
        const machines = await machinesRes.json();
        if (Array.isArray(machines)) {
          machines.forEach(m => this.machines.set(m.id, m));
          this.updateMachineFilter();
        }
      }

      // Load agents
      const agentsRes = await apiFetch('/api/agents');
      if (agentsRes.ok) {
        const agents = await agentsRes.json();
        if (Array.isArray(agents)) {
          agents.forEach(a => this.agents.set(a.id, a));
          this.renderAgents();
        }
      }

      // Load alerts
      const alertsRes = await apiFetch('/api/alerts?unacknowledged=true');
      if (alertsRes.ok) {
        const alerts = await alertsRes.json();
        if (Array.isArray(alerts)) {
          this.alerts = alerts;
          this.renderAlerts();
        }
      }

      // Load sessions
      await this.loadSessions();
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  updateStats(stats) {
    document.getElementById('stat-machines').textContent = stats.machines?.online || 0;
    document.getElementById('stat-agents').textContent = stats.agents?.total || 0;
    document.getElementById('stat-working').textContent = stats.agents?.byStatus?.working || 0;

    const alertCount = Object.values(stats.alerts || {}).reduce((a, b) => a + b, 0);
    document.getElementById('stat-alerts').textContent = alertCount;
  }

  updateMachineFilter() {
    const select = document.getElementById('filter-machine');
    select.innerHTML = '<option value="">All Machines</option>';
    this.machines.forEach(m => {
      const option = document.createElement('option');
      option.value = m.id;
      option.textContent = m.name;
      select.appendChild(option);
    });
  }

  renderAgents() {
    const grid = document.getElementById('fleet-grid');
    const empty = document.getElementById('fleet-empty');
    const filterMachine = document.getElementById('filter-machine').value;
    const filterStatus = document.getElementById('filter-status').value;

    // Clear existing tiles (except empty state)
    grid.querySelectorAll('.agent-tile').forEach(t => t.remove());

    // Filter agents
    let filtered = Array.from(this.agents.values());
    if (filterMachine) {
      filtered = filtered.filter(a => a.machine_id === filterMachine);
    }
    if (filterStatus) {
      filtered = filtered.filter(a => a.status === filterStatus);
    }

    // Show/hide empty state
    empty.style.display = filtered.length === 0 ? 'block' : 'none';

    // Render tiles
    filtered.forEach(agent => {
      const tile = this.createAgentTile(agent);
      grid.appendChild(tile);
    });
  }

  createAgentTile(agent) {
    const machine = this.machines.get(agent.machine_id);
    const machineName = machine?.name || 'Unknown';

    const tile = document.createElement('div');
    tile.className = 'agent-tile';
    tile.dataset.agentId = agent.id;
    tile.dataset.status = agent.status;

    const lastOutput = agent.last_output || 'No recent output';
    const truncatedOutput = lastOutput.length > 100
      ? lastOutput.substring(lastOutput.length - 100)
      : lastOutput;

    tile.innerHTML = `
      <div class="agent-header">
        <span class="agent-name">${agent.name}</span>
        <span class="agent-type">${agent.type}</span>
      </div>
      <div class="agent-machine">${machineName}</div>
      <div class="agent-status">
        <span class="status-indicator"></span>
        <span>${agent.status}${agent.current_task ? ': ' + agent.current_task.substring(0, 30) : ''}</span>
      </div>
      <div class="agent-mini-cli"><pre>${this.escapeHtml(truncatedOutput)}</pre></div>
      <div class="agent-progress">
        <div class="progress-bar" style="width: ${agent.progress || 0}%"></div>
      </div>
    `;

    tile.addEventListener('click', () => this.focusAgent(agent));

    return tile;
  }

  focusAgent(agent) {
    // Show agent detail modal
    const machine = this.machines.get(agent.machine_id);
    const machineName = machine?.name || 'Unknown';

    // Create modal if it doesn't exist
    let modal = document.getElementById('agent-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'agent-modal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="modal-agent-name">Agent Details</h2>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body" id="modal-agent-body"></div>
          <div class="modal-footer" id="modal-agent-footer"></div>
        </div>
      `;
      document.body.appendChild(modal);

      // Close handlers
      modal.querySelector('.modal-close').onclick = () => modal.style.display = 'none';
      modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }

    // Populate modal
    document.getElementById('modal-agent-name').textContent = agent.name;
    document.getElementById('modal-agent-body').innerHTML = `
      <div class="agent-detail-grid">
        <div class="detail-row">
          <span class="detail-label">Type:</span>
          <span class="detail-value">${agent.type}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Status:</span>
          <span class="detail-value status-${agent.status}">${agent.status}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Machine:</span>
          <span class="detail-value">${machineName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Current Task:</span>
          <span class="detail-value">${agent.current_task || 'None'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Progress:</span>
          <span class="detail-value">${agent.progress || 0}%</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Context Used:</span>
          <span class="detail-value">${(agent.context_used || 0).toLocaleString()} tokens</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Last Activity:</span>
          <span class="detail-value">${new Date(agent.last_activity * 1000).toLocaleString()}</span>
        </div>
      </div>
      <div class="agent-output-section">
        <h4>Last Output:</h4>
        <pre class="agent-output">${this.escapeHtml(agent.last_output || 'No output yet')}</pre>
      </div>
    `;

    document.getElementById('modal-agent-footer').innerHTML = `
      <button class="btn btn-primary" onclick="app.openAgentTunnel('${agent.id}')">Open Terminal</button>
      <button class="btn btn-secondary" onclick="app.updateAgentTask('${agent.id}')">Assign Task</button>
      <button class="btn btn-danger" onclick="app.deleteAgent('${agent.id}')">Delete Agent</button>
    `;

    modal.style.display = 'flex';
  }

  async openAgentTunnel(agentId) {
    // Close modal and switch to CLI Tunnel view
    document.getElementById('agent-modal').style.display = 'none';
    this.switchView('tunnel');

    // Create a new session with cmd
    try {
      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ shell: 'cmd' }),
      });
      if (res.ok) {
        const session = await res.json();
        if (session.id) {
          // Reload sessions list
          await this.loadSessions();
          // Select and connect to the new session
          this.selectSession(session.id);
          // Focus the terminal
          setTimeout(() => {
            if (this.terminal) {
              this.terminal.focus();
            }
          }, 500);
        }
      } else {
        // If API fails, just click the New Session button
        const newBtn = document.getElementById('btn-new-session');
        if (newBtn) newBtn.click();
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      // Fallback: click New Session button
      const newBtn = document.getElementById('btn-new-session');
      if (newBtn) newBtn.click();
    }
  }

  async updateAgentTask(agentId) {
    const task = prompt('Enter new task for this agent:');
    if (task) {
      try {
        await apiFetch(`/api/agents/${agentId}/task`, {
          method: 'POST',
          body: JSON.stringify({ task }),
        });
        await this.loadData();
        document.getElementById('agent-modal').style.display = 'none';
      } catch (err) {
        console.error('Failed to assign task:', err);
      }
    }
  }

  async deleteAgent(agentId) {
    if (confirm('Are you sure you want to delete this agent?')) {
      try {
        await apiFetch(`/api/agents/${agentId}`, { method: 'DELETE' });
        this.agents.delete(agentId);
        this.renderAgents();
        document.getElementById('agent-modal').style.display = 'none';
      } catch (err) {
        console.error('Failed to delete agent:', err);
      }
    }
  }

  renderAlerts() {
    const list = document.getElementById('alerts-list');
    const empty = document.getElementById('alerts-empty');

    // Clear existing alerts
    list.querySelectorAll('.alert-item').forEach(a => a.remove());

    // Show/hide empty state
    empty.style.display = this.alerts.length === 0 ? 'block' : 'none';

    // Render alerts
    this.alerts.forEach(alert => {
      const item = this.createAlertItem(alert);
      list.appendChild(item);
    });
  }

  createAlertItem(alert) {
    const item = document.createElement('div');
    item.className = 'alert-item';
    item.dataset.type = alert.type;
    item.dataset.alertId = alert.id;

    const icons = {
      agent_stuck: '⏱️',
      agent_error: '❌',
      agent_waiting: '⏸️',
      machine_offline: '🔌',
      resource_high: '📊',
      context_overflow: '💾',
      task_failed: '⚠️',
    };

    const time = new Date(alert.created_at * 1000).toLocaleTimeString();

    item.innerHTML = `
      <span class="alert-icon">${icons[alert.type] || '⚠️'}</span>
      <div class="alert-content">
        <div class="alert-message">${this.escapeHtml(alert.message)}</div>
        <div class="alert-meta">${alert.type} • ${time}</div>
      </div>
      <div class="alert-actions">
        <button class="btn btn-small btn-secondary" onclick="app.acknowledgeAlert(${alert.id})">
          Dismiss
        </button>
      </div>
    `;

    return item;
  }

  async acknowledgeAlert(id) {
    try {
      await apiFetch(`/api/alerts/${id}/ack`, { method: 'POST' });
      this.alerts = this.alerts.filter(a => a.id !== id);
      this.renderAlerts();
      this.loadData(); // Refresh stats
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  }

  connectWebSocket() {
    const wsUrl = `ws://${location.hostname}:3001`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.setConnectionStatus('connected');

      // Authenticate
      this.ws.send(JSON.stringify({
        type: 'auth',
        payload: { token: API_TOKEN }
      }));
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.handleWebSocketMessage(msg);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.setConnectionStatus('disconnected');
      this.connected = false;

      // Reconnect after 3 seconds
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.setConnectionStatus('error');
    };
  }

  handleWebSocketMessage(msg) {
    switch (msg.type) {
      case 'auth':
        this.connected = msg.success;
        if (msg.success) {
          console.log('WebSocket authenticated');
        }
        break;

      case 'output':
        if (msg.sessionId === this.currentSession && this.terminal) {
          this.terminal.write(msg.payload);
        }
        break;

      case 'buffer':
        if (msg.sessionId === this.currentSession && this.terminal) {
          this.terminal.write(msg.payload);
        }
        break;

      case 'agent:update':
        this.handleAgentUpdate(msg.payload);
        break;

      case 'alert':
        this.handleNewAlert(msg.payload);
        break;

      case 'hook_event':
      case 'agent_done':
        this.handleHookEvent(msg.data);
        break;
    }
  }

  handleAgentUpdate(update) {
    const agent = this.agents.get(update.id);
    if (agent) {
      Object.assign(agent, update);
      this.renderAgents();
      this.loadData(); // Refresh stats
    }
  }

  handleNewAlert(alert) {
    this.alerts.unshift(alert);
    this.renderAlerts();
    this.loadData(); // Refresh stats
  }

  setConnectionStatus(status) {
    const el = document.getElementById('connection-status');
    el.className = 'connection-status ' + status;
    el.querySelector('.status-text').textContent =
      status === 'connected' ? 'Connected' :
      status === 'error' ? 'Error' : 'Connecting...';
  }

  setupTerminal() {
    if (typeof Terminal === 'undefined') {
      console.warn('xterm.js not loaded');
      return;
    }

    this.terminal = new Terminal({
      theme: {
        background: '#0a0a15',
        foreground: '#e0e0e0',
        cursor: '#00ff88',
        cursorAccent: '#0a0a15',
        selection: 'rgba(0, 255, 136, 0.3)',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'block',
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.terminal.loadAddon(this.fitAddon);

    this.terminal.open(document.getElementById('terminal'));
    this.fitAddon.fit();

    // Handle input
    this.terminal.onData((data) => {
      if (this.ws && this.connected && this.currentSession) {
        this.ws.send(JSON.stringify({
          type: 'input',
          payload: { sessionId: this.currentSession, data }
        }));
      }
    });

    // Handle resize
    window.addEventListener('resize', () => {
      if (this.fitAddon) {
        this.fitAddon.fit();
        if (this.ws && this.connected && this.currentSession) {
          this.ws.send(JSON.stringify({
            type: 'resize',
            payload: {
              sessionId: this.currentSession,
              cols: this.terminal.cols,
              rows: this.terminal.rows
            }
          }));
        }
      }
    });
  }

  async loadSessions() {
    try {
      const res = await apiFetch('/api/sessions');
      const sessions = await res.json();

      const select = document.getElementById('session-select');
      select.innerHTML = '<option value="">Select Session</option>';

      sessions.forEach(s => {
        const option = document.createElement('option');
        option.value = s.id;
        option.textContent = `${s.command || 'Shell'} (${s.id.substring(0, 8)})`;
        select.appendChild(option);
      });
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  setupEventListeners() {
    // Filter changes
    document.getElementById('filter-machine').addEventListener('change', () => this.renderAgents());
    document.getElementById('filter-status').addEventListener('change', () => this.renderAgents());

    // Session select
    document.getElementById('session-select').addEventListener('change', (e) => {
      this.subscribeToSession(e.target.value);
    });

    // New session button
    document.getElementById('btn-new-session').addEventListener('click', () => this.createNewSession());

    // Acknowledge all alerts
    document.getElementById('btn-ack-all').addEventListener('click', async () => {
      await apiFetch('/api/alerts/ack-all', { method: 'POST' });
      this.alerts = [];
      this.renderAlerts();
      this.loadData();
    });

    // Command Center event listeners
    this.setupCommandCenter();
  }

  subscribeToSession(sessionId) {
    if (!sessionId) {
      this.currentSession = null;
      if (this.terminal) {
        this.terminal.clear();
      }
      return;
    }

    this.currentSession = sessionId;
    if (this.terminal) {
      this.terminal.clear();
    }

    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        payload: { sessionId }
      }));
    }
  }

  async createNewSession() {
    try {
      // Get first machine (or prompt user)
      const machines = Array.from(this.machines.values());
      if (machines.length === 0) {
        alert('No machines registered. Start PIA Local on a machine first.');
        return;
      }

      const machine = machines[0];
      const command = prompt('Command to run:', 'claude');
      if (!command) return;

      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          machine_id: machine.id,
          command,
          cwd: '.'
        })
      });

      if (!res.ok) {
        const error = await res.json();
        alert('Failed to create session: ' + error.error);
        return;
      }

      const session = await res.json();
      await this.loadSessions();
      document.getElementById('session-select').value = session.id;
      this.subscribeToSession(session.id);
      this.switchView('tunnel');
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to create session');
    }
  }

  startPolling() {
    // Poll for updates every 5 seconds
    setInterval(() => this.loadData(), 5000);

    // Poll AI costs every 30 seconds
    setInterval(() => this.loadAIStatus(), 30000);

    // Poll task queue every 10 seconds
    setInterval(() => {
      if (document.getElementById('view-tasks')?.classList.contains('active')) {
        this.loadTasksData();
      }
    }, 10000);

    // Poll doctor every 30 seconds
    setInterval(() => {
      if (document.getElementById('view-doctor')?.classList.contains('active')) {
        this.loadDoctorData();
      }
    }, 30000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============ MCP Management ============

  async loadMCPs() {
    try {
      // Load installed MCPs
      const installedRes = await apiFetch('/api/mcps');
      const installed = await installedRes.json();
      this.renderInstalledMCPs(installed.mcps || []);

      // Load available MCPs
      const availableRes = await apiFetch('/api/mcps/available');
      const available = await availableRes.json();
      this.availableMCPs = available.mcps || [];
      this.renderAvailableMCPs(this.availableMCPs);
    } catch (error) {
      console.error('Failed to load MCPs:', error);
    }
  }

  renderInstalledMCPs(mcps) {
    const grid = document.getElementById('mcp-installed');
    const empty = document.getElementById('mcp-empty');

    // Clear existing cards
    grid.querySelectorAll('.mcp-card').forEach(c => c.remove());

    // Show/hide empty state
    empty.style.display = mcps.length === 0 ? 'block' : 'none';

    // Render cards
    mcps.forEach(mcp => {
      const card = document.createElement('div');
      card.className = 'mcp-card installed';

      const configDisplay = mcp.config.url
        ? `URL: ${mcp.config.url}`
        : `${mcp.config.command} ${(mcp.config.args || []).join(' ')}`;

      card.innerHTML = `
        <div class="mcp-card-header">
          <span class="mcp-name">${this.escapeHtml(mcp.name)}</span>
          <span class="mcp-source">${this.escapeHtml(mcp.source)}</span>
        </div>
        <div class="mcp-config">${this.escapeHtml(configDisplay)}</div>
        ${mcp.config.env ? `<div class="mcp-requires">Env: ${Object.keys(mcp.config.env).join(', ')}</div>` : ''}
        <div class="mcp-actions">
          <button class="btn btn-small btn-secondary" onclick="app.testMCP('${mcp.name}', ${JSON.stringify(mcp.config).replace(/"/g, '&quot;')})">Test</button>
          <button class="btn btn-small btn-secondary" onclick="app.removeMCP('${mcp.name}', '${mcp.source}')">Remove</button>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  renderAvailableMCPs(mcps, category = 'all') {
    const grid = document.getElementById('mcp-available');

    // Clear existing cards
    grid.innerHTML = '';

    // Filter by category
    const filtered = category === 'all'
      ? mcps
      : mcps.filter(m => m.category === category);

    // Render cards
    filtered.forEach(mcp => {
      const card = document.createElement('div');
      card.className = 'mcp-card';

      card.innerHTML = `
        <div class="mcp-card-header">
          <span class="mcp-name">${this.escapeHtml(mcp.name)}</span>
          <span class="mcp-category">${this.escapeHtml(mcp.category)}</span>
        </div>
        <div class="mcp-description">${this.escapeHtml(mcp.description)}</div>
        ${mcp.requiresEnv ? `<div class="mcp-requires">Requires: ${mcp.requiresEnv.join(', ')}</div>` : ''}
        <div class="mcp-actions">
          <button class="btn btn-small btn-primary" onclick="app.quickInstallMCP('${mcp.name}', '${mcp.package || ''}', '${mcp.url || ''}', ${JSON.stringify(mcp.requiresEnv || [])})">
            Install
          </button>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  setupMCPEventListeners() {
    // Refresh button
    document.getElementById('btn-refresh-mcps')?.addEventListener('click', () => this.loadMCPs());

    // Install MCP button (opens modal)
    document.getElementById('btn-install-mcp')?.addEventListener('click', () => {
      document.getElementById('mcp-modal').classList.remove('hidden');
    });

    // Modal close buttons
    document.getElementById('mcp-modal-close')?.addEventListener('click', () => {
      document.getElementById('mcp-modal').classList.add('hidden');
    });

    document.getElementById('mcp-modal-cancel')?.addEventListener('click', () => {
      document.getElementById('mcp-modal').classList.add('hidden');
    });

    // Modal install button
    document.getElementById('mcp-modal-install')?.addEventListener('click', () => this.installMCPFromModal());

    // Category filters
    document.querySelectorAll('.mcp-filter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.mcp-filter').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.renderAvailableMCPs(this.availableMCPs, e.target.dataset.category);
      });
    });

    // Close modal on outside click
    document.getElementById('mcp-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'mcp-modal') {
        e.target.classList.add('hidden');
      }
    });
  }

  async quickInstallMCP(name, packageName, url, requiresEnv) {
    try {
      // If requires env vars, prompt for them
      let env = {};
      if (requiresEnv && requiresEnv.length > 0) {
        for (const envVar of requiresEnv) {
          const value = prompt(`Enter value for ${envVar}:`);
          if (value === null) return; // User cancelled
          env[envVar] = value;
        }
      }

      // URL-based MCP
      if (url) {
        const res = await apiFetch('/api/mcps', {
          method: 'POST',
          body: JSON.stringify({
            name,
            config: { url },
            target: 'global'
          })
        });

        if (!res.ok) {
          const error = await res.json();
          alert('Failed to add MCP: ' + error.error);
          return;
        }

        alert(`MCP "${name}" added successfully!`);
        this.loadMCPs();
        return;
      }

      // Package-based MCP
      const res = await apiFetch('/api/mcps/install', {
        method: 'POST',
        body: JSON.stringify({
          package: packageName,
          name,
          target: 'global',
          env: Object.keys(env).length > 0 ? env : undefined
        })
      });

      if (!res.ok) {
        const error = await res.json();
        alert('Failed to install MCP: ' + error.error);
        return;
      }

      alert(`MCP "${name}" installed successfully!`);
      this.loadMCPs();
    } catch (error) {
      console.error('Failed to install MCP:', error);
      alert('Failed to install MCP');
    }
  }

  async installMCPFromModal() {
    const name = document.getElementById('mcp-name').value.trim();
    const packageName = document.getElementById('mcp-package').value.trim();
    const target = document.getElementById('mcp-target').value;
    const envText = document.getElementById('mcp-env').value.trim();

    if (!name) {
      alert('MCP name is required');
      return;
    }

    if (!packageName) {
      alert('NPM package is required');
      return;
    }

    let env = {};
    if (envText) {
      try {
        env = JSON.parse(envText);
      } catch (e) {
        alert('Invalid JSON in environment variables');
        return;
      }
    }

    try {
      const res = await apiFetch('/api/mcps/install', {
        method: 'POST',
        body: JSON.stringify({
          package: packageName,
          name,
          target,
          env: Object.keys(env).length > 0 ? env : undefined
        })
      });

      if (!res.ok) {
        const error = await res.json();
        alert('Failed to install MCP: ' + error.error);
        return;
      }

      document.getElementById('mcp-modal').classList.add('hidden');
      document.getElementById('mcp-name').value = '';
      document.getElementById('mcp-package').value = '';
      document.getElementById('mcp-env').value = '';

      alert(`MCP "${name}" installed successfully!`);
      this.loadMCPs();
    } catch (error) {
      console.error('Failed to install MCP:', error);
      alert('Failed to install MCP');
    }
  }

  async testMCP(name, config) {
    try {
      const res = await apiFetch(`/api/mcps/${name}/test`, {
        method: 'POST',
        body: JSON.stringify({ config })
      });

      const result = await res.json();
      if (result.success) {
        alert(`MCP "${name}" test passed!\n${result.note || result.output || 'OK'}`);
      } else {
        alert(`MCP "${name}" test failed:\n${result.error}`);
      }
    } catch (error) {
      console.error('Failed to test MCP:', error);
      alert('Failed to test MCP');
    }
  }

  async removeMCP(name, source) {
    if (!confirm(`Remove MCP "${name}" from ${source}?`)) {
      return;
    }

    try {
      const target = source.includes('Desktop') ? 'desktop' : 'global';
      const res = await apiFetch(`/api/mcps/${name}?target=${target}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const error = await res.json();
        alert('Failed to remove MCP: ' + error.error);
        return;
      }

      alert(`MCP "${name}" removed`);
      this.loadMCPs();
    } catch (error) {
      console.error('Failed to remove MCP:', error);
      alert('Failed to remove MCP');
    }
  }

  // ============ AI Management ============

  async loadAIStatus() {
    try {
      // Load AI status
      const statusRes = await apiFetch('/api/ai/status');
      if (statusRes.ok) {
        const status = await statusRes.json();
        this.renderAIProviders(status);
      }

      // Load cost summary
      const costsRes = await apiFetch('/api/ai/costs');
      if (costsRes.ok) {
        const costs = await costsRes.json();
        this.renderAICosts(costs);
      }

      // Load recent usage
      const usageRes = await apiFetch('/api/ai/usage?limit=20');
      if (usageRes.ok) {
        const usage = await usageRes.json();
        this.renderAIUsage(usage);
      }
    } catch (error) {
      console.error('Failed to load AI status:', error);
    }
  }

  renderAIProviders(status) {
    const providers = document.getElementById('ai-providers');
    if (!providers) return;

    const availability = status.availability || {};

    providers.querySelectorAll('.provider-card').forEach(card => {
      const provider = card.dataset.provider;
      const isAvailable = availability[provider] === true;

      card.dataset.status = isAvailable ? 'available' : 'unavailable';
      const statusText = card.querySelector('.status-text');
      if (statusText) {
        statusText.textContent = isAvailable ? 'Available' : 'Not configured';
      }
    });
  }

  renderAICosts(costs) {
    // Update header stat
    const headerCost = document.getElementById('stat-ai-cost');
    if (headerCost) {
      headerCost.textContent = `$${(costs.today || 0).toFixed(2)}`;
    }

    // Update cost cards
    const costToday = document.getElementById('cost-today');
    const costWeek = document.getElementById('cost-week');
    const costMonth = document.getElementById('cost-month');
    const budgetRemaining = document.getElementById('budget-remaining');

    if (costToday) costToday.textContent = `$${(costs.today || 0).toFixed(2)}`;
    if (costWeek) costWeek.textContent = `$${(costs.thisWeek || 0).toFixed(2)}`;
    if (costMonth) costMonth.textContent = `$${(costs.thisMonth || 0).toFixed(2)}`;
    if (budgetRemaining) {
      const remaining = costs.budgetRemaining?.daily || 0;
      budgetRemaining.textContent = `$${remaining.toFixed(2)}`;
      budgetRemaining.style.color = remaining < 2 ? 'var(--accent-warning)' : '';
    }
  }

  renderAIUsage(usage) {
    const tbody = document.getElementById('ai-usage-body');
    if (!tbody) return;

    if (!usage || usage.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No recent AI usage</td></tr>';
      return;
    }

    tbody.innerHTML = usage.map(record => `
      <tr>
        <td>${this.escapeHtml(record.provider)}</td>
        <td>${this.escapeHtml(record.model)}</td>
        <td>${this.escapeHtml(record.taskType)}</td>
        <td>${record.totalTokens?.toLocaleString() || 0}</td>
        <td>$${(record.costUsd || 0).toFixed(4)}</td>
        <td>${record.durationMs}ms</td>
      </tr>
    `).join('');
  }

  setupAIEventListeners() {
    // Refresh AI status button
    document.getElementById('btn-refresh-ai')?.addEventListener('click', () => this.loadAIStatus());

    // Save budget button
    document.getElementById('btn-save-budget')?.addEventListener('click', async () => {
      const daily = parseFloat(document.getElementById('budget-daily')?.value) || 10;
      const monthly = parseFloat(document.getElementById('budget-monthly')?.value) || 100;

      try {
        const res = await apiFetch('/api/ai/budget', {
          method: 'POST',
          body: JSON.stringify({ dailyLimit: daily, monthlyLimit: monthly })
        });

        if (res.ok) {
          alert('Budget saved successfully!');
          this.loadAIStatus();
        } else {
          const error = await res.json();
          alert('Failed to save budget: ' + error.error);
        }
      } catch (error) {
        console.error('Failed to save budget:', error);
        alert('Failed to save budget');
      }
    });
  }

  // ============ Command Center ============

  setupCommandCenter() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send-message');
    const quickActions = document.querySelectorAll('.quick-action');

    // Send message on button click
    sendBtn?.addEventListener('click', () => this.sendChatMessage());

    // Send message on Enter (but Shift+Enter for new line)
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendChatMessage();
      }
    });

    // Quick action buttons
    quickActions.forEach(btn => {
      btn.addEventListener('click', () => {
        const command = btn.dataset.command;
        if (command) {
          chatInput.value = command;
          this.sendChatMessage();
        }
      });
    });

    // Check orchestrator status
    this.checkOrchestratorStatus();
  }

  async checkOrchestratorStatus() {
    const statusEl = document.getElementById('orchestrator-status');
    if (!statusEl) return;

    try {
      const res = await apiFetch('/api/orchestrator/status');
      if (res.ok) {
        const data = await res.json();
        statusEl.className = 'connection-status connected';
        statusEl.querySelector('.status-text').textContent = `Online - ${data.instances?.length || 0} instances`;
      } else {
        statusEl.className = 'connection-status error';
        statusEl.querySelector('.status-text').textContent = 'Offline';
      }
    } catch (error) {
      statusEl.className = 'connection-status error';
      statusEl.querySelector('.status-text').textContent = 'Offline';
    }
  }

  async sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput?.value?.trim();

    if (!message) return;

    // Add user message to chat
    this.addChatMessage(message, 'user');
    chatInput.value = '';

    // Show typing indicator
    const typingId = this.addTypingIndicator();

    try {
      const res = await apiFetch('/api/orchestrator/message', {
        method: 'POST',
        body: JSON.stringify({ message })
      });

      // Remove typing indicator
      this.removeTypingIndicator(typingId);

      if (res.ok) {
        const data = await res.json();
        this.addChatMessage(data.response || 'No response', 'assistant');
        this.checkOrchestratorStatus(); // Refresh status
      } else {
        const error = await res.json();
        this.addChatMessage(`Error: ${error.error || 'Unknown error'}`, 'assistant');
      }
    } catch (error) {
      this.removeTypingIndicator(typingId);
      this.addChatMessage(`Connection error: ${error.message}`, 'assistant');
    }
  }

  addChatMessage(content, type) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${type}`;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageEl.innerHTML = `
      <div class="message-content">${this.escapeHtml(content)}</div>
      <span class="message-time">${timeStr}</span>
    `;

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  addTypingIndicator() {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return null;

    const id = 'typing-' + Date.now();
    const typingEl = document.createElement('div');
    typingEl.id = id;
    typingEl.className = 'chat-message assistant typing-indicator';
    typingEl.innerHTML = '<span></span><span></span><span></span>';

    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return id;
  }

  removeTypingIndicator(id) {
    if (!id) return;
    const el = document.getElementById(id);
    el?.remove();
  }

  // ===== Hooks View =====
  setupHooksView() {
    const refreshBtn = document.getElementById('btn-refresh-hooks');
    const clearBtn = document.getElementById('btn-clear-hooks');
    const filterType = document.getElementById('hooks-filter-type');

    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadHookEvents());
    if (clearBtn) clearBtn.addEventListener('click', () => {
      document.getElementById('hooks-feed').innerHTML = '';
      this.hookEvents = [];
      this.updateHooksStats();
    });
    if (filterType) filterType.addEventListener('change', () => this.renderHookEvents());

    this.hookEvents = [];
    this.hooksPollInterval = setInterval(() => {
      const hooksView = document.getElementById('view-hooks');
      if (hooksView && hooksView.classList.contains('active')) {
        this.loadHookEvents();
      }
    }, 3000);
  }

  async loadHookEvents() {
    try {
      const response = await fetch('/api/hooks/events?limit=100', {
        headers: { 'Authorization': `Bearer ${this.apiToken}` }
      });
      if (!response.ok) return;
      const events = await response.json();
      this.hookEvents = events.reverse();
      this.renderHookEvents();
      this.updateHooksStats();
    } catch (err) {
      console.warn('Failed to load hook events:', err);
    }
  }

  renderHookEvents() {
    const feed = document.getElementById('hooks-feed');
    const filterType = document.getElementById('hooks-filter-type');
    if (!feed) return;

    const filter = filterType?.value || '';
    let events = this.hookEvents || [];
    if (filter) {
      events = events.filter(e => e.event_type === filter);
    }

    if (events.length === 0) {
      feed.innerHTML = `<div class="empty-state"><p>No hook events yet</p><p class="text-muted">Events will appear here when Claude Code hooks fire</p></div>`;
      return;
    }

    feed.innerHTML = events.map(event => {
      const isBlocked = event.status === 'blocked';
      const isDone = event.event_type === 'agent_done';
      const badgeClass = isBlocked ? 'blocked' : event.event_type;
      const eventClass = isBlocked ? 'blocked' : isDone ? 'done' : '';
      const time = new Date(event.created_at * 1000).toLocaleTimeString();
      const sessionShort = (event.session_id || 'unknown').slice(0, 12);

      let detail = '';
      if (event.tool_input) {
        try {
          const parsed = JSON.parse(event.tool_input);
          if (parsed.command) detail = parsed.command;
          else if (parsed.file_path) detail = parsed.file_path;
          else if (parsed.pattern) detail = `grep: ${parsed.pattern}`;
          else detail = event.tool_input.slice(0, 120);
        } catch {
          detail = event.tool_input.slice(0, 120);
        }
      }

      return `
        <div class="hook-event ${eventClass}">
          <span class="hook-event-badge ${badgeClass}">${isBlocked ? 'BLOCKED' : event.event_type}</span>
          <div class="hook-event-body">
            <div class="hook-event-header">
              <span class="hook-event-tool">${event.tool_name || event.event_type}</span>
              <span class="hook-event-time">${time}</span>
            </div>
            <div class="hook-event-session">session: ${sessionShort}</div>
            ${detail ? `<div class="hook-event-detail">${this.escapeHtml(detail)}</div>` : ''}
            ${event.message ? `<div class="hook-event-message">${this.escapeHtml(event.message)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  updateHooksStats() {
    const events = this.hookEvents || [];
    const totalEl = document.getElementById('hooks-total');
    const blockedEl = document.getElementById('hooks-blocked');
    const completionsEl = document.getElementById('hooks-completions');
    const lastEventEl = document.getElementById('hooks-last-event');

    if (totalEl) totalEl.textContent = events.length;
    if (blockedEl) blockedEl.textContent = events.filter(e => e.status === 'blocked').length;
    if (completionsEl) completionsEl.textContent = events.filter(e => e.event_type === 'agent_done').length;
    if (lastEventEl && events.length > 0) {
      const last = events[events.length - 1];
      const ago = Math.round((Date.now() / 1000) - last.created_at);
      lastEventEl.textContent = ago < 60 ? `${ago}s ago` : ago < 3600 ? `${Math.round(ago/60)}m ago` : `${Math.round(ago/3600)}h ago`;
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  handleHookEvent(event) {
    if (!this.hookEvents) this.hookEvents = [];
    this.hookEvents.push(event);
    const hooksView = document.getElementById('view-hooks');
    if (hooksView && hooksView.classList.contains('active')) {
      this.renderHookEvents();
      this.updateHooksStats();
    }
  }

  // ============ Task Queue View ============

  setupTasksView() {
    document.getElementById('btn-add-task')?.addEventListener('click', () => {
      document.getElementById('task-modal')?.classList.remove('hidden');
    });
    document.getElementById('task-modal-close')?.addEventListener('click', () => {
      document.getElementById('task-modal')?.classList.add('hidden');
    });
    document.getElementById('task-modal-cancel')?.addEventListener('click', () => {
      document.getElementById('task-modal')?.classList.add('hidden');
    });
    document.getElementById('task-modal-submit')?.addEventListener('click', () => this.addTask());
    document.getElementById('tasks-filter')?.addEventListener('change', () => this.loadTasksData());
    document.getElementById('btn-engine-toggle')?.addEventListener('click', () => this.toggleEngine());
    this.loadTasksData();
  }

  async loadTasksData() {
    try {
      const filter = document.getElementById('tasks-filter')?.value || '';
      const url = filter ? `/api/tasks?status=${filter}` : '/api/tasks';
      const [tasksRes, statsRes, engineRes] = await Promise.all([
        apiFetch(url),
        apiFetch('/api/tasks/stats'),
        apiFetch('/api/tasks/engine/stats'),
      ]);

      if (statsRes.ok) {
        const stats = await statsRes.json();
        document.getElementById('tasks-total').textContent = stats.total || 0;
        document.getElementById('tasks-pending').textContent = stats.pending || 0;
        document.getElementById('tasks-in-progress').textContent = stats.inProgress || 0;
        document.getElementById('tasks-completed').textContent = stats.completed || 0;
        document.getElementById('tasks-failed').textContent = stats.failed || 0;
      }

      if (engineRes.ok) {
        const engine = await engineRes.json();
        const dot = document.getElementById('engine-dot');
        const text = document.getElementById('engine-status-text');
        const btn = document.getElementById('btn-engine-toggle');
        if (engine.running) {
          dot?.classList.add('online');
          text.textContent = 'Engine: Running';
          btn.textContent = 'Stop Engine';
          btn.classList.remove('btn-primary');
          btn.classList.add('btn-secondary');
        } else {
          dot?.classList.remove('online');
          text.textContent = 'Engine: Stopped';
          btn.textContent = 'Start Engine';
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-primary');
        }
        document.getElementById('engine-processed').textContent = engine.tasksProcessed || 0;
        document.getElementById('engine-active').textContent = engine.activeTasks || 0;
        document.getElementById('engine-cost').textContent = (engine.totalCost || 0).toFixed(2);
      }

      if (tasksRes.ok) {
        const tasks = await tasksRes.json();
        this.renderTasks(Array.isArray(tasks) ? tasks : []);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }

  renderTasks(tasks) {
    const list = document.getElementById('tasks-list');
    const empty = document.getElementById('tasks-empty');
    if (!list) return;

    list.querySelectorAll('.task-item').forEach(el => el.remove());

    if (tasks.length === 0) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    tasks.slice(0, 50).forEach(task => {
      const el = document.createElement('div');
      el.className = `task-item task-${task.status}`;
      const priorityStars = '★'.repeat(task.priority || 3) + '☆'.repeat(5 - (task.priority || 3));
      el.innerHTML = `
        <div class="task-header">
          <span class="task-title">${this.escapeHtml(task.title)}</span>
          <span class="task-status badge badge-${task.status}">${task.status}</span>
        </div>
        <div class="task-meta">
          <span class="task-priority">${priorityStars}</span>
          ${task.agent_id ? `<span class="task-agent">Agent: ${task.agent_id.substring(0,8)}</span>` : ''}
          ${task.output ? `<div class="task-output">${this.escapeHtml(task.output.substring(0, 200))}</div>` : ''}
        </div>
      `;
      list.appendChild(el);
    });
  }

  async addTask() {
    const title = document.getElementById('task-title')?.value;
    const description = document.getElementById('task-description')?.value;
    const priority = parseInt(document.getElementById('task-priority')?.value) || 3;

    if (!title) return alert('Title is required');

    try {
      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title, description, priority }),
      });
      if (res.ok) {
        document.getElementById('task-modal')?.classList.add('hidden');
        document.getElementById('task-title').value = '';
        document.getElementById('task-description').value = '';
        this.loadTasksData();
      }
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  }

  async toggleEngine() {
    try {
      const res = await apiFetch('/api/tasks/engine/stats');
      const stats = await res.json();
      const endpoint = stats.running ? '/api/tasks/engine/stop' : '/api/tasks/engine/start';
      await apiFetch(endpoint, { method: 'POST' });
      this.loadTasksData();
    } catch (err) {
      console.error('Failed to toggle engine:', err);
    }
  }

  // ============ Agent Bus View ============

  setupBusView() {
    document.getElementById('btn-refresh-bus')?.addEventListener('click', () => this.loadBusData());
    document.getElementById('btn-bus-send')?.addEventListener('click', () => this.sendBusMessage());
    this.loadBusData();
  }

  async loadBusData() {
    try {
      const res = await apiFetch('/api/messages/stats');
      if (res.ok) {
        const stats = await res.json();
        document.getElementById('bus-total').textContent = stats.totalMessages || 0;
        document.getElementById('bus-subscribers').textContent = stats.activeSubscribers || 0;
        document.getElementById('bus-inboxes').textContent = stats.agentInboxes || 0;
      }
    } catch (err) {
      console.error('Failed to load bus data:', err);
    }
  }

  async sendBusMessage() {
    const from = document.getElementById('bus-from')?.value || 'dashboard';
    const to = document.getElementById('bus-to')?.value;
    const content = document.getElementById('bus-content')?.value;

    if (!to || !content) return alert('To and content are required');

    try {
      const endpoint = to === '*' ? '/api/messages/broadcast' : '/api/messages/send';
      const body = to === '*'
        ? { from, content }
        : { from, to, content };
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
      document.getElementById('bus-content').value = '';
      this.loadBusData();
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  // ============ Doctor View ============

  setupDoctorView() {
    document.getElementById('btn-doctor-check')?.addEventListener('click', () => this.runDoctorCheck());
    document.getElementById('btn-refresh-doctor')?.addEventListener('click', () => this.loadDoctorData());
    this.loadDoctorData();
  }

  async loadDoctorData() {
    try {
      const res = await apiFetch('/api/doctor/health');
      if (res.ok) {
        const data = await res.json();
        if (data.agents) {
          document.getElementById('doc-agents-total').textContent = data.agents.total || 0;
          document.getElementById('doc-agents-healthy').textContent = data.agents.healthy || 0;
          document.getElementById('doc-agents-stuck').textContent = data.agents.stuck || 0;
          document.getElementById('doc-agents-errored').textContent = data.agents.errored || 0;
        }
        if (data.machines) {
          document.getElementById('doc-machines-total').textContent = data.machines.total || 0;
          document.getElementById('doc-machines-online').textContent = data.machines.online || 0;
          document.getElementById('doc-machines-offline').textContent = data.machines.offline || 0;
        }
        if (data.actions && data.actions.length > 0) {
          this.renderDoctorActions(data.actions);
        }
      }
    } catch (err) {
      console.error('Failed to load doctor data:', err);
    }
  }

  renderDoctorActions(actions) {
    const container = document.getElementById('doctor-actions');
    if (!container) return;
    container.innerHTML = '';

    actions.slice(0, 30).forEach(action => {
      const el = document.createElement('div');
      el.className = `doctor-action ${action.success ? 'success' : 'failed'}`;
      const time = new Date(action.timestamp * 1000).toLocaleTimeString();
      el.innerHTML = `
        <span class="action-type badge badge-${action.type}">${action.type}</span>
        <span class="action-target">${this.escapeHtml(action.targetName)}</span>
        <span class="action-reason">${this.escapeHtml(action.reason)}</span>
        <span class="action-time">${time}</span>
        <span class="action-result">${action.success ? 'OK' : 'FAIL'}</span>
      `;
      container.appendChild(el);
    });
  }

  async runDoctorCheck() {
    try {
      await apiFetch('/api/doctor/check', { method: 'POST' });
      this.loadDoctorData();
    } catch (err) {
      console.error('Failed to run doctor check:', err);
    }
  }

  // ============ Delegation View ============

  setupDelegationView() {
    document.getElementById('btn-refresh-delegation')?.addEventListener('click', () => this.loadDelegationData());
    this.loadDelegationData();
  }

  async loadDelegationData() {
    try {
      const [rulesRes, tiersRes] = await Promise.all([
        apiFetch('/api/delegation/rules'),
        apiFetch('/api/delegation/cost-status'),
      ]);

      if (rulesRes.ok) {
        const rules = await rulesRes.json();
        this.renderDelegationRules(Array.isArray(rules) ? rules : []);
      }

      if (tiersRes.ok) {
        const tiers = await tiersRes.json();
        this.renderCostTiers(Array.isArray(tiers) ? tiers : []);
      }
    } catch (err) {
      console.error('Failed to load delegation data:', err);
    }
  }

  renderDelegationRules(rules) {
    const container = document.getElementById('delegation-rules');
    if (!container) return;
    container.innerHTML = '';

    rules.forEach(rule => {
      const el = document.createElement('div');
      el.className = 'delegation-rule';
      el.innerHTML = `
        <div class="rule-header"><strong>${this.escapeHtml(rule.name)}</strong></div>
        <div class="rule-description">${this.escapeHtml(rule.description)}</div>
      `;
      container.appendChild(el);
    });

    if (rules.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No delegation rules configured</p></div>';
    }
  }

  renderCostTiers(tiers) {
    const container = document.getElementById('delegation-tiers');
    if (!container) return;
    container.innerHTML = '';

    tiers.forEach(tier => {
      const el = document.createElement('div');
      el.className = `tier-card ${tier.available ? 'available' : 'unavailable'}`;
      el.innerHTML = `
        <div class="tier-header">
          <span class="tier-name">${this.escapeHtml(tier.provider)}/${this.escapeHtml(tier.model)}</span>
          <span class="tier-label badge badge-${tier.tier}">${tier.tier.toUpperCase()}</span>
        </div>
        <div class="tier-cost">${tier.costLabel}</div>
        <div class="tier-status">${tier.available ? 'Available' : 'Not Available'}</div>
      `;
      container.appendChild(el);
    });
  }
}

// Initialize app
const app = new PIADashboard();

// Make app globally accessible
window.app = app;
