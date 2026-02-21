import { Router, Request, Response } from 'express';
import { getDatabase } from '../../db/database.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('HooksAPI');

// In-memory event buffer for fast access (last 200 events)
const eventBuffer: HookEvent[] = [];
const MAX_BUFFER = 200;

interface HookEvent {
  id?: number;
  session_id: string;
  event_type: string;
  tool_name?: string;
  tool_input?: string;
  tool_response?: string;
  status?: string;
  message?: string;
  created_at: number;
}


// POST /api/hooks/events - Receive hook event from Claude Code
router.post('/events', async (req: Request, res: Response) => {
  try {
    const {
      session_id,
      hook_event_name,
      tool_name,
      tool_input,
      tool_response,
      status,
      message,
    } = req.body;

    const event: HookEvent = {
      session_id: session_id || 'unknown',
      event_type: hook_event_name || req.body.event_type || 'unknown',
      tool_name: tool_name || undefined,
      tool_input: tool_input ? JSON.stringify(tool_input).slice(0, 2000) : undefined,
      tool_response: tool_response ? JSON.stringify(tool_response).slice(0, 2000) : undefined,
      status: status || undefined,
      message: message || undefined,
      created_at: Math.floor(Date.now() / 1000),
    };

    // Store in SQLite
    try {
      const db = getDatabase();
      const stmt = db.prepare(`
        INSERT INTO hook_events (session_id, event_type, tool_name, tool_input, tool_response, status, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        event.session_id,
        event.event_type,
        event.tool_name,
        event.tool_input,
        event.tool_response,
        event.status,
        event.message
      );
      event.id = result.lastInsertRowid as number;
    } catch (dbErr) {
      logger.warn(`DB write failed, event buffered in memory only: ${dbErr}`);
    }

    // Store in memory buffer
    eventBuffer.push(event);
    if (eventBuffer.length > MAX_BUFFER) {
      eventBuffer.shift();
    }

    // Broadcast via WebSocket to dashboard
    try {
      const wsModule = await import('../../tunnel/websocket-server.js');
      const ws = wsModule.getWebSocketServer();
      (ws.broadcast as any)({ type: 'hook_event', payload: event });
    } catch {
      // WebSocket not available
    }

    logger.info(`Hook event: ${event.event_type} ${event.tool_name || ''} [${event.session_id.slice(0, 8)}]`);
    res.json({ status: 'ok', id: event.id });
  } catch (error) {
    logger.error(`Failed to process hook event: ${error}`);
    res.status(500).json({ error: 'Failed to process hook event' });
  }
});

// POST /api/hooks/done - Agent finished notification
router.post('/done', async (req: Request, res: Response) => {
  try {
    const { session_id, message } = req.body;

    const hookEvent: HookEvent = {
      session_id: session_id || 'unknown',
      event_type: 'agent_done',
      status: 'completed',
      message: message || 'Agent finished responding',
      created_at: Math.floor(Date.now() / 1000),
    };

    // Store
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO hook_events (session_id, event_type, status, message)
        VALUES (?, ?, ?, ?)
      `).run(hookEvent.session_id, hookEvent.event_type, hookEvent.status, hookEvent.message);
    } catch (dbErr) {
      logger.warn(`DB write failed: ${dbErr}`);
    }

    eventBuffer.push(hookEvent);
    if (eventBuffer.length > MAX_BUFFER) {
      eventBuffer.shift();
    }

    // Broadcast
    try {
      const wsModule = await import('../../tunnel/websocket-server.js');
      const ws = wsModule.getWebSocketServer();
      (ws.broadcast as any)({ type: 'agent_done', payload: hookEvent });
    } catch {
      // WebSocket not available
    }

    logger.info(`Agent done: ${session_id || 'unknown'} - ${message || 'completed'}`);
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error(`Failed to process done event: ${error}`);
    res.status(500).json({ error: 'Failed to process done event' });
  }
});

// GET /api/hooks/events - Query recent events
router.get('/events', (req: Request, res: Response) => {
  try {
    const { session_id, event_type, limit, since } = req.query;
    const maxResults = Math.min(Number(limit) || 50, 200);

    // Try DB first, fall back to memory buffer
    try {
      const db = getDatabase();
      let query = 'SELECT * FROM hook_events WHERE 1=1';
      const params: any[] = [];

      if (session_id) {
        query += ' AND session_id = ?';
        params.push(session_id);
      }
      if (event_type) {
        query += ' AND event_type = ?';
        params.push(event_type);
      }
      if (since) {
        query += ' AND created_at > ?';
        params.push(Number(since));
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(maxResults);

      const events = db.prepare(query).all(...params);
      res.json(events);
    } catch {
      // Fallback to memory buffer
      let filtered = [...eventBuffer];
      if (session_id) filtered = filtered.filter(e => e.session_id === session_id);
      if (event_type) filtered = filtered.filter(e => e.event_type === event_type);
      if (since) filtered = filtered.filter(e => e.created_at > Number(since));
      res.json(filtered.slice(-maxResults).reverse());
    }
  } catch (error) {
    logger.error(`Failed to query hook events: ${error}`);
    res.status(500).json({ error: 'Failed to query events' });
  }
});

// GET /api/hooks/status - Quick status check (is any agent done?)
router.get('/status', (_req: Request, res: Response) => {
  try {
    const recentDone = eventBuffer
      .filter(e => e.event_type === 'agent_done')
      .slice(-10);

    const recentActivity = eventBuffer.slice(-5);

    res.json({
      total_events: eventBuffer.length,
      recent_completions: recentDone,
      latest_activity: recentActivity,
      last_event_at: eventBuffer.length > 0
        ? new Date(eventBuffer[eventBuffer.length - 1].created_at * 1000).toISOString()
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
