/**
 * Voice Notes API
 *
 * POST   /api/voice-notes/transcribe  — transcribe audio → store → return transcript
 * GET    /api/voice-notes             — list recent voice notes (paginated)
 * GET    /api/voice-notes/:id         — single voice note
 * DELETE /api/voice-notes/:id         — delete a voice note
 */

import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { getDatabase } from '../../db/database.js';
import { getTranscriptionService } from '../../services/transcription-service.js';
import { createLogger } from '../../utils/logger.js';

const router = Router();
const logger = createLogger('VoiceNotesRoute');

// POST /api/voice-notes/transcribe
router.post('/transcribe', async (req: Request, res: Response) => {
  try {
    const { audio, mimeType = 'audio/webm', source = 'dashboard', agentId } = req.body;

    if (!audio || typeof audio !== 'string') {
      res.status(400).json({ error: 'Missing required field: audio (base64 string)' });
      return;
    }

    // Decode base64 audio
    const audioBuffer = Buffer.from(audio, 'base64');

    if (audioBuffer.length === 0) {
      res.status(400).json({ error: 'Empty audio data' });
      return;
    }

    if (audioBuffer.length > 10 * 1024 * 1024) {
      res.status(413).json({ error: 'Audio too large (max 10MB)' });
      return;
    }

    // Transcribe
    const svc = getTranscriptionService();
    const result = await svc.transcribe(audioBuffer, mimeType);

    // Store in database
    const db = getDatabase();
    const id = nanoid();

    db.prepare(`
      INSERT INTO voice_notes (id, transcript, duration_seconds, audio_size_bytes, language, source, model, cost_usd, agent_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      result.text,
      result.duration,
      audioBuffer.length,
      result.language,
      source,
      result.model,
      result.costUsd,
      agentId || null,
      JSON.stringify({})
    );

    logger.info(`Voice note ${id}: ${result.duration.toFixed(1)}s, ${(audioBuffer.length / 1024).toFixed(0)}KB, source=${source}`);

    res.json({
      success: true,
      id,
      transcript: result.text,
      duration: result.duration,
      language: result.language,
      cost: result.costUsd,
    });
  } catch (err) {
    logger.error(`POST /transcribe failed: ${err}`);
    res.status(500).json({ error: `Transcription failed: ${(err as Error).message}` });
  }
});

// GET /api/voice-notes
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const notes = db.prepare(
      'SELECT * FROM voice_notes ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);

    res.json({ notes });
  } catch (err) {
    logger.error(`GET /voice-notes failed: ${err}`);
    res.status(500).json({ error: 'Failed to fetch voice notes' });
  }
});

// GET /api/voice-notes/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const note = db.prepare('SELECT * FROM voice_notes WHERE id = ?').get(req.params.id);

    if (!note) {
      res.status(404).json({ error: 'Voice note not found' });
      return;
    }

    res.json({ note });
  } catch (err) {
    logger.error(`GET /voice-notes/${req.params.id} failed: ${err}`);
    res.status(500).json({ error: 'Failed to fetch voice note' });
  }
});

// DELETE /api/voice-notes/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM voice_notes WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Voice note not found' });
      return;
    }

    logger.info(`Deleted voice note ${req.params.id}`);
    res.json({ deleted: true });
  } catch (err) {
    logger.error(`DELETE /voice-notes/${req.params.id} failed: ${err}`);
    res.status(500).json({ error: 'Failed to delete voice note' });
  }
});

export default router;
