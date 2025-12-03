/**
 * Error Handler Plugin
 *
 * Centralized error handling for Fastify.
 * Converts errors to consistent API responses.
 */
import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError, ValidationError, type ValidationErrorDetails } from '../errors/index.js';

/**
 * Standard API error response
 */
interface ApiErrorResponse {
  isError: true;
  message: string;
  errors?: ValidationErrorDetails[];
}

/**
 * Convert Zod errors to validation error details
 */
function zodErrorToDetails(error: ZodError): ValidationErrorDetails[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Error handler plugin
 *
 * Provides consistent error responses across all endpoints.
 * Handles:
 * - Custom AppError subclasses
 * - Zod validation errors
 * - Fastify validation errors
 * - Unknown/unexpected errors
 */
function errorHandlerPlugin(fastify: FastifyInstance): void {
  fastify.setErrorHandler(
    (
      error: FastifyError | AppError | ZodError | Error,
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      const logger = request.log;

      // Custom application errors
      if (error instanceof AppError) {
        if (!error.isOperational) {
          // Log unexpected errors with full stack trace
          logger.error(error, 'Unexpected application error');
        } else {
          logger.warn({ err: error, statusCode: error.statusCode }, error.message);
        }

        const response: ApiErrorResponse = {
          isError: true,
          message: error.message,
        };

        if (error instanceof ValidationError) {
          response.errors = error.errors;
        }

        return reply.status(error.statusCode).send(response);
      }

      // Zod validation errors
      if (error instanceof ZodError) {
        logger.warn({ err: error }, 'Zod validation error');

        const response: ApiErrorResponse = {
          isError: true,
          message: 'Validation failed',
          errors: zodErrorToDetails(error),
        };

        return reply.status(400).send(response);
      }

      // Fastify validation errors (from schema validation)
      const fastifyError = error as FastifyError;
      if (fastifyError.validation !== undefined) {
        logger.warn({ err: error }, 'Fastify validation error');

        const response: ApiErrorResponse = {
          isError: true,
          message: 'Validation failed',
          errors: fastifyError.validation.map(
            (v: {
              instancePath?: string;
              params?: { missingProperty?: string };
              message?: string;
            }) => {
              const path = (v.instancePath ?? '').replace(/^\//, '').replaceAll('/', '.');
              const field = path.length > 0 ? path : (v.params?.missingProperty ?? 'unknown');
              return {
                field,
                message: v.message ?? 'Validation error',
              };
            }
          ),
        };

        return reply.status(400).send(response);
      }

      // Known HTTP status code errors from Fastify
      if (fastifyError.statusCode !== undefined && fastifyError.statusCode < 500) {
        logger.warn({ err: error, statusCode: fastifyError.statusCode }, fastifyError.message);

        const response: ApiErrorResponse = {
          isError: true,
          message: fastifyError.message,
        };

        return reply.status(fastifyError.statusCode).send(response);
      }

      // Unexpected errors - log full details
      logger.error(error, 'Unhandled error');

      const response: ApiErrorResponse = {
        isError: true,
        message: 'error communicating with the MoarTube node',
      };

      return reply.status(500).send(response);
    }
  );

  // Handle 404 routes
  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    request.log.warn({ url: request.url, method: request.method }, 'Route not found');

    const response: ApiErrorResponse = {
      isError: true,
      message: 'Route not found',
    };

    return reply.status(404).send(response);
  });
}

export default fp(errorHandlerPlugin, {
  name: 'errorHandler',
  fastify: '5.x',
});
