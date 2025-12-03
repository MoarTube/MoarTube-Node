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
   * @param messageOrStatus - Optional message string or HTTP status code (default: 200)
   */
  protected sendSuccess<T>(
    reply: FastifyReply,
    data: T,
    messageOrStatus: string | number = 200
  ): void {
    const status = typeof messageOrStatus === 'number' ? messageOrStatus : 200;
    const response = { isError: false as const, ...data };
    void reply.status(status).send(response);
  }

  /**
   * Send a success response without additional data
   *
   * @param reply - Fastify reply object
   * @param status - HTTP status code (default: 200)
   */
  protected sendOk(reply: FastifyReply, status = 200): void {
    void reply.status(status).send({ isError: false });
  }

  /**
   * Send an error response
   *
   * @param reply - Fastify reply object
   * @param message - Error message
   * @param status - HTTP status code (default: 400)
   */
  protected sendError(reply: FastifyReply, message: string, status = 400): void {
    void reply.status(status).send({ isError: true, message });
  }

  /**
   * Send a paginated response
   *
   * @param reply - Fastify reply object
   * @param data - Array of items
   * @param total - Total count (before pagination)
   * @param page - Current page (1-indexed)
   * @param limit - Items per page
   */
  protected sendPaginated<T>(
    reply: FastifyReply,
    data: T[],
    total: number,
    page: number,
    limit: number
  ): void {
    const pages = Math.ceil(total / limit);
    const hasMore = page < pages;

    const response: PaginatedResponse<T> = {
      isError: false,
      data,
      pagination: {
        total,
        page,
        limit,
        pages,
        hasMore,
      },
    };

    void reply.send(response);
  }

  /**
   * Send raw data (for compatibility with existing API)
   *
   * @param reply - Fastify reply object
   * @param data - Raw data to send
   * @param status - HTTP status code (default: 200)
   */
  protected sendRaw(reply: FastifyReply, data: unknown, status = 200): void {
    void reply.status(status).send(data);
  }
}
