// PIA Dashboard Application

// API token - in production, this should be securely managed
const API_TOKEN = localStorage.getItem('pia_token') || 'dev-token-change-in-production';

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
      const stats = await statsRes.json();
      this.updateStats(stats);

      // Load machines
      const machinesRes = await apiFetch('/api/machines');
      const machines = await machinesRes.json();
      machines.forEach(m => this.machines.set(m.id, m));
      this.updateMachineFilter();

      // Load agents
      const agentsRes = await apiFetch('/api/agents');
      const agents = await agentsRes.json();
      agents.forEach(a => this.agents.set(a.id, a));
      this.renderAgents();

      // Load alerts
      const alertsRes = await apiFetch('/api/alerts?unacknowledged=true');
      this.alerts = await alertsRes.json();
      this.renderAlerts();

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
    // TODO: Open detailed view or tunnel to this agent
    console.log('Focus agent:', agent);
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
        payload: { token: 'dev-token-change-in-production' }
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
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app
const app = new PIADashboard();

// Make app globally accessible
window.app = app;
