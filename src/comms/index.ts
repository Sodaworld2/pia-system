/**
 * PIA Communications Module
 * Connects Discord/WhatsApp/Email to the Orchestrator
 */

export { PIADiscordBot, createDiscordBot, getDiscordBot } from './discord-bot.js';
export { PIAWhatsAppBot, createWhatsAppBot, getWhatsAppBot } from './whatsapp-bot.js';
export { PIAOrchestrator, getOrchestrator } from './orchestrator.js';

import { createDiscordBot } from './discord-bot.js';
import { createWhatsAppBot } from './whatsapp-bot.js';
import { getOrchestrator } from './orchestrator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Comms');

/**
 * Initialize communications (Discord + WhatsApp + Orchestrator)
 */
export async function initializeCommunications(config: {
  discordToken?: string;
  discordChannelId?: string;
  allowedDiscordUsers?: string[];
  whatsappEnabled?: boolean;
  allowedWhatsAppNumbers?: string[];
}): Promise<void> {
  const orchestrator = getOrchestrator();

  // Setup Discord if token provided
  if (config.discordToken) {
    const discord = createDiscordBot({
      token: config.discordToken,
      channelId: config.discordChannelId,
      allowedUsers: config.allowedDiscordUsers,
    });

    // Connect Discord messages to Orchestrator
    discord.onMessage(async (message, userId, respond) => {
      logger.info(`Discord message from ${userId}: ${message.substring(0, 50)}...`);

      // Process through orchestrator
      const response = await orchestrator.handleHumanMessage(message);

      // Send response back
      await respond(response);
    });

    try {
      await discord.start();
      logger.info('Discord bot connected to Orchestrator');
    } catch (error) {
      logger.error(`Failed to start Discord bot: ${error}`);
    }
  } else {
    logger.info('Discord token not configured - Discord integration disabled');
  }

  // Setup WhatsApp if enabled
  if (config.whatsappEnabled) {
    const whatsapp = createWhatsAppBot({
      allowedNumbers: config.allowedWhatsAppNumbers,
    });

    // Connect WhatsApp messages to Orchestrator
    whatsapp.onMessage(async (message, userId, respond) => {
      logger.info(`WhatsApp message from ${userId}: ${message.substring(0, 50)}...`);

      // Process through orchestrator
      const response = await orchestrator.handleHumanMessage(message);

      // Send response back
      await respond(response);
    });

    try {
      await whatsapp.start();
      logger.info('WhatsApp bot connected to Orchestrator');
    } catch (error) {
      logger.error(`Failed to start WhatsApp bot: ${error}`);
    }
  } else {
    logger.info('WhatsApp not enabled - WhatsApp integration disabled');
  }

  logger.info('Communications module initialized');
}
