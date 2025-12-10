/**
 * Base Controller
 *
 * Abstract base class providing common functionality for all controllers.
 * Includes standardized response methods and error handling.
 */
import type { FastifyReply } from 'fastify';
import { Logger, type ILogger } from '../utils/logger.js';

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T = unknown> {
  isError: false;
  data?: T;
  [key: string]: unknown;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  isError: true;
  message: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  isError: false;
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
    hasMore: boolean;
  };
}

/**
 * Base controller class
 *
 * Provides utility methods for sending consistent API responses.
 * All controllers should extend this class.
 */
export abstract class BaseController {
  /**
   * Controller name for logging
   */
  protected readonly controllerName: string;

  /**
   * Logger instance for the controller
   */
  protected readonly logger: ILogger;

  constructor(name: string) {
    this.controllerName = name;
    this.logger = new Logger({ prefix: name });
  }

  /**
   * Send a success response with data
   *
   * @param reply - Fastify reply object
   * @param data - Response data
   * @param status - HTTP status code (default: 200)
   */
  protected sendSuccess(reply: FastifyReply, data: object, status: number = 200): FastifyReply {
    const response = { isError: false as const, ...data };

    return reply.status(status).send(response);
  }

  /**
   * Send a success response without additional data
   *
   * @param reply - Fastify reply object
   * @param status - HTTP status code (default: 200)
   */
  protected sendOk(reply: FastifyReply, status = 200): FastifyReply {
    return reply.status(status).send({ isError: false });
  }

  /**
   * Send an error response
   *
   * @param reply - Fastify reply object
   * @param message - Error message
   * @param status - HTTP status code (default: 400)
   */
  protected sendError(reply: FastifyReply, message: string, status = 400): FastifyReply {
    return reply.status(status).send({ isError: true, message });
  }
}
