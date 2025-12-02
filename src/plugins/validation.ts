/**
 * Validation Plugin
 *
 * Zod-based request validation for Fastify.
 * Provides validation hooks that can be used as preValidation handlers.
 */
import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  preValidationHookHandler,
} from 'fastify';
import fp from 'fastify-plugin';
import type { ZodSchema, ZodTypeAny, infer as ZodInfer, ZodError } from 'zod';
import { ValidationError, type ValidationErrorDetails } from '../errors';

/**
 * Extended request with validation types
 */
declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Validated request body (typed by schema)
     */
    validatedBody?: unknown;

    /**
     * Validated query parameters (typed by schema)
     */
    validatedQuery?: unknown;

    /**
     * Validated route parameters (typed by schema)
     */
    validatedParams?: unknown;
  }
}

/**
 * Convert Zod error to validation error details
 */
function zodToValidationDetails(error: ZodError): ValidationErrorDetails[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Create a body validation preValidation hook
 *
 * @param schema - Zod schema to validate body against
 * @returns Fastify preValidation hook handler
 *
 * @example
 * ```typescript
 * fastify.post('/videos/import', {
 *   preValidation: validateBody(videoImportBodySchema)
 * }, handler);
 * ```
 */
export function validateBody<T extends ZodTypeAny>(schema: T): preValidationHookHandler {
  const handler: preValidationHookHandler = (
    request: FastifyRequest,
    _reply: FastifyReply,
    done
  ) => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      done(new ValidationError('Invalid request body', zodToValidationDetails(result.error)));
      return;
    }

    // Store validated data and replace body
    request.validatedBody = result.data;
    request.body = result.data;
    done();
  };
  return handler;
}

/**
 * Create a query validation preValidation hook
 *
 * @param schema - Zod schema to validate query against
 * @returns Fastify preValidation hook handler
 *
 * @example
 * ```typescript
 * fastify.get('/videos/search', {
 *   preValidation: validateQuery(videoSearchQuerySchema)
 * }, handler);
 * ```
 */
export function validateQuery<T extends ZodTypeAny>(schema: T): preValidationHookHandler {
  const handler: preValidationHookHandler = (
    request: FastifyRequest,
    _reply: FastifyReply,
    done
  ) => {
    const result = schema.safeParse(request.query);

    if (!result.success) {
      done(new ValidationError('Invalid query parameters', zodToValidationDetails(result.error)));
      return;
    }

    // Store validated data and replace query
    request.validatedQuery = result.data;
    (request as unknown as { query: ZodInfer<T> }).query = result.data;
    done();
  };
  return handler;
}

/**
 * Create a params validation preValidation hook
 *
 * @param schema - Zod schema to validate params against
 * @returns Fastify preValidation hook handler
 *
 * @example
 * ```typescript
 * fastify.get('/videos/:videoId', {
 *   preValidation: validateParams(videoIdParamsSchema)
 * }, handler);
 * ```
 */
export function validateParams<T extends ZodTypeAny>(schema: T): preValidationHookHandler {
  const handler: preValidationHookHandler = (
    request: FastifyRequest,
    _reply: FastifyReply,
    done
  ) => {
    const result = schema.safeParse(request.params);

    if (!result.success) {
      done(new ValidationError('Invalid route parameters', zodToValidationDetails(result.error)));
      return;
    }

    // Store validated data and replace params
    request.validatedParams = result.data;
    (request as unknown as { params: ZodInfer<T> }).params = result.data;
    done();
  };
  return handler;
}

/**
 * Create a combined validation preValidation hook
 *
 * @param options - Object with schemas for body, query, and/or params
 * @returns Fastify preValidation hook handler
 *
 * @example
 * ```typescript
 * fastify.post('/videos/:videoId/data', {
 *   preValidation: validate({
 *     params: videoIdParamsSchema,
 *     body: videoDataBodySchema
 *   })
 * }, handler);
 * ```
 */
export function validate<
  TBody extends ZodTypeAny = ZodSchema,
  TQuery extends ZodTypeAny = ZodSchema,
  TParams extends ZodTypeAny = ZodSchema,
>(options: { body?: TBody; query?: TQuery; params?: TParams }): preValidationHookHandler {
  const handler: preValidationHookHandler = (
    request: FastifyRequest,
    _reply: FastifyReply,
    done
  ) => {
    const errors: ValidationErrorDetails[] = [];

    // Validate params
    if (options.params !== undefined) {
      const result = options.params.safeParse(request.params);
      if (!result.success) {
        errors.push(
          ...zodToValidationDetails(result.error).map((e) => ({
            ...e,
            field: `params.${e.field}`,
          }))
        );
      } else {
        request.validatedParams = result.data;
        (request as unknown as { params: unknown }).params = result.data;
      }
    }

    // Validate query
    if (options.query !== undefined) {
      const result = options.query.safeParse(request.query);
      if (!result.success) {
        errors.push(
          ...zodToValidationDetails(result.error).map((e) => ({
            ...e,
            field: `query.${e.field}`,
          }))
        );
      } else {
        request.validatedQuery = result.data;
        (request as unknown as { query: unknown }).query = result.data;
      }
    }

    // Validate body
    if (options.body !== undefined) {
      const result = options.body.safeParse(request.body);
      if (!result.success) {
        errors.push(
          ...zodToValidationDetails(result.error).map((e) => ({
            ...e,
            field: `body.${e.field}`,
          }))
        );
      } else {
        request.validatedBody = result.data;
        request.body = result.data;
      }
    }

    // Throw if any validation errors
    if (errors.length > 0) {
      done(new ValidationError('Validation failed', errors));
      return;
    }
    done();
  };
  return handler;
}

/**
 * Validation plugin
 *
 * Registers validation helpers with Fastify.
 */
function validationPlugin(fastify: FastifyInstance): void {
  // Decorate request with validation properties
  fastify.decorateRequest('validatedBody', undefined);
  fastify.decorateRequest('validatedQuery', undefined);
  fastify.decorateRequest('validatedParams', undefined);
}

export default fp(validationPlugin, {
  name: 'validation',
  fastify: '4.x',
});
