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
 * Logger interface for dependency injection
 */
export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error | null, context?: Record<string, unknown>): void;
}

/**
 * Logger class using Pino with pino-pretty
 *
 * Provides structured logging with configurable levels and pretty formatting.
 */
export class Logger implements ILogger {
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
  error(message: string, error?: Error | null, context?: Record<string, unknown>): void {
    const logContext = { ...context };
    if (error) {
      logContext['error'] = error.message;
      logContext['stack'] = error.stack;
    }
    this.logger.error(logContext, message);
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
 * Legacy function for backwards compatibility
 * @deprecated Use Logger class instead
 */
export function logDebugMessageToConsole(
  message: string | null,
  error: Error | null | undefined,
  stackTrace: string | null | undefined
): void {
  const logger = Logger.getInstance();
  const msg = message ?? 'null';
  const context: Record<string, unknown> = {};
  if (error) {
    context['error'] = error.message;
    context['stack'] = error.stack;
  }
  if (stackTrace !== null) {
    context['customStack'] = stackTrace;
  }
  logger.debug(msg, context);
}

/**
 * Create a new logger instance
 */
export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Get the default logger instance
 */
export function getLogger(): Logger {
  return Logger.getInstance();
}
