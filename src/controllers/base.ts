/**
 * Base Controller
 *
 * Abstract base class providing common functionality for all controllers.
 * Includes standardized response methods and error handling.
 */
import type { FastifyReply } from 'fastify';
import fs from 'node:fs';
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
   * @param data - Response data (optional)
   * @param status - HTTP status code (default: 200)
   */
  protected sendSuccess(reply: FastifyReply, data?: object, status: number = 200): FastifyReply {
    const response = data ? { isError: false as const, ...data } : { isError: false as const };

    return reply.status(status).send(response);
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

  /**
   * Send a file response
   *
   * @param reply - Fastify reply object
   * @param filePath - Path to the file to send
   * @param contentType - MIME type of the file
   */
  protected sendFile(reply: FastifyReply, filePath: string, contentType: string): FastifyReply {
    if (!fs.existsSync(filePath)) {
      return this.sendError(reply, 'file not found', 404);
    }

    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);

    return reply
      .header('Content-Type', contentType)
      .header('Content-Length', stat.size)
      .send(stream);
  }

  /**
   * Send a file chunk response for range requests
   *
   * @param reply - Fastify reply object
   * @param filePath - Path to the file to send
   * @param start - Start byte position
   * @param end - End byte position
   * @param fileSize - Total file size
   * @param contentType - MIME type of the file
   */
  protected sendChunk(
    reply: FastifyReply,
    filePath: string,
    start: number,
    end: number,
    fileSize: number,
    chunkSize: number,
    contentType: string
  ): FastifyReply {
    const fileStream = fs.createReadStream(filePath, { start, end });

    return reply
      .status(206)
      .header('Content-Range', `bytes ${String(start)}-${String(end)}/${String(fileSize)}`)
      .header('Accept-Ranges', 'bytes')
      .header('Content-Length', chunkSize)
      .header('Content-Type', contentType)
      .send(fileStream);
  }
}
