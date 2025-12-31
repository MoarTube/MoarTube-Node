/**
 * Logger Module
 *
 * Uses Pino for fast, structured logging.
 */

import pino from 'pino';
import pinoPretty from 'pino-pretty';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level?: LogLevel;
  /** Whether to include timestamps */
  timestamps?: boolean;
  /** Custom prefix for log messages */
  prefix?: string;
  /** Whether to log to file (future implementation) */
  logToFile?: boolean;
  /** Path to log file (if logToFile is true) */
  logFilePath?: string;
}

/**
 * Logger class using Pino with pino-pretty
 *
 * Provides structured logging with configurable levels and pretty formatting.
 */
export class Logger {
  private static instance: Logger | null = null;
  private readonly logger: pino.Logger;

  constructor(config: LoggerConfig = {}, existingLogger?: pino.Logger) {
    if (existingLogger) {
      this.logger = existingLogger;
    } else {
      const stream = pinoPretty({
        colorize: true,
        translateTime: 'HH:MM:ss Z',
      });

      if (config.logToFile === true && config.logFilePath !== undefined) {
        const streams = [{ stream: stream }, { stream: pino.destination(config.logFilePath) }];

        this.logger = pino(pino.multistream(streams));
      } else {
        this.logger = pino(stream);
      }
    }
  }

  /**
   * Get or create the singleton logger instance
   */
  static getInstance(config?: LoggerConfig): Logger {
    Logger.instance ??= new Logger(config);
    return Logger.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    Logger.instance = null;
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(context ?? {}, message);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context ?? {}, message);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context ?? {}, message);
  }

  /**
   * Log an error message with optional error object
   */
  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    const logContext = { ...context };

    const normalized = this.normalizeError(error);

    if (normalized) {
      logContext['error'] = normalized.message;

      if (normalized.stack !== undefined) {
        logContext['stack'] = normalized.stack;
      }
    }

    this.logger.error(logContext, message);
  }

  /**
   * Normalize an unknown error to a consistent format
   */
  private normalizeError(error: unknown): { message: string; stack?: string } | null {
    if (error === null || error === undefined) {
      return null;
    } else if (error instanceof Error) {
      const normalized: { message: string; stack?: string } = { message: error.message };

      if (error.stack !== undefined) {
        normalized.stack = error.stack;
      }

      return normalized;
    } else {
      const message = JSON.stringify(error);

      return { message };
    }
  }

  /**
   * Create a child logger with a prefix
   */
  child(prefix: string): Logger {
    const childLogger = this.logger.child({ component: prefix });
    return new Logger({}, childLogger);
  }
}

/**
 * Get the default logger instance
 */
export function getLogger(): Logger {
  return Logger.getInstance();
}
