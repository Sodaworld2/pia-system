/**
 * WhatsApp Command Bridge
 *
 * Bridges incoming WhatsApp messages to PIA's SDK agent system.
 * When Mic sends a WhatsApp message:
 *   1. Sends immediate acknowledgment ("On it...")
 *   2. Spawns Controller soul via AgentSessionManager (SDK mode)
 *   3. When session completes, sends the result back to WhatsApp
 *
 * The Controller agent routes the request to the right specialist or
 * handles it directly. Fisher2050 can also be targeted by prefixing
 * with "@fisher" or "@ziggi" etc.
 */

import { createLogger } from '../utils/logger.js';
import { getAgentSessionManager } from '../mission-control/agent-session.js';

const logger = createLogger('WhatsAppBridge');

// Soul to spawn when no @agent prefix is given
const DEFAULT_SOUL = 'controller';

// Map WhatsApp @-prefixes to soul IDs
const SOUL_ALIASES: Record<string, string> = {
  fisher:    'fisher2050',
  fisher2050:'fisher2050',
  ziggi:     'ziggi',
  eliyahu:   'eliyahu',
  farcake:   'farcake',
  andy:      'andy',
  owl:       'owl',
  timbuc:    'tim_buc',
  'tim_buc': 'tim_buc',
  coder:     'coder_machine',
};

interface PendingRequest {
  respond: (text: string) => Promise<void>;
  userId: string;
}

// Track which WhatsApp reply function belongs to which session
const pendingRequests = new Map<string, PendingRequest>();

let listenerAttached = false;

function attachCompletionListener(): void {
  if (listenerAttached) return;
  listenerAttached = true;

  const mgr = getAgentSessionManager();

  mgr.on('complete', (evt: { sessionId: string; result: { success: boolean; summary: string } }) => {
    const req = pendingRequests.get(evt.sessionId);
    if (!req) return;
    pendingRequests.delete(evt.sessionId);

    const summary = evt.result?.summary?.trim() || '(no summary)';
    const status = evt.result?.success === false ? '⚠️ Task encountered issues.\n\n' : '';
    const reply = `${status}${summary}`;

    req.respond(reply.substring(0, 4000)).catch((err) =>
      logger.error(`Failed to send WhatsApp reply for session ${evt.sessionId}: ${err}`),
    );
  });

  mgr.on('error', (evt: { sessionId: string; error: Error }) => {
    const req = pendingRequests.get(evt.sessionId);
    if (!req) return;
    pendingRequests.delete(evt.sessionId);

    req.respond(`❌ Agent encountered an error: ${evt.error?.message || 'Unknown error'}`).catch(() => {});
  });
}

/**
 * Handle an incoming WhatsApp message from Mic.
 * Spawns the appropriate agent soul and responds when done.
 */
export async function handleWhatsAppCommand(
  message: string,
  userId: string,
  respond: (text: string) => Promise<void>,
): Promise<void> {
  attachCompletionListener();

  // Parse @agent prefix — "@fisher schedule Farcake for research tomorrow 9am"
  let soulId = DEFAULT_SOUL;
  let task = message.trim();

  const atMatch = message.trim().match(/^@(\w+)\s+(.+)$/s);
  if (atMatch) {
    const alias = atMatch[1].toLowerCase();
    if (SOUL_ALIASES[alias]) {
      soulId = SOUL_ALIASES[alias];
      task = atMatch[2].trim();
    }
  }

  // Send immediate acknowledgment
  const ackMessages: Record<string, string> = {
    controller:     '🧭 Controller on it...',
    fisher2050:     '📋 Fisher2050 processing...',
    ziggi:          '🔍 Ziggi reviewing...',
    eliyahu:        '📊 Eliyahu analyzing...',
    farcake:        '🔬 Farcake researching...',
    andy:           '✍️  Andy working on it...',
    owl:            '🦉 Owl checking records...',
    tim_buc:        '📁 Tim Buc filing...',
    coder_machine:  '💻 Coder Machine building...',
  };
  const ack = ackMessages[soulId] || '⚙️ On it...';
  await respond(ack);

  try {
    const mgr = getAgentSessionManager();
    const session = mgr.spawn({
      mode: 'sdk',
      task,
      cwd: process.cwd(),
      approvalMode: 'auto',
      soulId,
      machineId: 'local',
      maxBudgetUsd: 1.5,
      maxTurns: 25,
    });

    // Register so completion handler can send the WhatsApp reply
    pendingRequests.set(session.id, { respond, userId });
    logger.info(`WhatsApp → spawned ${soulId} session ${session.id} for ${userId.substring(0, 15)}`);
  } catch (err) {
    logger.error(`WhatsApp bridge failed to spawn ${soulId}: ${err}`);
    await respond(`❌ Failed to start agent: ${err instanceof Error ? err.message : String(err)}`);
  }
}
