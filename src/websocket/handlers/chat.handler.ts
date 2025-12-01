/**
 * Chat Message Handler
 *
 * Handles live chat messages for video streams.
 */

import type {
  ExtendedWebSocket,
  IncomingWebSocketMessage,
  ChatMessage,
} from '../../types/websocket';
import { WebSocketHandler, type HandlerContext } from './base.handler';

/**
 * Incoming chat message structure
 */
interface IncomingChatMessage extends IncomingWebSocketMessage {
  eventName: 'chat_message';
  videoId: string;
  username: string;
  usernameColorHexCode: string;
  chatMessage: string;
}

/**
 * Handler for live chat messages
 */
export class ChatMessageHandler extends WebSocketHandler {
  readonly name = 'ChatMessageHandler';

  /**
   * Maximum chat message length
   */
  private readonly maxMessageLength = 500;

  /**
   * Check if this is a chat message
   */
  canHandle(message: IncomingWebSocketMessage): boolean {
    return message.eventName === 'chat_message';
  }

  /**
   * Handle incoming chat message
   */
  handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): void {
    const chatMessage = message as IncomingChatMessage;

    // Validate required fields
    if (!chatMessage.videoId || !chatMessage.username || !chatMessage.chatMessage) {
      context.log.warn('Invalid chat message received', { clientId: client.clientId });
      return;
    }

    // Validate message length
    if (chatMessage.chatMessage.length > this.maxMessageLength) {
      context.log.warn('Chat message too long', {
        clientId: client.clientId,
        length: chatMessage.chatMessage.length,
      });
      return;
    }

    // Build outgoing message
    const outgoingMessage: ChatMessage = {
      eventName: 'chat_message',
      videoId: chatMessage.videoId,
      username: this.sanitizeString(chatMessage.username),
      usernameColorHexCode: this.validateColorHex(chatMessage.usernameColorHexCode),
      chatMessage: this.sanitizeString(chatMessage.chatMessage),
      timestamp: Date.now(),
    };

    context.log.debug('Broadcasting chat message', {
      videoId: outgoingMessage.videoId,
      username: outgoingMessage.username,
    });

    // Broadcast to all clients watching this video
    context.broadcast(outgoingMessage, chatMessage.videoId);
  }

  /**
   * Sanitize string to prevent XSS
   */
  private sanitizeString(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Validate and normalize color hex code
   */
  private validateColorHex(hex: string): string {
    const cleanHex = hex.replace(/^#/, '');
    if (/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
      return `#${cleanHex}`;
    }
    // Default to white if invalid
    return '#FFFFFF';
  }
}
