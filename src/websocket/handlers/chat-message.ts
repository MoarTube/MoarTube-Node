/**
 * Chat Message Handler
 *
 * Handles live chat messages for video streams.
 */

import type { ExtendedWebSocket, IncomingWebSocketMessage } from '../../types/websocket.js';
import { WebSocketHandler, type HandlerContext } from './base.js';
import type {
  IVideoService,
  ILiveChatService,
  ICloudflareService,
} from '../../services/interfaces.js';
import { getConfig } from '../../config/index.js';
import sanitizeHtml from 'sanitize-html';
import { chatMessageEventSchema, type ChatMessageEvent } from '../../validators/schemas/index.js';
import { ZodError } from 'zod';

/**
 * Handler for live chat messages
 */
export class ChatMessageHandler extends WebSocketHandler {
  readonly name = 'ChatMessageHandler';
  private readonly videoService: IVideoService;
  private readonly liveChatService: ILiveChatService;
  private readonly cloudflareService: ICloudflareService;

  constructor(
    videoService: IVideoService,
    liveChatService: ILiveChatService,
    cloudflareService: ICloudflareService
  ) {
    super();
    this.videoService = videoService;
    this.liveChatService = liveChatService;
    this.cloudflareService = cloudflareService;
  }

  /**
   * Check if this is a chat message event
   */
  canHandle(message: IncomingWebSocketMessage): boolean {
    return message.eventName === 'chat' && message.type === 'message';
  }

  /**
   * Handle incoming chat message
   */
  async handle(
    client: ExtendedWebSocket,
    message: IncomingWebSocketMessage,
    context: HandlerContext
  ): Promise<void> {
    try {
      const chatEvent = chatMessageEventSchema.parse(message);
      await this.processMessage(client, chatEvent, context);
    } catch (error) {
      if (error instanceof ZodError) {
        context.log.warn('Invalid chat message format', {
          errors: error.issues,
          clientId: client.clientId,
        });
        context.sendTo(client, {
          eventName: 'error',
          errorType: 'message',
          message: 'invalid message format',
        });
      } else {
        context.log.error('Error parsing chat message', error, { clientId: client.clientId });
        context.sendTo(client, {
          eventName: 'error',
          errorType: 'message',
          message: 'an error occurred while processing your message',
        });
      }
      client.close();
    }
  }

