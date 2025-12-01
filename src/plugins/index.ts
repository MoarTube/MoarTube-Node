/**
 * Fastify Plugins Module
 *
 * Barrel export for all Fastify plugins.
 */

// Error handling
export { default as errorHandlerPlugin } from './error-handler.plugin';

// Authentication
export { default as authenticationPlugin } from './authentication.plugin';

// Validation
export {
  default as validationPlugin,
  validateBody,
  validateQuery,
  validateParams,
  validate,
} from './validation.plugin';
