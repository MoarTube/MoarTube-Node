/**
 * Base Error Classes
 *
 * Custom error classes for handling application errors with proper
 * HTTP status codes and operational/programmer error distinction.
 */

/**
 * Base application error class
 *
 * All custom errors should extend this class.
 * - Operational errors are expected errors (user input, network issues)
 * - Programmer errors are unexpected bugs that should crash the process
 */
export abstract class AppError extends Error {
  /** HTTP status code for this error */
  abstract readonly statusCode: number;

  /** Whether this is an operational (expected) error */
  abstract readonly isOperational: boolean;

  /** Original error that caused this error (for error chaining) */
  override readonly cause?: Error | undefined;

  /** Override the name property */
  override readonly name: string;

  constructor(message: string, cause?: Error) {
    super(message);
    this.cause = cause;

    // Maintains proper stack trace for where our error was thrown
    Object.setPrototypeOf(this, new.target.prototype);
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }

    // Set error name to the class name
    this.name = this.constructor.name;
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON(): Record<string, unknown> {
    return {
      isError: true,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}
