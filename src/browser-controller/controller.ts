/**
 * Browser Controller — Gemini-powered Playwright browser automation
 *
 * Lifecycle: start() -> [execute commands] -> stop()
 *
 * - Owns a single headless Chromium browser instance
 * - Accepts commands (navigate, click, fill, screenshot, extractText, executeTask)
 * - Uses Gemini vision for page analysis and multi-step task execution
 * - Registers on AgentBus as 'browser-controller'
 * - Broadcasts status via WebSocket for dashboard
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createLogger } from '../utils/logger.js';
import { getAgentBus } from '../comms/agent-bus.js';
import { decideNextAction, extractPageText, isVisionReady } from './gemini-vision.js';
import type {
  BrowserCommand, BrowserCommandResult, ControllerState,
  ControllerStatus, TaskStep,
} from './types.js';

const logger = createLogger('BrowserController');

const AGENT_BUS_ID = 'browser-controller';
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const MAX_TASK_STEPS = 20;
const SCREENSHOT_TIMEOUT_MS = 5000;
const ACTION_TIMEOUT_MS = 10000;

export class BrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private state: ControllerState;
  private busUnsubscribe: (() => void) | null = null;
  private broadcastFn: ((msg: Record<string, unknown>) => void) | null = null;

  constructor() {
    this.state = {
      status: 'stopped',
      currentUrl: null,
      pageTitle: null,
      lastScreenshot: null,
      lastActivity: 0,
      commandsExecuted: 0,
      errorsCount: 0,
      geminiCallsCount: 0,
      geminiTokensUsed: 0,
      startedAt: null,
      browserPid: null,
    };
  }

  // ── Lifecycle ─────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.browser) {
      throw new Error('Browser controller already running');
    }

    if (!isVisionReady()) {
      throw new Error('GEMINI_API_KEY not configured — set it in .env');
    }

    this.setStatus('starting');
    logger.info('Starting browser controller...');

    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      this.context = await this.browser.newContext({
        viewport: DEFAULT_VIEWPORT,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PIA-BrowserController/1.0',
      });

      this.page = await this.context.newPage();
      this.state.startedAt = Date.now();
      this.state.browserPid = (this.browser as any).process?.()?.pid || null;

      this.registerOnBus();
      await this.wireBroadcast();

      this.setStatus('idle');
      logger.info(`Browser controller started (PID: ${this.state.browserPid})`);
    } catch (err) {
      this.setStatus('error');
      logger.error(`Failed to start browser: ${err}`);
      throw err;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping browser controller...');

    if (this.busUnsubscribe) {
      this.busUnsubscribe();
      this.busUnsubscribe = null;
    }

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
      this.page = null;
    }

    this.state.lastScreenshot = null;
    this.state.currentUrl = null;
    this.state.pageTitle = null;
    this.state.browserPid = null;
    this.setStatus('stopped');
    logger.info('Browser controller stopped');
  }

  getState(): ControllerState {
    return { ...this.state };
  }

  // ── Command Execution ─────────────────────────────────────

  async execute(command: BrowserCommand): Promise<BrowserCommandResult> {
    if (!this.page || this.state.status === 'stopped') {
      return { success: false, message: 'Browser controller not running', error: 'NOT_RUNNING' };
    }

    const startTime = Date.now();
    this.setStatus('busy');
    this.state.lastActivity = Date.now();

    try {
      let result: BrowserCommandResult;

      switch (command.type) {
        case 'navigate':    result = await this.cmdNavigate(command); break;
        case 'click':       result = await this.cmdClick(command); break;
        case 'fill':        result = await this.cmdFill(command); break;
        case 'screenshot':  result = await this.cmdScreenshot(); break;
        case 'extractText': result = await this.cmdExtractText(command); break;
        case 'executeTask': result = await this.cmdExecuteTask(command); break;
        case 'scroll':      result = await this.cmdScroll(command); break;
        case 'wait':        result = await this.cmdWait(command); break;
        case 'goBack':      result = await this.cmdGoBack(); break;
        case 'evaluate':    result = await this.cmdEvaluate(command); break;
        default:
          result = { success: false, message: `Unknown command: ${command.type}`, error: 'UNKNOWN_COMMAND' };
      }

      result.durationMs = Date.now() - startTime;
      result.url = this.page.url();
      result.title = await this.page.title();
      this.state.currentUrl = result.url;
      this.state.pageTitle = result.title;
      this.state.commandsExecuted++;

      this.setStatus('idle');
      this.broadcastStatus();
      return result;

    } catch (err) {
      this.state.errorsCount++;
      this.setStatus('idle'); // recover — one bad command shouldn't kill the controller
      const error = (err as Error).message;
      logger.error(`Command ${command.type} failed: ${error}`);
      return {
        success: false,
        message: `Command failed: ${error}`,
        error,
        durationMs: Date.now() - startTime,
        url: this.page?.url() || undefined,
        title: await this.page?.title().catch(() => undefined),
      };
    }
  }

  // ── Individual Commands ────────────────────────────────────

  private async cmdNavigate(cmd: BrowserCommand): Promise<BrowserCommandResult> {
    if (!cmd.target) return { success: false, message: 'navigate requires target URL' };
    await this.page!.goto(cmd.target, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const screenshot = await this.takeScreenshot();
    return { success: true, message: `Navigated to ${cmd.target}`, screenshot };
  }

  private async cmdClick(cmd: BrowserCommand): Promise<BrowserCommandResult> {
    if (cmd.target) {
      await this.page!.click(cmd.target, { timeout: ACTION_TIMEOUT_MS });
    } else if (cmd.coords) {
      await this.page!.mouse.click(cmd.coords[0], cmd.coords[1]);
    } else {
      return { success: false, message: 'click requires target selector or coords' };
    }
    await this.page!.waitForTimeout(500);
    const screenshot = await this.takeScreenshot();
    return { success: true, message: `Clicked ${cmd.target || `(${cmd.coords})`}`, screenshot };
  }

  private async cmdFill(cmd: BrowserCommand): Promise<BrowserCommandResult> {
    if (!cmd.target || cmd.value === undefined) {
      return { success: false, message: 'fill requires target selector and value' };
    }
    await this.page!.fill(cmd.target, cmd.value, { timeout: ACTION_TIMEOUT_MS });
    const screenshot = await this.takeScreenshot();
    return { success: true, message: `Filled ${cmd.target}`, screenshot };
  }

  private async cmdScreenshot(): Promise<BrowserCommandResult> {
    const screenshot = await this.takeScreenshot();
    return { success: true, message: 'Screenshot captured', screenshot };
  }

  private async cmdExtractText(cmd: BrowserCommand): Promise<BrowserCommandResult> {
    const screenshot = await this.takeScreenshot();
    const vision = await extractPageText(screenshot, cmd.value);
    this.state.geminiCallsCount++;
    this.state.geminiTokensUsed += vision.tokensUsed;
    return {
      success: true,
      message: 'Text extracted via Gemini vision',
      text: vision.text,
      screenshot,
    };
  }

  private async cmdScroll(cmd: BrowserCommand): Promise<BrowserCommandResult> {
    const amount = cmd.scrollAmount || 300;
    const delta = cmd.direction === 'up' ? -amount : amount;
    await this.page!.mouse.wheel(0, delta);
    await this.page!.waitForTimeout(300);
    const screenshot = await this.takeScreenshot();
    return { success: true, message: `Scrolled ${cmd.direction || 'down'} by ${amount}px`, screenshot };
  }

  private async cmdWait(cmd: BrowserCommand): Promise<BrowserCommandResult> {
    await this.page!.waitForTimeout(cmd.waitMs || 1000);
    const screenshot = await this.takeScreenshot();
    return { success: true, message: `Waited ${cmd.waitMs || 1000}ms`, screenshot };
  }

  private async cmdGoBack(): Promise<BrowserCommandResult> {
    await this.page!.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
    const screenshot = await this.takeScreenshot();
    return { success: true, message: 'Navigated back', screenshot };
  }

  private async cmdEvaluate(cmd: BrowserCommand): Promise<BrowserCommandResult> {
    if (!cmd.value) return { success: false, message: 'evaluate requires value (JS expression)' };
    const forbidden = ['document.write', 'document.cookie', 'localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest'];
    for (const f of forbidden) {
      if (cmd.value.includes(f)) {
        return { success: false, message: `evaluate blocked: "${f}" not allowed` };
      }
    }
    const result = await this.page!.evaluate(cmd.value);
    return { success: true, message: 'Evaluated JS expression', text: String(result) };
  }

  // ── Multi-Step Task (Gemini Loop) ──────────────────────────

  private async cmdExecuteTask(cmd: BrowserCommand): Promise<BrowserCommandResult> {
    if (!cmd.taskDescription) {
      return { success: false, message: 'executeTask requires taskDescription' };
    }

    const maxSteps = Math.min(cmd.maxSteps || MAX_TASK_STEPS, MAX_TASK_STEPS);
    const steps: TaskStep[] = [];
    const previousStepDescriptions: string[] = [];

    logger.info(`Executing task: "${cmd.taskDescription}" (max ${maxSteps} steps)`);

    for (let i = 1; i <= maxSteps; i++) {
      const screenshot = await this.takeScreenshot();

      // Ask Gemini what to do next
      let vision;
      try {
        vision = await decideNextAction(screenshot, cmd.taskDescription, previousStepDescriptions);
        this.state.geminiCallsCount++;
        this.state.geminiTokensUsed += vision.tokensUsed;
      } catch (err) {
        steps.push({
          stepNumber: i,
          action: 'gemini_call',
          reasoning: `Gemini API error: ${(err as Error).message}`,
          success: false,
          error: (err as Error).message,
        });
        break;
      }

      // Parse Gemini's JSON response
      let decision;
      try {
        let cleaned = vision.text.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        decision = JSON.parse(cleaned);
      } catch {
        logger.warn(`Step ${i}: Gemini returned non-JSON, skipping`);
        steps.push({
          stepNumber: i,
          action: 'parse_error',
          reasoning: `Unparseable response: ${vision.text.substring(0, 200)}`,
          success: false,
          error: 'JSON_PARSE_FAILED',
        });
        previousStepDescriptions.push(`Step ${i}: Failed to parse Gemini response`);
        continue;
      }

      // Check if done
      if (decision.done) {
        steps.push({
          stepNumber: i,
          action: 'task_complete',
          reasoning: decision.reasoning || 'Task completed',
          success: true,
        });
        logger.info(`Task completed at step ${i}: ${decision.reasoning}`);
        break;
      }

      // Execute the decided action
      const actionCmd: BrowserCommand = { type: decision.action };
      if (decision.selector) actionCmd.target = decision.selector;
      if (decision.value) actionCmd.value = decision.value;
      if (decision.coords) actionCmd.coords = decision.coords;
      if (decision.action === 'scroll') {
        actionCmd.direction = decision.direction || 'down';
        actionCmd.scrollAmount = decision.scrollAmount || 300;
      }
      if (decision.action === 'navigate') actionCmd.target = decision.url || decision.selector;

      let actionResult: BrowserCommandResult;
      try {
        // Use internal execution (skip status changes to avoid nested busy/idle)
        actionResult = await this.executeAction(actionCmd);
      } catch (err) {
        actionResult = { success: false, message: (err as Error).message, error: (err as Error).message };
      }

      const stepDescription = `${decision.action}(${decision.selector || decision.coords || ''})${decision.value ? ` = "${decision.value}"` : ''} - ${decision.reasoning}`;

      steps.push({
        stepNumber: i,
        action: stepDescription,
        reasoning: decision.reasoning,
        success: actionResult.success,
        error: actionResult.error,
      });

      previousStepDescriptions.push(
        `${stepDescription} -> ${actionResult.success ? 'OK' : 'FAILED: ' + actionResult.error}`
      );

      this.broadcastTaskProgress(cmd.taskDescription, i, maxSteps, stepDescription);

      await this.page!.waitForTimeout(800);
    }

    const finalScreenshot = await this.takeScreenshot();
    const allSucceeded = steps.length > 0 && steps[steps.length - 1].success;

    return {
      success: allSucceeded,
      message: allSucceeded
        ? `Task completed in ${steps.length} steps`
        : `Task incomplete after ${steps.length} steps`,
      screenshot: finalScreenshot,
      steps,
      url: this.page!.url(),
      title: await this.page!.title(),
    };
  }

  /**
   * Internal action execution for executeTask loop — no status changes.
   */
  private async executeAction(cmd: BrowserCommand): Promise<BrowserCommandResult> {
    switch (cmd.type) {
      case 'navigate':    return this.cmdNavigate(cmd);
      case 'click':       return this.cmdClick(cmd);
      case 'fill':        return this.cmdFill(cmd);
      case 'screenshot':  return this.cmdScreenshot();
      case 'scroll':      return this.cmdScroll(cmd);
      case 'wait':        return this.cmdWait(cmd);
      case 'goBack':      return this.cmdGoBack();
      default:            return { success: false, message: `Unsupported action in task: ${cmd.type}` };
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  private async takeScreenshot(): Promise<string> {
    if (!this.page) throw new Error('No page available');
    const buffer = await this.page.screenshot({
      type: 'png',
      timeout: SCREENSHOT_TIMEOUT_MS,
    });
    const base64 = buffer.toString('base64');
    this.state.lastScreenshot = base64;
    return base64;
  }

  private setStatus(status: ControllerStatus): void {
    this.state.status = status;
    this.broadcastStatus();
  }

  private registerOnBus(): void {
    const bus = getAgentBus();
    this.busUnsubscribe = bus.subscribe(AGENT_BUS_ID, async (msg) => {
      logger.info(`AgentBus command from ${msg.from}: ${msg.content.substring(0, 100)}`);

      try {
        const command: BrowserCommand = JSON.parse(msg.content);
        const result = await this.execute(command);
        bus.send(AGENT_BUS_ID, msg.from, JSON.stringify(result), 'direct', { inReplyTo: msg.id });
      } catch (err) {
        bus.send(AGENT_BUS_ID, msg.from, JSON.stringify({
          success: false, error: (err as Error).message,
        }), 'direct', { inReplyTo: msg.id });
      }
    });

    logger.info(`Registered on AgentBus as '${AGENT_BUS_ID}'`);
  }

  private async wireBroadcast(): Promise<void> {
    try {
      const { getWebSocketServer } = await import('../tunnel/websocket-server.js');
      const ws = getWebSocketServer();
      this.broadcastFn = (msg) => {
        ws.broadcastMc({ type: 'mc:browser_status' as any, payload: msg });
      };
    } catch {
      logger.warn('WebSocket server not available — dashboard updates disabled');
    }
  }

  private broadcastStatus(): void {
    if (this.broadcastFn) {
      this.broadcastFn({
        type: 'status',
        status: this.state.status,
        url: this.state.currentUrl,
        title: this.state.pageTitle,
        commands: this.state.commandsExecuted,
        errors: this.state.errorsCount,
        geminiCalls: this.state.geminiCallsCount,
      });
    }
  }

  private broadcastTaskProgress(task: string, step: number, maxSteps: number, description: string): void {
    if (this.broadcastFn) {
      this.broadcastFn({
        type: 'task_progress',
        task: task.substring(0, 100),
        step,
        maxSteps,
        description,
      });
    }
  }
}

// ── Singleton ─────────────────────────────────────────────

let controller: BrowserController | null = null;

export function getBrowserController(): BrowserController {
  if (!controller) {
    controller = new BrowserController();
  }
  return controller;
}
