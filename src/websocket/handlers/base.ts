/**
 * Base WebSocket Handler
 *
 * Abstract base class for all WebSocket message handlers.
 * Provides a common interface for handling different message types.
 */

import type {
  ExtendedWebSocket,
  WebSocketMessage,
  IncomingWebSocketMessage,
} from '../../types/websocket.js';
import { Logger, type ILogger } from '../../utils/logger.js';

/**
 * Handler context passed to handle methods
 */
export interface HandlerContext {
  /** Broadcast function to send to all clients */
  broadcast: (message: WebSocketMessage, videoId?: string) => void;
  /** Send to a specific client */
  sendTo: (client: ExtendedWebSocket, message: WebSocketMessage) => void;
  /** Get all connected clients */
  getClients: () => Set<ExtendedWebSocket>;
  /** Logger instance */
  log: ILogger;
}

/**
 * Abstract base class for WebSocket message handlers
 *
 * Each handler is responsible for:
 * 1. Determining if it can handle a specific message type
 * 2. Processing the message and taking appropriate action
 */
export abstract class WebSocketHandler {
  /**
   * Handler name for logging purposes
   */
  abstract readonly name: string;

  /**
   * Logger instance
   */
  protected readonly logger: ILogger = Logger.getInstance();

  /**
   * Check if this handler can process the given message
   *
   * @param message - The incoming WebSocket message
   * @returns True if this handler should process the message
   */
  abstract canHandle(message: IncomingWebSocketMessage): boolean;

  /**
   * Handle the WebSocket message
   *
   * @param client - The WebSocket client that sent the message
   * @param message - The parsed message
   * @param context - Handler context with utilities
   */
  abstract handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void | Promise<void>;

  /**
   * Process the validated message
   * Called by handle() after message validation
   *
   * @param client - The WebSocket client that sent the message
   * @param validatedMessage - The validated message data
   * @param context - Handler context with utilities
   */
  protected abstract processMessage(
    client: ExtendedWebSocket,
    validatedMessage: unknown,
    context: HandlerContext
  ): void | Promise<void>;

  /**
   * Called when a client connects
   * Override in subclasses if needed
   */
  onConnect?(client: ExtendedWebSocket, context: HandlerContext): void | Promise<void>;

  /**
   * Called when a client disconnects
   * Override in subclasses if needed
   */
  onDisconnect?(client: ExtendedWebSocket, context: HandlerContext): void | Promise<void>;
}
