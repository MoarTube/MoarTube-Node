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
import { echoEventSchema, type EchoEvent } from '../../validators/schemas/index.js';
import { ZodError } from 'zod';

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
    // Only authenticated clients or moartube_client can send echo broadcasts
    if (
      client.socketType !== 'admin' &&
      client.socketType !== 'moartube_client' &&
      client.isAuthenticated !== true
    ) {
      context.log.warn('Unauthorized echo attempt', { clientId: client.clientId });
      return;
    }

    try {
      const echoMessage = echoEventSchema.parse(message);
      this.processMessage(echoMessage, context);
    } catch (error) {
      if (error instanceof ZodError) {
        context.log.warn('Invalid echo message format', {
          errors: error.issues,
          clientId: client.clientId,
        });
      } else {
        context.log.error('Error parsing echo message', error, { clientId: client.clientId });
      }
    }
  }

  /**
   * Process validated echo message
   */
  protected processMessage(validatedMessage: unknown, context: HandlerContext): void {
    const echoMessage = validatedMessage as EchoEvent;
    const { data } = echoMessage;

    context.log.debug('Broadcasting echo message', {
      eventName: data.eventName,
    });

    // Broadcast to all clients
    context.broadcast(echoMessage as EchoMessage);
  }
}
