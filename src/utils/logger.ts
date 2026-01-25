import { config } from '../config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function getTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.logging.level];
}

function formatMessage(level: LogLevel, component: string, message: string): string {
  const timestamp = `${COLORS.dim}${getTimestamp()}${COLORS.reset}`;
  const levelColors: Record<LogLevel, string> = {
    debug: COLORS.magenta,
    info: COLORS.green,
    warn: COLORS.yellow,
    error: COLORS.red,
  };
  const levelStr = `${levelColors[level]}${level.toUpperCase().padEnd(5)}${COLORS.reset}`;
  const componentStr = `${COLORS.cyan}[${component}]${COLORS.reset}`;

  return `${timestamp} ${levelStr} ${componentStr} ${message}`;
}

export function createLogger(component: string) {
  return {
    debug(message: string, ...args: unknown[]) {
      if (shouldLog('debug')) {
        console.log(formatMessage('debug', component, message), ...args);
      }
    },

    info(message: string, ...args: unknown[]) {
      if (shouldLog('info')) {
        console.log(formatMessage('info', component, message), ...args);
      }
    },

    warn(message: string, ...args: unknown[]) {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', component, message), ...args);
      }
    },

    error(message: string, ...args: unknown[]) {
      if (shouldLog('error')) {
        console.error(formatMessage('error', component, message), ...args);
      }
    },
  };
}

export const logger = createLogger('PIA');
