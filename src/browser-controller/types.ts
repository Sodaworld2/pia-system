/**
 * Browser Controller Types — Gemini-powered Playwright automation
 */

// ── Command types ──

export type BrowserCommandType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'screenshot'
  | 'extractText'
  | 'executeTask'
  | 'scroll'
  | 'wait'
  | 'goBack'
  | 'evaluate';

export interface BrowserCommand {
  type: BrowserCommandType;
  /** URL for 'navigate', CSS selector for 'click'/'fill' */
  target?: string;
  /** Value for 'fill', JS expression for 'evaluate', focus area for 'extractText' */
  value?: string;
  /** Pixel coordinates [x, y] as alternative to selector for 'click' */
  coords?: [number, number];
  /** For 'scroll': direction */
  direction?: 'up' | 'down';
  /** For 'scroll': pixels to scroll (default 300) */
  scrollAmount?: number;
  /** For 'wait': milliseconds (default 1000) */
  waitMs?: number;
  /** For 'executeTask': natural-language task description */
  taskDescription?: string;
  /** For 'executeTask': max steps before giving up (default 20) */
  maxSteps?: number;
}

export interface BrowserCommandResult {
  success: boolean;
  message: string;
  /** Base64-encoded PNG screenshot taken after the action (no data: prefix) */
  screenshot?: string;
  /** Extracted text content */
  text?: string;
  /** Current page URL after action */
  url?: string;
  /** Current page title */
  title?: string;
  /** Gemini's analysis of the page */
  analysis?: string;
  error?: string;
  /** For executeTask: list of steps taken */
  steps?: TaskStep[];
  /** Elapsed time in ms */
  durationMs?: number;
}

export interface TaskStep {
  stepNumber: number;
  action: string;
  reasoning: string;
  success: boolean;
  error?: string;
}

// ── Controller state ──

export type ControllerStatus = 'stopped' | 'starting' | 'idle' | 'busy' | 'error';

export interface ControllerState {
  status: ControllerStatus;
  currentUrl: string | null;
  pageTitle: string | null;
  lastScreenshot: string | null;
  lastActivity: number;
  commandsExecuted: number;
  errorsCount: number;
  geminiCallsCount: number;
  geminiTokensUsed: number;
  startedAt: number | null;
  browserPid: number | null;
}

// ── Gemini Vision types ──

export interface GeminiVisionResponse {
  text: string;
  tokensUsed: number;
  durationMs: number;
}
