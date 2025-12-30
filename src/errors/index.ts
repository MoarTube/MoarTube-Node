/**
 * Errors Module
 *
 * Barrel export for all error classes.
 */

// Base error
export { AppError } from '@errors/base.js';

// HTTP errors
export {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  TooManyRequestsError,
  InternalServerError,
  BadGatewayError,
  ServiceUnavailableError,
  ValidationError,
  type ValidationErrorDetails,
} from '@errors/http.js';