  /**
   * Process validated chat message
   */
  protected async processMessage(
    client: ExtendedWebSocket,
    validatedMessage: unknown,
    context: HandlerContext
  ): Promise<void> {
    const chatEvent = validatedMessage as ChatMessageEvent;
    const { videoId, chatMessageContent, cloudflareTurnstileToken, sentTimestamp } = chatEvent;
    const timestamp = Date.now();

    // Validate videoId matches client's videoId
    if (client.videoId === undefined || client.videoId !== videoId) {
      context.sendTo(client, {
        eventName: 'error',
        errorType: 'message',
        message: 'invalid message parameters',
      });
      client.close();
      return;
    }

    // Sanitize message (Zod already validated length and basic content)
    const sanitizedMessage = sanitizeHtml(chatMessageContent, {
      allowedTags: [],
      allowedAttributes: {},
    });

    // Double-check sanitization didn't make message empty
    if (sanitizedMessage.length === 0) {
      context.sendTo(client, {
        eventName: 'error',
        errorType: 'message',
        message: 'invalid message parameters',
      });
      client.close();
      return;
    }

    try {
      const config = getConfig().nodeSettings;

      // Check live chat enabled globally
      if (!config.isLiveChatEnabled) {
        context.sendTo(client, {
          eventName: 'error',
          errorType: 'message',
          message: 'live chat is currently disabled',
          sentTimestamp,
          liveChatUsername: client.liveChatUsername,
          liveChatUsernameColorCode: client.liveChatUsernameColorCode,
        });
        return;
      }

      // Check Turnstile if enabled
      if (config.isCloudflareTurnstileEnabled) {
        if (cloudflareTurnstileToken.length === 0) {
          context.sendTo(client, {
            eventName: 'error',
            errorType: 'message',
            message:
              'human verification was enabled on this MoarTube Node, please refresh your browser',
            sentTimestamp,
            liveChatUsername: client.liveChatUsername,
            liveChatUsernameColorCode: client.liveChatUsernameColorCode,
          });
          return;
        }
        await this.cloudflareService.validateTurnstileToken(
          cloudflareTurnstileToken,
          client.ip ?? ''
        );
      } else {
        // Check video-specific chat settings
        const video = await this.videoService.getVideo(videoId);
        if (video?.is_live_chat_enabled !== true) {
          context.sendTo(client, {
            eventName: 'error',
            errorType: 'message',
            message: 'live chat is currently disabled',
            sentTimestamp,
            liveChatUsername: client.liveChatUsername,
            liveChatUsernameColorCode: client.liveChatUsernameColorCode,
          });
          return;
        }
      }

      // Rate limiting
      const rateLimiter = client.rateLimiter;
      if (!rateLimiter) {
        context.sendTo(client, {
          eventName: 'error',
          errorType: 'message',
          message: 'client not properly initialized',
        });
        client.close();
        return;
      }

      const BASE_RATE_LIMIT_PENALTY_MILLISECONDS = 5000;
      const BASE_RATE_LIMIT_PENALTY_SECONDS = BASE_RATE_LIMIT_PENALTY_MILLISECONDS / 1000;
      const RATE_LIMIT_EAGERNESS_PENALTY_MILLISECONDS = 3000;

      if (rateLimiter.isRateLimited) {
        const rateLimitThreshold =
          BASE_RATE_LIMIT_PENALTY_MILLISECONDS +
          rateLimiter.rateLimitLevel * BASE_RATE_LIMIT_PENALTY_MILLISECONDS;
        if (timestamp - rateLimiter.rateLimitTimestamp > rateLimitThreshold) {
          if (
            timestamp - rateLimiter.rateLimitTimestamp <
            rateLimitThreshold + RATE_LIMIT_EAGERNESS_PENALTY_MILLISECONDS
          ) {
            rateLimiter.rateLimitTimestamp = timestamp;
            rateLimiter.rateLimitLevel++;
            context.sendTo(client, {
              eventName: 'limited',
              rateLimitSeconds:
                BASE_RATE_LIMIT_PENALTY_SECONDS +
                rateLimiter.rateLimitLevel * BASE_RATE_LIMIT_PENALTY_SECONDS,
            });
          } else {
            rateLimiter.isRateLimited = false;
            rateLimiter.rateLimitLevel = -1;
          }
        } else {
          return;
        }
      }

      if (rateLimiter.timestamps.length < 3) {
        rateLimiter.timestamps.push(timestamp);
      } else if (rateLimiter.timestamps.length === 3) {
        rateLimiter.timestamps.shift();
        rateLimiter.timestamps.push(timestamp);
      }

      if (rateLimiter.timestamps.length === 3) {
        const firstTimestamp = rateLimiter.timestamps[0];
        const lastTimestamp = rateLimiter.timestamps[2];
        if (firstTimestamp !== undefined && lastTimestamp !== undefined) {
          const timeElapsed = lastTimestamp - firstTimestamp;

          if (timeElapsed < BASE_RATE_LIMIT_PENALTY_MILLISECONDS) {
            rateLimiter.rateLimitTimestamp = timestamp;
            rateLimiter.isRateLimited = true;
            rateLimiter.rateLimitLevel++;
            context.sendTo(client, {
              eventName: 'limited',
              rateLimitSeconds: BASE_RATE_LIMIT_PENALTY_SECONDS,
            });
          }
        }
      }

      // Update rate limiter
      client.rateLimiter = rateLimiter;

      // Broadcast message
      context.broadcast(
        {
          eventName: 'message',
          videoId,
          chatMessageContent: sanitizedMessage,
          sentTimestamp,
          liveChatUsername: client.liveChatUsername,
          liveChatUsernameColorCode: client.liveChatUsernameColorCode,
        },
        videoId
      );

      // Save to history if enabled
      const video = await this.videoService.getVideo(videoId);
      if (video) {
        try {
          const meta = JSON.parse(video.meta) as {
            chatSettings?: { isChatHistoryEnabled?: boolean; chatHistoryLimit?: number };
          };
          const isChatHistoryEnabled = meta.chatSettings?.isChatHistoryEnabled ?? false;

          if (isChatHistoryEnabled) {
            const chatHistoryLimit = meta.chatSettings?.chatHistoryLimit ?? 0;

            // Create the chat message
            await this.liveChatService.createMessage({
              videoId,
              username: client.liveChatUsername ?? '',
              usernameColorHexCode: client.liveChatUsernameColorCode ?? '',
              chatMessage: sanitizedMessage,
            });

            if (chatHistoryLimit !== 0) {
              // Prune old messages to keep only the most recent N
              await this.liveChatService.pruneOldMessages(videoId, chatHistoryLimit);
            }
          }
        } catch (parseError) {
          context.log.warn('Failed to parse video meta for chat history', {
            videoId,
            error: parseError,
          });
        }
      }
    } catch (error) {
      context.log.error('Error handling chat message', error, { clientId: client.clientId });
      context.sendTo(client, {
        eventName: 'error',
        errorType: 'message',
        message: 'an error occurred while processing your message',
        sentTimestamp,
        liveChatUsername: client.liveChatUsername,
        liveChatUsernameColorCode: client.liveChatUsernameColorCode,
      });
    }
  }
}
