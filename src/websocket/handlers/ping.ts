/**
 * Ping Handler
 *
 * Handles 'ping' events from clients and responds with 'pong'.
 * Used for keep-alive and connection health checks.
 */

import type { ExtendedWebSocket, IncomingWebSocketMessage } from '@/types/index.js';
import { WebSocketHandler, type HandlerContext } from '@websocket/handlers/base.js';

/**
 * Handler for ping events
 */
export class PingHandler extends WebSocketHandler {
  readonly name = 'PingHandler';

  /**
   * Check if this is a ping event
   */
  canHandle(message: IncomingWebSocketMessage): boolean {
    return message.eventName === 'ping';
  }

  /**
   * Handle ping event
   */
  handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage, // eslint-disable-line @typescript-eslint/no-unused-vars
    context: HandlerContext
  ): void {
    // Respond with pong
    context.sendTo(client, { eventName: 'pong' } as any);
  }
}
