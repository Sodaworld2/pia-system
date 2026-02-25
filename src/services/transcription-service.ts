/**
 * Transcription Service — Whisper API with swappable provider interface
 *
 * Providers:
 *   - OpenAIWhisperProvider: Uses OpenAI Whisper API (whisper-1 model)
 *   - LocalWhisperProvider:  Stub for future M2 GPU local transcription
 *
 * Uses Node 20 built-in fetch/FormData/Blob — no new npm deps.
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('TranscriptionService');

// ---------------------------------------------------------------------------
// Provider Interface
// ---------------------------------------------------------------------------

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  model: string;
  costUsd: number;
}

export interface TranscriptionProvider {
  name: string;
  isAvailable(): boolean;
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<TranscriptionResult>;
}

// ---------------------------------------------------------------------------
// OpenAI Whisper Provider
// ---------------------------------------------------------------------------

// Whisper pricing: $0.006 per minute
const WHISPER_COST_PER_MINUTE = 0.006;

function getFileExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/webm;codecs=opus': 'webm',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/flac': 'flac',
  };
  return map[mimeType] || 'webm';
}

export class OpenAIWhisperProvider implements TranscriptionProvider {
  name = 'openai-whisper';

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<TranscriptionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const ext = getFileExtension(mimeType);
    const blob = new Blob([audioBuffer], { type: mimeType });

    const formData = new FormData();
    formData.append('file', blob, `voice-note.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    logger.info(`Transcribing ${(audioBuffer.length / 1024).toFixed(1)}KB audio (${mimeType})`);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Whisper API error ${response.status}: ${errText}`);
    }

    const result = await response.json() as {
      text: string;
      language: string;
      duration: number;
    };

    const costUsd = (result.duration / 60) * WHISPER_COST_PER_MINUTE;

    logger.info(`Transcribed ${result.duration.toFixed(1)}s audio → "${result.text.substring(0, 80)}..." (${result.language}, $${costUsd.toFixed(4)})`);

    return {
      text: result.text,
      language: result.language || 'en',
      duration: result.duration,
      model: 'whisper-1',
      costUsd,
    };
  }
}

// ---------------------------------------------------------------------------
// Local Whisper Provider (stub for future M2 GPU)
// ---------------------------------------------------------------------------

export class LocalWhisperProvider implements TranscriptionProvider {
  name = 'local-whisper';

  isAvailable(): boolean {
    // TODO: Check if local whisper service is running on M2
    return false;
  }

  async transcribe(_audioBuffer: Buffer, _mimeType: string): Promise<TranscriptionResult> {
    throw new Error('Local Whisper not yet implemented — waiting for M2 GPU setup');
  }
}

// ---------------------------------------------------------------------------
// Singleton Service
// ---------------------------------------------------------------------------

let service: TranscriptionService | null = null;

export class TranscriptionService {
  private providers: TranscriptionProvider[] = [];

  constructor() {
    // Priority order: local first (free), then OpenAI
    this.providers = [
      new LocalWhisperProvider(),
      new OpenAIWhisperProvider(),
    ];
  }

  getAvailableProvider(): TranscriptionProvider | null {
    return this.providers.find(p => p.isAvailable()) || null;
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<TranscriptionResult> {
    const provider = this.getAvailableProvider();
    if (!provider) {
      throw new Error('No transcription provider available. Set OPENAI_API_KEY for Whisper API.');
    }
    return provider.transcribe(audioBuffer, mimeType);
  }
}

export function getTranscriptionService(): TranscriptionService {
  if (!service) service = new TranscriptionService();
  return service;
}
