/**
 * Fisher2050 Dashboard — Frontend Application
 */

const API = '';
const PIA_URL = 'http://localhost:3000';

// ---------------------------------------------------------------------------
// View Management
// ---------------------------------------------------------------------------

function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${viewName}`).classList.add('active');
  document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

  // Load data for the view
  switch (viewName) {
    case 'dashboard': loadDashboard(); break;
    case 'projects': loadProjects(); break;
    case 'tasks': loadTasks(); break;
    case 'meetings': loadMeetings(); break;
    case 'souls': loadSouls(); break;
    case 'scheduler': loadScheduler(); break;
    case 'reports': loadReports(); break;
  }
}

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

async function piaApi(path, options = {}) {
  const token = 'dev-token-change-in-production'; // Will be configured
  const res = await fetch(`${PIA_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-API-Token': token, ...options.headers },
  });
  if (!res.ok) throw new Error(`PIA API error: ${res.status}`);
  return res.json();
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(ts) {
  const seconds = Math.floor(Date.now() / 1000) - ts;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function loadDashboard() {
  try {
    const stats = await api('/api/stats');
    document.getElementById('stat-projects').textContent = stats.projects;
    document.getElementById('stat-overdue').textContent = stats.tasks.overdue;
    document.getElementById('stat-pending').textContent = stats.tasks.pending;
    document.getElementById('stat-meetings').textContent = stats.meetings.upcoming;

    // Health score
    const total = stats.tasks.pending + stats.tasks.inProgress;
    const health = total > 0 ? Math.max(0, 100 - (stats.tasks.overdue / total * 100)) : 100;
    const el = document.getElementById('health-score');
    el.textContent = `${Math.round(health)}%`;
    el.style.color = health >= 70 ? 'var(--green)' : health >= 40 ? 'var(--yellow)' : 'var(--red)';
  } catch (e) {
    console.error('Failed to load stats:', e);
  }

  // Activity feed
  try {
    const activities = await api('/api/reports/activity/log?limit=10');
    const feed = document.getElementById('activity-feed');
    if (activities.length === 0) {
      feed.innerHTML = '<div class="empty-state">No activity yet.</div>';
    } else {
      feed.innerHTML = activities.map(a => `
        <div class="activity-item">
          <span class="activity-action">${a.action.replace(/_/g, ' ')}</span>
          ${a.details ? `— ${a.details}` : ''}
          <div class="activity-time">${timeAgo(a.created_at)}</div>
        </div>
      `).join('');
    }
  } catch (e) {
    document.getElementById('activity-feed').innerHTML = '<div class="empty-state">Failed to load activity.</div>';
  }

  // Latest report
  try {
    const reports = await api('/api/reports?limit=1');
    if (reports.length > 0) {
      document.getElementById('latest-report').textContent = reports[0].content;
    }
  } catch (e) { /* ignore */ }

  // PIA connection
  checkPiaConnection();
}

async function checkPiaConnection() {
  const el = document.getElementById('pia-status');
  try {
    const health = await fetch(`${PIA_URL}/api/health`).then(r => r.json());
    el.textContent = `PIA: ${health.status}`;
    el.style.color = 'var(--green)';
  } catch {
    el.textContent = 'PIA: offline';
    el.style.color = 'var(--red)';
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

async function loadProjects() {
  try {
    const projects = await api('/api/projects?status=all');
    const list = document.getElementById('projects-list');
    if (projects.length === 0) {
      list.innerHTML = '<div class="empty-state">No projects yet. Create one!</div>';
      return;
    }
    list.innerHTML = projects.map(p => `
      <div class="list-item">
        <div class="list-item-header">
          <span class="list-item-title">${p.name}</span>
          <span class="status status-${p.status}">${p.status}</span>
        </div>
        <div class="list-item-body">
          ${p.description || 'No description'}
          ${p.github_repo ? `<br>GitHub: ${p.github_repo}` : ''}
        </div>
        <div class="list-item-meta" style="margin-top:8px">
          Created ${formatDate(p.created_at)} · Updated ${timeAgo(p.updated_at)}
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('projects-list').innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

function showCreateProject() {
  openModal('New Project', `
    <div class="form-group">
      <label>Project Name</label>
      <input type="text" id="project-name" placeholder="My Project">
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="project-desc" placeholder="What's this project about?"></textarea>
    </div>
    <div class="form-group">
      <label>GitHub Repo (optional)</label>
      <input type="text" id="project-repo" placeholder="owner/repo">
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModalForce()">Cancel</button>
      <button class="btn-primary" onclick="createProject()">Create Project</button>
    </div>
  `);
}

async function createProject() {
  try {
    const name = document.getElementById('project-name').value;
    const description = document.getElementById('project-desc').value;
    const github_repo = document.getElementById('project-repo').value;
    if (!name) return alert('Name is required');
    await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description, github_repo: github_repo || undefined }),
    });
    closeModalForce();
    loadProjects();
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

async function loadTasks() {
  try {
    const status = document.getElementById('task-filter-status')?.value;
    let url = '/api/tasks';
    if (status) url += `?status=${status}`;
    const tasks = await api(url);
    const list = document.getElementById('tasks-list');
    if (tasks.length === 0) {
      list.innerHTML = '<div class="empty-state">No tasks found.</div>';
      return;
    }
    list.innerHTML = tasks.map(t => `
      <div class="list-item priority-${t.priority}">
        <div class="list-item-header">
          <span class="list-item-title">${t.title}</span>
          <span class="status status-${t.status}">${t.status}</span>
        </div>
        <div class="list-item-body">${t.description || ''}</div>
        <div class="list-item-meta" style="margin-top:8px">
          Priority: ${t.priority} · ${t.assigned_to ? `Assigned: ${t.assigned_to}` : 'Unassigned'}
          ${t.due_date ? ` · Due: ${formatDate(t.due_date)}` : ''}
          · Created ${timeAgo(t.created_at)}
          <button class="btn-secondary" style="margin-left:8px" onclick="updateTaskStatus('${t.id}', 'completed')">Complete</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('tasks-list').innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

function showCreateTask() {
  openModal('New Task', `
    <div class="form-group">
      <label>Title</label>
      <input type="text" id="task-title" placeholder="Task title">
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="task-desc" placeholder="What needs to be done?"></textarea>
    </div>
    <div class="form-group">
      <label>Priority (1=Critical, 5=Low)</label>
      <select id="task-priority">
        <option value="1">1 - Critical</option>
        <option value="2">2 - High</option>
        <option value="3" selected>3 - Normal</option>
        <option value="4">4 - Low</option>
        <option value="5">5 - Minor</option>
      </select>
    </div>
    <div class="form-group">
      <label>Assigned To</label>
      <input type="text" id="task-assigned" placeholder="Person or agent name">
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModalForce()">Cancel</button>
      <button class="btn-primary" onclick="createTask()">Create Task</button>
    </div>
  `);
}

async function createTask() {
  try {
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-desc').value;
    const priority = parseInt(document.getElementById('task-priority').value);
    const assigned_to = document.getElementById('task-assigned').value;
    if (!title) return alert('Title is required');
    await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, description, priority, assigned_to: assigned_to || undefined }),
    });
    closeModalForce();
    loadTasks();
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

async function updateTaskStatus(id, status) {
  try {
    await api(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    loadTasks();
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

async function loadMeetings() {
  try {
    const meetings = await api('/api/meetings');
    const list = document.getElementById('meetings-list');
    if (meetings.length === 0) {
      list.innerHTML = '<div class="empty-state">No meetings yet.</div>';
      return;
    }
    list.innerHTML = meetings.map(m => `
      <div class="list-item">
        <div class="list-item-header">
          <span class="list-item-title">${m.title}</span>
          <span class="status status-${m.status}">${m.status}</span>
        </div>
        <div class="list-item-body">
          ${m.scheduled_at ? `Scheduled: ${formatDateTime(m.scheduled_at)}` : 'No date set'}
          · ${m.duration_minutes}min
          ${m.attendees && m.attendees.length > 0 ? `<br>Attendees: ${m.attendees.join(', ')}` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('meetings-list').innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

function showCreateMeeting() {
  openModal('New Meeting', `
    <div class="form-group">
      <label>Title</label>
      <input type="text" id="meeting-title" placeholder="Meeting title">
    </div>
    <div class="form-group">
      <label>Agenda</label>
      <textarea id="meeting-agenda" placeholder="What to discuss"></textarea>
    </div>
    <div class="form-group">
      <label>Scheduled At</label>
      <input type="datetime-local" id="meeting-date">
    </div>
    <div class="form-group">
      <label>Duration (minutes)</label>
      <input type="number" id="meeting-duration" value="30">
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModalForce()">Cancel</button>
      <button class="btn-primary" onclick="createMeeting()">Create Meeting</button>
    </div>
  `);
}

async function createMeeting() {
  try {
    const title = document.getElementById('meeting-title').value;
    const agenda = document.getElementById('meeting-agenda').value;
    const dateStr = document.getElementById('meeting-date').value;
    const duration_minutes = parseInt(document.getElementById('meeting-duration').value) || 30;
    if (!title) return alert('Title is required');
    const scheduled_at = dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : null;
    await api('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({ title, agenda, scheduled_at, duration_minutes }),
    });
    closeModalForce();
    loadMeetings();
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Souls (from PIA)
// ---------------------------------------------------------------------------

async function loadSouls() {
  try {
    const souls = await piaApi('/api/souls');
    const grid = document.getElementById('souls-list');
    if (souls.length === 0) {
      grid.innerHTML = '<div class="empty-state">No souls found in PIA.</div>';
      return;
    }
    grid.innerHTML = souls.map(s => `
      <div class="soul-card">
        <div class="soul-card-header">
          <div>
            <div class="soul-name">${s.name}</div>
            <div class="soul-role">${s.role}</div>
            ${s.email ? `<div class="soul-email">${s.email}</div>` : ''}
          </div>
          <span class="status status-${s.status}">${s.status}</span>
        </div>
        <div class="soul-section">
          <h4>Goals</h4>
          <ul>${(s.goals || []).map(g => `<li>${g}</li>`).join('')}</ul>
        </div>
        <div class="soul-section">
          <h4>Relationships</h4>
          <ul>${Object.entries(s.relationships || {}).map(([k,v]) => `<li><strong>${k}:</strong> ${v}`).join('')}</ul>
        </div>
        <div style="margin-top:12px; display:flex; gap:8px">
          <button class="btn-secondary" onclick="viewSoulMemories('${s.id}')">Memories</button>
          <button class="btn-secondary" onclick="viewSoulPrompt('${s.id}')">System Prompt</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('souls-list').innerHTML = `<div class="empty-state">Cannot connect to PIA: ${e.message}</div>`;
  }
}

async function viewSoulMemories(soulId) {
  try {
    const memories = await piaApi(`/api/souls/${soulId}/memories?limit=20`);
    const content = memories.length === 0
      ? 'No memories yet.'
      : memories.map(m => `[${m.category}] (importance: ${m.importance}) ${m.content}\n— ${timeAgo(m.created_at)}`).join('\n\n');
    openModal(`Memories: ${soulId}`, `<pre style="white-space:pre-wrap; font-size:13px; color:var(--text-dim)">${content}</pre>`);
  } catch (e) {
    openModal('Error', `<p>Failed to load memories: ${e.message}</p>`);
  }
}

async function viewSoulPrompt(soulId) {
  try {
    const { prompt } = await piaApi(`/api/souls/${soulId}/prompt`);
    openModal(`System Prompt: ${soulId}`, `<pre style="white-space:pre-wrap; font-size:13px; color:var(--text-dim)">${prompt}</pre>`);
  } catch (e) {
    openModal('Error', `<p>Failed to load prompt: ${e.message}</p>`);
  }
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

async function loadScheduler() {
  try {
    const jobs = await api('/api/scheduler/jobs');
    const list = document.getElementById('scheduler-list');
    if (jobs.length === 0) {
      list.innerHTML = '<div class="empty-state">No scheduled jobs.</div>';
      return;
    }
    list.innerHTML = jobs.map(j => `
      <div class="list-item">
        <div class="list-item-header">
          <span class="list-item-title">${j.name}</span>
          <span class="status ${j.enabled ? 'status-active' : 'status-paused'}">${j.enabled ? 'enabled' : 'disabled'}</span>
        </div>
        <div class="list-item-body">
          <strong>Cron:</strong> ${j.cron_expression}<br>
          <strong>Soul:</strong> ${j.soul_id || 'none'}<br>
          ${j.task_description}
        </div>
        <div class="list-item-meta" style="margin-top:8px">
          ${j.last_run ? `Last run: ${timeAgo(j.last_run)}` : 'Never run'}
        </div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('scheduler-list').innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

function showCreateJob() {
  openModal('New Scheduled Job', `
    <div class="form-group">
      <label>Name</label>
      <input type="text" id="job-name" placeholder="Job name">
    </div>
    <div class="form-group">
      <label>Cron Expression</label>
      <input type="text" id="job-cron" placeholder="0 9 * * * (9am daily)">
    </div>
    <div class="form-group">
      <label>Task Description</label>
      <textarea id="job-task" placeholder="What should the agent do?"></textarea>
    </div>
    <div class="form-group">
      <label>Soul ID</label>
      <select id="job-soul">
        <option value="">None</option>
        <option value="fisher2050">Fisher2050</option>
        <option value="ziggi">Ziggi</option>
        <option value="eliyahu">Eliyahu</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModalForce()">Cancel</button>
      <button class="btn-primary" onclick="createJob()">Create Job</button>
    </div>
  `);
}

async function createJob() {
  try {
    const name = document.getElementById('job-name').value;
    const cron_expression = document.getElementById('job-cron').value;
    const task_description = document.getElementById('job-task').value;
    const soul_id = document.getElementById('job-soul').value;
    if (!name || !cron_expression || !task_description) return alert('All fields required');
    await api('/api/scheduler/jobs', {
      method: 'POST',
      body: JSON.stringify({ name, cron_expression, task_description, soul_id: soul_id || undefined }),
    });
    closeModalForce();
    loadScheduler();
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

async function loadReports() {
  try {
    const reports = await api('/api/reports?limit=10');
    const list = document.getElementById('reports-list');
    if (reports.length === 0) {
      list.innerHTML = '<div class="empty-state">No reports yet. Generate one!</div>';
      return;
    }
    list.innerHTML = reports.map(r => `
      <div class="list-item">
        <div class="list-item-header">
          <span class="list-item-title">${r.title}</span>
          <span class="status status-${r.type}">${r.type}</span>
        </div>
        <div class="list-item-body report-content">${r.content}</div>
        <div class="list-item-meta" style="margin-top:8px">${formatDateTime(r.created_at)}</div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('reports-list').innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

async function generateReport() {
  try {
    const result = await api('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ type: 'daily' }),
    });
    alert('Report generated!');
    loadDashboard();
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}

async function triggerReview() {
  const projectDir = prompt('Enter project directory path for Ziggi review:', 'C:\\Users\\mic\\Downloads\\pia-system');
  if (!projectDir) return;
  try {
    const result = await api('/api/reports/trigger-review', {
      method: 'POST',
      body: JSON.stringify({ projectDir }),
    });
    alert(`Ziggi review triggered! Task ID: ${result.taskId}`);
  } catch (e) {
    alert('Failed to trigger review: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal').classList.add('active');
}

function closeModal(event) {
  if (event.target === event.currentTarget) {
    document.getElementById('modal').classList.remove('active');
  }
}

function closeModalForce() {
  document.getElementById('modal').classList.remove('active');
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  // Refresh stats every 30s
  setInterval(loadDashboard, 30000);
});
