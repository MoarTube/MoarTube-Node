/**
 * HTTP Error Classes
 *
 * Specific error classes for common HTTP error responses.
 * These errors are operational (expected) and should be caught and handled.
 */
import { AppError } from './base.js';

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
 * 409 Conflict
 * Used when the request conflicts with current state (e.g., duplicate resource)
 */
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly isOperational = true;

  constructor(message = 'Conflict') {
    super(message);
  }
}

/**
 * 422 Unprocessable Entity
 * Used when the request is well-formed but contains semantic errors
 */
export class UnprocessableEntityError extends AppError {
  readonly statusCode = 422;
  readonly isOperational = true;

  constructor(message = 'Unprocessable entity') {
    super(message);
  }
}

/**
 * 429 Too Many Requests
 * Used when rate limiting kicks in
 */
export class TooManyRequestsError extends AppError {
  readonly statusCode = 429;
  readonly isOperational = true;

  constructor(message = 'Too many requests') {
    super(message);
  }
}

/**
 * 500 Internal Server Error
 * Used for unexpected server errors - NOT operational (indicates bug)
 */
export class InternalServerError extends AppError {
  readonly statusCode = 500;
  readonly isOperational = false;

  constructor(message = 'Internal server error', cause?: Error) {
    super(message, cause);
  }
}

/**
 * 502 Bad Gateway
 * Used when an upstream service fails
 */
export class BadGatewayError extends AppError {
  readonly statusCode = 502;
  readonly isOperational = true;

  constructor(message = 'Bad gateway') {
    super(message);
  }
}

/**
 * 503 Service Unavailable
 * Used when the service is temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly isOperational = true;

  constructor(message = 'Service unavailable') {
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
