/**
 * Chat Join Handler
 *
 * Handles chat join events for live streaming.
 */

import type { ExtendedWebSocket, IncomingWebSocketMessage } from '../../types/websocket.js';
import { WebSocketHandler, type HandlerContext } from './base.js';
import type { IVideoService } from '../../services/interfaces.js';
import { chatJoinEventSchema, type ChatJoinEvent } from '../../validators/schemas/index.js';

/**
 * Handler for chat join events
 */
export class ChatJoinHandler extends WebSocketHandler {
  readonly name = 'ChatJoinHandler';
  private readonly videoService: IVideoService;

  constructor(videoService: IVideoService) {
    super();
    this.videoService = videoService;
  }

  /**
   * Check if this is a chat event
   */
  canHandle(message: IncomingWebSocketMessage): boolean {
    return message.eventName === 'chat' && message.type === 'join';
  }

  /**
   * Handle incoming chat event
   */
  async handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): Promise<void> {
    try {
      const chatEvent = chatJoinEventSchema.parse(message);
      await this.processMessage(client, chatEvent, context);
    } catch (error) {
      context.log.warn('Invalid chat join event format', { clientId: client.clientId, error });
      context.sendTo(client, {
        eventName: 'error',
        errorType: 'join',
        message: 'invalid join format',
      });
      client.close();
    }
  }

  /**
   * Process validated chat join message
   */
  protected async processMessage(
    client: ExtendedWebSocket,
    validatedMessage: unknown,
    context: HandlerContext
  ): Promise<void> {
    const chatEvent = validatedMessage as ChatJoinEvent;
    const { videoId } = chatEvent;

    // Check if video exists
    const video = await this.videoService.getVideo(videoId);
    if (video === null) {
      context.sendTo(client, {
        eventName: 'error',
        errorType: 'join',
        message: 'this video no longer exists',
      });
      client.close();
      return;
    }

    // Generate username and color
    const liveChatUsername = this.generateUsername();
    const liveChatUsernameColorCode = this.generateColor();

    // Set client properties
    client.videoId = videoId;
    client.liveChatUsername = liveChatUsername;
    client.liveChatUsernameColorCode = liveChatUsernameColorCode;

    // Initialize rate limiter
    client.rateLimiter = {
      timestamps: [],
      rateLimitTimestamp: 0,
      rateLimitLevel: -1,
      isRateLimited: false,
    };

    context.log.debug('Client joined chat', {
      clientId: client.clientId,
      videoId,
      username: liveChatUsername,
    });

    // Send joined response
    context.sendTo(client, {
      eventName: 'joined',
      liveChatUsername,
      liveChatUsernameColorCode,
    });
  }

  /**
   * Generate random username
   */
  private generateUsername(): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate random color hex code
   */
  private generateColor(): string {
    return ('000000' + Math.floor(Math.random() * 16777215).toString(16)).slice(-6);
  }
}
