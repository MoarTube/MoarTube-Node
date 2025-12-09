/**
 * Base Service Class
 *
 * Abstract base class that provides common functionality for all service classes.
 * Services should extend this class to inherit common utilities and patterns.
 */

// Logger types defined inline to avoid dependency on api types

/**
 * Logger interface for services
 */
export interface ServiceLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/**
 * Simple console logger implementation
 */
class ConsoleLogger implements ServiceLogger {
  constructor(private readonly serviceName: string) {}

  private formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context !== undefined ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level}] [${this.serviceName}] ${message}${contextStr}`;
  }

  /* eslint-disable no-console */
  debug(message: string, context?: Record<string, unknown>): void {
    console.log(this.formatMessage('DEBUG', message, context));
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.log(this.formatMessage('INFO', message, context));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(this.formatMessage('WARN', message, context));
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    const errorContext =
      error !== undefined ? { ...context, error: error.message, stack: error.stack } : context;
    console.error(this.formatMessage('ERROR', message, errorContext));
  }
  /* eslint-enable no-console */
}

/**
 * Service initialization options
 */
export interface ServiceOptions {
  logger?: ServiceLogger;
}

/**
 * Abstract base service class
 *
 * Provides:
 * - Structured logging
 * - Common utility methods
 * - Error handling patterns
 */
export abstract class BaseService {
  protected readonly logger: ServiceLogger;

  constructor(serviceName: string, options?: ServiceOptions) {
    this.logger = options?.logger ?? new ConsoleLogger(serviceName);
  }

  /**
   * Gets the current Unix timestamp in milliseconds
   */
  protected getCurrentTimestampMs(): number {
    return Date.now();
  }

  /**
   * Safely parses JSON with error handling
   *
   * @param json - JSON string to parse
   * @param fallback - Default value if parsing fails
   * @returns Parsed value or fallback
   */
  protected safeJsonParse<T>(json: string, fallback: T): T {
    try {
      return JSON.parse(json) as T;
    } catch {
      return fallback;
    }
  }

  /**
   * Wraps an async operation with error logging
   *
   * @param operation - Operation name for logging
   * @param fn - Async function to execute
   * @returns Promise with result or throws
   */
  protected async withErrorLogging<T>(operation: string, fn: () => T | Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(`${operation} failed`, error as Error);
      throw error;
    }
  }

  /**
   * Sanitize string by removing extra whitespace
   *
   * @param str - String to sanitize
   * @returns Sanitized string
   */
  protected sanitizeWhitespace(str: string): string {
    return str.replaceAll(/\s+/g, ' ').trim();
  }

  /**
   * Generate a unique ID using cryptographically secure random generation
   *
   * @param length - Length of the ID (default: 11)
   * @returns Generated unique ID
   */
  protected generateId(length: number = 11): string {
    const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';

    let hyphenCount = 0;
    let underscoreCount = 0;

    let id = '';

    for (let i = 0; i < length; ) {
      const randomChar = characters.charAt(Math.floor(Math.random() * characters.length));

      // Limit special characters
      if (randomChar === '-') {
        hyphenCount++;
        if (hyphenCount > 1) {
          continue;
        }
      } else if (randomChar === '_') {
        underscoreCount++;
        if (underscoreCount > 1) {
          continue;
        }
      } else {
        id += randomChar;
        i++;
      }
    }

    return id;
  }

  /**
   * Delay execution for specified milliseconds
   *
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after delay
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
