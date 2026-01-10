/**
 * Register Handler
 *
 * Handles client registration messages to establish client type and authentication.
 */

import type { ExtendedWebSocket, IncomingWebSocketMessage } from '@/types/index.js';
import { WebSocketHandler, type HandlerContext } from '@websocket/handlers/base.js';
import jwt from 'jsonwebtoken';
import { getConfig } from '@config/index.js';
import { registerEventSchema, type RegisterEvent } from '@validators/schemas/index.js';
import { ZodError } from 'zod';

/**
 * Handler for client registration
 */
export class RegisterHandler extends WebSocketHandler {
  readonly name = 'RegisterHandler';

  /**
   * Check if this is a register event
   */
  canHandle(message: IncomingWebSocketMessage): boolean {
    return message.eventName === 'register';
  }

  /**
   * Handle client registration
   */
  handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void {
    try {
      const registerMessage = registerEventSchema.parse(message);
      this.processMessage(client, registerMessage, context);
    } catch (error) {
      if (error instanceof ZodError) {
        context.log.warn('Invalid register event format', {
          errors: error.issues,
          clientId: client.clientId,
        });
      } else {
        context.log.error('Error parsing register event', error, { clientId: client.clientId });
      }
    }
  }

  /**
   * Process validated registration message
   */
  protected processMessage(
    client: ExtendedWebSocket,
    validatedMessage: unknown,
    context: HandlerContext
  ): void {
    const registerMessage = validatedMessage as RegisterEvent;
    const { socketType, jwtToken } = registerMessage;

    // Set client properties
    client.socketType = socketType;

    // For authenticated clients, verify JWT token if provided
    if (jwtToken !== undefined && jwtToken.length > 0) {
      try {
        const config = getConfig();
        jwt.verify(jwtToken, config.jwtSecret);
        client.isAuthenticated = true;
      } catch (error) {
        client.isAuthenticated = false;
        this.logger.error('Invalid JWT token during registration', error, {
          clientId: client.clientId,
        });
      }
    } else {
      client.isAuthenticated = false;
    }

    context.log.debug('Client registered', {
      clientId: client.clientId,
      socketType: client.socketType,
      isAuthenticated: client.isAuthenticated,
    });

    // Send confirmation
    context.sendTo(client, { eventName: 'registered' });
  }
}
