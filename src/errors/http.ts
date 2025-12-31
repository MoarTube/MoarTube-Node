/**
 * HTTP Error Classes
 *
 * Specific error classes for common HTTP error responses.
 * These errors are operational (expected) and should be caught and handled.
 */
import { AppError } from '@errors/base.js';

/**
 * 400 Bad Request
 * Used when the request is malformed or contains invalid data
 */
export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly isOperational = true;

  constructor(message = 'Bad request') {
    super(message);
  }
}

/**
 * 401 Unauthorized
 * Used when authentication is required but missing or invalid
 */
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly isOperational = true;

  constructor(message = 'Unauthorized') {
    super(message);
  }
}

/**
 * 403 Forbidden
 * Used when the user is authenticated but doesn't have permission
 */
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly isOperational = true;

  constructor(message = 'Forbidden') {
    super(message);
  }
}

/**
 * 404 Not Found
 * Used when the requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly isOperational = true;

  constructor(message = 'Not found') {
    super(message);
  }
}

/**
 * Validation error with field-level details
 */
export interface ValidationErrorDetails {
  field: string;
  message: string;
  code?: string;
}

/**
 * 400 Validation Error
 * Extension of BadRequestError with validation-specific error details
 */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly isOperational = true;
  readonly errors: ValidationErrorDetails[];

  constructor(message = 'Validation failed', errors: ValidationErrorDetails[] = []) {
    super(message);
    this.errors = errors;
  }

  override toJSON(): Record<string, unknown> {
    return {
      isError: true,
      message: this.message,
      statusCode: this.statusCode,
      errors: this.errors,
    };
  }
}
