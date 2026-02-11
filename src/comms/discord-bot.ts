/**
 * PIA Discord Bot
 * Allows user to communicate with Claude through Discord
 */

import { Client, GatewayIntentBits, Message, TextChannel } from 'discord.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Discord');

interface DiscordConfig {
  token: string;
  channelId?: string;
  allowedUsers?: string[];
}

type MessageHandler = (message: string, userId: string, respond: (text: string) => Promise<void>) => Promise<void>;

export class PIADiscordBot {
  private client: Client;
  private config: DiscordConfig;
  private messageHandler?: MessageHandler;
  private isReady = false;

  constructor(config: DiscordConfig) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.client.on('ready', () => {
      logger.info(`Discord bot logged in as ${this.client.user?.tag}`);
      this.isReady = true;
    });

    this.client.on('messageCreate', async (message: Message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      // Check if user is allowed (if allowedUsers is set)
      if (this.config.allowedUsers && this.config.allowedUsers.length > 0) {
        if (!this.config.allowedUsers.includes(message.author.id)) {
          return;
        }
      }

      // Check if in allowed channel (if channelId is set)
      if (this.config.channelId && message.channelId !== this.config.channelId) {
        // Also allow DMs
        if (!message.channel.isDMBased()) {
          return;
        }
      }

      // Handle the message
      if (this.messageHandler) {
        const respond = async (text: string) => {
          // Split long messages
          const chunks = this.splitMessage(text);
          for (const chunk of chunks) {
            await message.reply(chunk);
          }
        };

        try {
          await this.messageHandler(message.content, message.author.id, respond);
        } catch (error) {
          logger.error(`Error handling message: ${error}`);
          await message.reply('Sorry, I encountered an error processing your message.');
        }
      }
    });

    this.client.on('error', (error: Error) => {
      logger.error(`Discord client error: ${error}`);
    });
  }

  private splitMessage(text: string, maxLength = 2000): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point
      let splitIndex = remaining.lastIndexOf('\n', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitIndex === -1 || splitIndex < maxLength / 2) {
        splitIndex = maxLength;
      }

      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }

    return chunks;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    if (!this.config.token) {
      throw new Error('Discord token not configured');
    }

    await this.client.login(this.config.token);
    logger.info('Discord bot starting...');
  }

  async stop(): Promise<void> {
    this.client.destroy();
    logger.info('Discord bot stopped');
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (channel && channel instanceof TextChannel) {
      const chunks = this.splitMessage(text);
      for (const chunk of chunks) {
        await channel.send(chunk);
      }
    }
  }

  getStatus(): { ready: boolean; user?: string } {
    return {
      ready: this.isReady,
      user: this.client.user?.tag,
    };
  }
}

// Singleton instance
let discordBot: PIADiscordBot | null = null;

export function getDiscordBot(): PIADiscordBot | null {
  return discordBot;
}

export function createDiscordBot(config: DiscordConfig): PIADiscordBot {
  if (discordBot) {
    return discordBot;
  }
  discordBot = new PIADiscordBot(config);
  return discordBot;
}
