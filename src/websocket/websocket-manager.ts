/**
 * WebSocket Manager
 *
 * Central manager for WebSocket connections and message routing.
 * Coordinates message handlers and provides broadcast capabilities.
 */

import type { WebSocket as WsWebSocket } from 'ws';
import type {
  ExtendedWebSocket,
  WebSocketMessage,
  IncomingWebSocketMessage,
  WebSocketClientType,
  BroadcastOptions,
  LiveStreamWatchingCounts,
} from '../types/websocket.js';
import type { HandlerContext, WebSocketHandler } from './handlers/base.js';
import { ChatMessageHandler } from './handlers/chat.js';
import { LiveStreamHandler } from './handlers/stream.js';
import { VideoStatusHandler } from './handlers/video-status.js';
import { EchoHandler } from './handlers/echo.js';
import { Logger, type ILogger } from '../utils/logger.js';

/**
 * Logger interface for the WebSocket manager
 */
export type WebSocketLogger = ILogger;

/**
 * Configuration options for WebSocket Manager
 */
export interface WebSocketManagerOptions {
  /** Logger instance */
  logger?: WebSocketLogger;
  /** Heartbeat interval in milliseconds (0 to disable) */
  heartbeatInterval?: number;
  /** Client timeout in milliseconds */
  clientTimeout?: number;
}

/**
 * Default logger using Logger class with WebSocket prefix
 */
const defaultLogger: WebSocketLogger = new Logger({ prefix: 'WS' });

/**
 * WebSocket connection manager
 *
 * Manages WebSocket clients, routes messages to handlers,
 * and provides broadcast functionality.
 */
export class WebSocketManager {
  private readonly handlers: WebSocketHandler[] = [];
  private readonly clients: Set<ExtendedWebSocket> = new Set();
  private readonly logger: WebSocketLogger;
  private readonly heartbeatInterval: number;
  private readonly clientTimeout: number;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private clientIdCounter = 0;

  constructor(options: WebSocketManagerOptions = {}) {
    this.logger = options.logger ?? defaultLogger;
    this.heartbeatInterval = options.heartbeatInterval ?? 30000;
    this.clientTimeout = options.clientTimeout ?? 60000;

    // Register default handlers
    this.registerDefaultHandlers();
  }

  /**
   * Register default message handlers
   */
  private registerDefaultHandlers(): void {
    this.registerHandler(new ChatMessageHandler());
    this.registerHandler(new LiveStreamHandler());
    this.registerHandler(new VideoStatusHandler());
    this.registerHandler(new EchoHandler());
  }

  /**
   * Register a message handler
   */
  registerHandler(handler: WebSocketHandler): void {
    this.handlers.push(handler);
    this.logger.debug(`Registered handler: ${handler.name}`);
  }

