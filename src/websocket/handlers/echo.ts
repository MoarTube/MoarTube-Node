/**
 * Echo Handler
 *
 * Handles generic echo/broadcast events for admin-initiated
 * broadcasts to all connected clients.
 */

import type {
  ExtendedWebSocket,
  IncomingWebSocketMessage,
  EchoMessage,
} from '../../types/websocket.js';
import { WebSocketHandler, type HandlerContext } from './base.js';

/**
 * Handler for echo/broadcast events
 */
export class EchoHandler extends WebSocketHandler {
  readonly name = 'EchoHandler';

  /**
   * Check if this is an echo event
   */
  canHandle(message: IncomingWebSocketMessage): boolean {
    return message.eventName === 'echo';
  }

  /**
   * Handle echo/broadcast events
   */
  handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void {
    // Only authenticated/admin clients can send echo broadcasts
    if (client.socketType !== 'admin' && client.isAuthenticated !== true) {
      context.log.warn('Unauthorized echo attempt', { clientId: client.clientId });
      return;
    }

    const echoMessage = message as unknown as EchoMessage;

    if (!echoMessage.data.eventName) {
      context.log.warn('Invalid echo message format', { clientId: client.clientId });
      return;
    }

    context.log.debug('Broadcasting echo message', {
      eventName: echoMessage.data.eventName,
    });

    // Broadcast to all clients
    context.broadcast(echoMessage);
  }
}
