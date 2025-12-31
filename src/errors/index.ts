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
  ValidationError,
  type ValidationErrorDetails,
} from '@errors/http.js';