  /**
   * Start the heartbeat timer
   */
  startHeartbeat(): void {
    if (this.heartbeatInterval <= 0) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      this.checkClientHealth();
    }, this.heartbeatInterval);
  }

  /**
   * Stop the heartbeat timer
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Check client health and remove stale connections
   */
  private checkClientHealth(): void {
    const now = Date.now();
    const staleClients: ExtendedWebSocket[] = [];

    for (const client of this.clients) {
      if (client.lastActivity !== undefined && now - client.lastActivity > this.clientTimeout) {
        staleClients.push(client);
      }
    }

    for (const client of staleClients) {
      this.logger.warn('Removing stale client', { clientId: client.clientId });
      this.removeClient(client);
      client.close(1000, 'Connection timeout');
    }
  }

  /**
   * Add a new client connection
   */
  addClient(
    ws: WsWebSocket,
    clientType: WebSocketClientType = 'viewer',
    isAuthenticated = false
  ): ExtendedWebSocket {
    const client = ws as ExtendedWebSocket;

    // Assign client metadata
    client.clientId = `client_${++this.clientIdCounter}_${Date.now()}`;
    client.socketType = clientType;
    client.isAuthenticated = isAuthenticated;
    client.lastActivity = Date.now();

    this.clients.add(client);

    this.logger.debug('Client connected', {
      clientId: client.clientId,
      type: clientType,
    });

    // Notify handlers of new connection
    const context = this.createHandlerContext();
    for (const handler of this.handlers) {
      if (handler.onConnect !== undefined) {
        void Promise.resolve(handler.onConnect(client, context)).catch((error: unknown) => {
          this.logger.error(`Handler ${handler.name} onConnect error`, error as Error);
        });
      }
    }

    return client;
  }

  /**
   * Remove a client connection
   */
  removeClient(client: ExtendedWebSocket): void {
    if (!this.clients.has(client)) {
      return;
    }

    this.clients.delete(client);

    this.logger.debug('Client disconnected', {
      clientId: client.clientId,
    });

    // Notify handlers of disconnection
    const context = this.createHandlerContext();
    for (const handler of this.handlers) {
      if (handler.onDisconnect !== undefined) {
        void Promise.resolve(handler.onDisconnect(client, context)).catch((error: unknown) => {
          this.logger.error(`Handler ${handler.name} onDisconnect error`, error as Error);
        });
      }
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(client: ExtendedWebSocket, rawMessage: string | Buffer): void {
    // Update activity timestamp
    client.lastActivity = Date.now();

    let message: IncomingWebSocketMessage;

    try {
      const messageStr = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString('utf-8');
      message = JSON.parse(messageStr) as IncomingWebSocketMessage;
    } catch {
      this.logger.warn('Failed to parse WebSocket message', {
        clientId: client.clientId,
      });
      return;
    }

    if (!message.eventName) {
      this.logger.warn('Message missing eventName', { clientId: client.clientId });
      return;
    }

    // Find and execute handler
    const context = this.createHandlerContext();
    let handled = false;

    for (const handler of this.handlers) {
      if (handler.canHandle(message)) {
        handled = true;
        try {
          void Promise.resolve(handler.handle(client, message, context)).catch((error: unknown) => {
            this.logger.error(`Handler ${handler.name} error`, error as Error, {
              eventName: message.eventName,
            });
          });
        } catch (error) {
          this.logger.error(`Handler ${handler.name} sync error`, error as Error, {
            eventName: message.eventName,
          });
        }
        break; // Only one handler per message
      }
    }

    if (!handled) {
      this.logger.debug('No handler for message', { eventName: message.eventName });
    }
  }

  /**
   * Check if client should receive the broadcast based on filter options
   */
  private shouldReceiveBroadcast(client: ExtendedWebSocket, options?: BroadcastOptions): boolean {
    // Skip if not open
    if (client.readyState !== 1) {
      return false;
    }

    if (options === undefined) {
      return true;
    }

    // Video ID filter
    if (options.videoId !== undefined && client.videoId !== options.videoId) {
      return false;
    }

    // Client type filter
    if (options.clientTypes !== undefined && !options.clientTypes.includes(client.socketType)) {
      return false;
    }

    // Exclude specific clients
    if (
      options.excludeClients !== undefined &&
      client.clientId !== undefined &&
      options.excludeClients.includes(client.clientId)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Broadcast message to clients
   */
  broadcast(message: WebSocketMessage, options?: BroadcastOptions): void {
    const messageStr = JSON.stringify(message);

    for (const client of this.clients) {
      if (!this.shouldReceiveBroadcast(client, options)) {
        continue;
      }

      try {
        client.send(messageStr);
      } catch (error) {
        this.logger.error('Failed to send message to client', error as Error, {
          clientId: client.clientId,
        });
      }
    }
  }

  /**
   * Broadcast to clients watching a specific video
   */
  broadcastToVideo(videoId: string, message: WebSocketMessage): void {
    this.broadcast(message, { videoId });
  }

  /**
   * Broadcast to admin clients
   */
  broadcastToAdmins(message: WebSocketMessage): void {
    for (const client of this.clients) {
      if (
        client.readyState === 1 &&
        (client.socketType === 'admin' || client.isAuthenticated === true)
      ) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          this.logger.error('Failed to send to admin', error as Error);
        }
      }
    }
  }

  /**
   * Send message to a specific client
   */
  sendTo(client: ExtendedWebSocket, message: WebSocketMessage): void {
    if (client.readyState !== 1) {
      return;
    }

    try {
      client.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error('Failed to send message', error as Error, {
        clientId: client.clientId,
      });
    }
  }

  /**
   * Get live stream watching counts
   */
  getLiveStreamWatchingCounts(): LiveStreamWatchingCounts {
    const counts: LiveStreamWatchingCounts = {};

    for (const client of this.clients) {
      if (client.socketType === 'node_peer' && client.videoId !== undefined) {
        const videoId = client.videoId;
        counts[videoId] = (counts[videoId] ?? 0) + 1;
      }
    }

    return counts;
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all connected clients
   */
  getClients(): Set<ExtendedWebSocket> {
    return this.clients;
  }

  /**
   * Close all client connections
   */
  closeAll(code = 1001, reason = 'Server shutting down'): void {
    for (const client of this.clients) {
      try {
        client.close(code, reason);
      } catch {
        // Ignore close errors
      }
    }
    this.clients.clear();
    this.stopHeartbeat();
  }

  /**
   * Create handler context
   */
  private createHandlerContext(): HandlerContext {
    return {
      broadcast: (message, videoId): void => {
        if (videoId !== undefined) {
          this.broadcastToVideo(videoId, message);
        } else {
          this.broadcast(message);
        }
      },
      sendTo: (client, message): void => {
        this.sendTo(client, message);
      },
      getClients: (): Set<ExtendedWebSocket> => this.clients,
      log: this.logger,
    };
  }
}
