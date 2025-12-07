/**
 * Register Handler
 *
 * Handles client registration messages to establish client type and authentication.
 */

import type { ExtendedWebSocket, IncomingWebSocketMessage } from '../../types/websocket.js';
import { WebSocketHandler, type HandlerContext } from './base.js';
import jwt from 'jsonwebtoken';
import { getConfig } from '../../config/index.js';

/**
 * Register message interface
 */
interface RegisterMessage extends IncomingWebSocketMessage {
  eventName: 'register';
  socketType: 'moartube_client' | 'admin' | 'viewer' | 'node_peer';
  jwtToken?: string;
}

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
    const registerMessage = message as RegisterMessage;

    // Validate required fields
    const socketType = registerMessage.socketType;
    if (typeof socketType !== 'string' || socketType.trim() === '') {
      context.log.warn('Register message missing socketType', { clientId: client.clientId });
      return;
    }

    // Set client properties
    client.socketType = socketType;

    // For authenticated clients, verify JWT token if provided
    const jwtToken = registerMessage.jwtToken;
    if (typeof jwtToken === 'string' && jwtToken.trim() !== '') {
      try {
        const config = getConfig();
        jwt.verify(jwtToken, config.jwtSecret);
        client.isAuthenticated = true;
      } catch (error) {
        client.isAuthenticated = false;
        context.log.warn('Invalid JWT token during registration', {
          clientId: client.clientId,
          error: (error as Error).message,
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
