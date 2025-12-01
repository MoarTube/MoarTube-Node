/**
 * Logger Module
 *
 * Centralized logging functionality with support for different log levels,
 * timestamps, and structured context.
 */

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
 * Log level numeric values for comparison
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

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
 * Format a date as a human-readable timestamp
 */
function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format context object for logging
 */
function formatContext(context: Record<string, unknown>): string {
  try {
    return JSON.stringify(context);
  } catch {
    return '[Unable to stringify context]';
  }
}

/**
 * Logger class
 *
 * Provides structured logging with configurable levels and formatting.
 */
export class Logger implements ILogger {
  private static instance: Logger | null = null;
  private readonly config: Required<LoggerConfig>;

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: config.level ?? LogLevel.INFO,
      timestamps: config.timestamps ?? true,
      prefix: config.prefix ?? '',
      logToFile: config.logToFile ?? false,
      logFilePath: config.logFilePath ?? '',
    };
  }

  /**
   * Get or create the singleton logger instance
   */
  static getInstance(config?: LoggerConfig): Logger {
    if (Logger.instance === null) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  static resetInstance(): void {
    Logger.instance = null;
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.level];
  }

  /**
   * Build the log message
   */
  private buildMessage(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): string {
    const parts: string[] = [];

    if (this.config.timestamps) {
      parts.push(`[${formatTimestamp(new Date())}]`);
    }

    parts.push(`[${level.toUpperCase()}]`);

    if (this.config.prefix !== '') {
      parts.push(`[${this.config.prefix}]`);
    }

    parts.push(message);

    if (context !== undefined && Object.keys(context).length > 0) {
      parts.push(formatContext(context));
    }

    return parts.join(' ');
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) {
      return;
    }

    const formattedMessage = this.buildMessage(LogLevel.DEBUG, message, context);
    console.debug(formattedMessage);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.INFO)) {
      return;
    }

    const formattedMessage = this.buildMessage(LogLevel.INFO, message, context);
    console.info(formattedMessage);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.WARN)) {
      return;
    }

    const formattedMessage = this.buildMessage(LogLevel.WARN, message, context);
    console.warn(formattedMessage);
  }

  /**
   * Log an error message with optional error object
   */
  error(message: string, error?: Error | null, context?: Record<string, unknown>): void {
    if (!this.shouldLog(LogLevel.ERROR)) {
      return;
    }

    const formattedMessage = this.buildMessage(LogLevel.ERROR, message, context);
    console.error(formattedMessage);

    if (error !== null && error !== undefined) {
      if (error.stack !== undefined) {
        console.error(error.stack);
      } else if (error.message !== undefined) {
        console.error(`Error: ${error.message}`);
      }
    }
  }

  /**
   * Create a child logger with a prefix
   */
  child(prefix: string): Logger {
    const combinedPrefix = this.config.prefix !== '' ? `${this.config.prefix}:${prefix}` : prefix;

    return new Logger({
      ...this.config,
      prefix: combinedPrefix,
    });
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
  const date = new Date();
  const humanReadableTimestamp = formatTimestamp(date);

  let errorMessage = `<message: ${message ?? 'null'}, date: ${humanReadableTimestamp}>`;

  if (error !== null && error !== undefined) {
    if (error.stack !== undefined) {
      errorMessage += `\n${error.stack}`;
    }
  }

  if (stackTrace !== null && stackTrace !== undefined) {
    errorMessage += `\n${stackTrace}`;
  }

  console.log(errorMessage);
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
