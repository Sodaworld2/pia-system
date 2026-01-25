import { Router, Request, Response } from 'express';
import {
  getActiveSessions,
  getSessionById,
  getSessionsByMachine,
  createSession,
  updateSessionPid,
  closeSession,
  getSessionBuffer,
  SessionInput,
} from '../../db/queries/sessions.js';
import { ptyManager } from '../../tunnel/pty-wrapper.js';
import { getWebSocketServer } from '../../tunnel/websocket-server.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('SessionsAPI');

// GET /api/sessions - List active sessions
router.get('/', (req: Request, res: Response) => {
  try {
    const { machine } = req.query;

    let sessions;
    if (machine && typeof machine === 'string') {
      sessions = getSessionsByMachine(machine);
    } else {
      sessions = getActiveSessions();
    }

    res.json(sessions);
  } catch (error) {
    logger.error(`Failed to get sessions: ${error}`);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// GET /api/sessions/:id - Get session by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const session = getSessionById(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Include buffer
    const buffer = getSessionBuffer(session.id);

    res.json({ ...session, buffer });
  } catch (error) {
    logger.error(`Failed to get session: ${error}`);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// POST /api/sessions - Create new CLI session
router.post('/', (req: Request, res: Response) => {
  try {
    const { machine_id, agent_id, command, cwd } = req.body as SessionInput & { command?: string; cwd?: string };

    if (!machine_id) {
      res.status(400).json({ error: 'machine_id is required' });
      return;
    }

    // Create session in database
    const session = createSession({
      machine_id,
      agent_id,
      command: command || 'claude',
      cwd: cwd || process.cwd(),
    });

    // Spawn PTY
    try {
      const ptyWrapper = ptyManager.create(session.id, {
        command: command || 'claude',
        cwd: cwd || process.cwd(),
      });

      // Update session with PID
      const pid = ptyWrapper.getPid();
      if (pid) {
        updateSessionPid(session.id, pid);
      }

      // Register with WebSocket server for broadcasting
      try {
        const ws = getWebSocketServer();
        ws.registerPTY(session.id, ptyWrapper);
      } catch {
        logger.warn('WebSocket server not available for PTY registration');
      }

      logger.info(`Session created: ${session.id} (PID: ${pid})`);

      res.status(201).json({
        ...session,
        pty_pid: pid,
      });
    } catch (ptyError) {
      // Clean up database entry if PTY fails
      closeSession(session.id);
      throw ptyError;
    }
  } catch (error) {
    logger.error(`Failed to create session: ${error}`);
    res.status(500).json({ error: `Failed to create session: ${error}` });
  }
});

// POST /api/sessions/:id/input - Send input to session
router.post('/:id/input', (req: Request, res: Response) => {
  try {
    const session = getSessionById(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { data } = req.body;
    if (!data) {
      res.status(400).json({ error: 'data is required' });
      return;
    }

    const ptyWrapper = ptyManager.get(session.id);
    if (!ptyWrapper) {
      res.status(400).json({ error: 'Session PTY not found' });
      return;
    }

    ptyWrapper.write(data);
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error(`Failed to send input: ${error}`);
    res.status(500).json({ error: 'Failed to send input' });
  }
});

// POST /api/sessions/:id/resize - Resize session terminal
router.post('/:id/resize', (req: Request, res: Response) => {
  try {
    const session = getSessionById(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { cols, rows } = req.body;
    if (!cols || !rows) {
      res.status(400).json({ error: 'cols and rows are required' });
      return;
    }

    const ptyWrapper = ptyManager.get(session.id);
    if (!ptyWrapper) {
      res.status(400).json({ error: 'Session PTY not found' });
      return;
    }

    ptyWrapper.resize(cols, rows);
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error(`Failed to resize session: ${error}`);
    res.status(500).json({ error: 'Failed to resize session' });
  }
});

// DELETE /api/sessions/:id - Close session
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const session = getSessionById(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Kill PTY
    ptyManager.kill(session.id);

    // Update database
    closeSession(session.id);

    logger.info(`Session closed: ${session.id}`);
    res.json({ status: 'closed' });
  } catch (error) {
    logger.error(`Failed to close session: ${error}`);
    res.status(500).json({ error: 'Failed to close session' });
  }
});

export default router;
