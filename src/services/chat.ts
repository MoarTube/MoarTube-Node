/**
 * Live Chat Service
 *
 * Service layer for live chat message operations including CRUD operations,
 * history management, and pruning functionality.
 */
import { BaseService } from './base.js';
import type { Logger } from '../utils/logger.js';
import type { ILiveChatService, CreateChatMessageInput } from './interfaces.js';
import type { LiveChatMessagesRepository } from '../database/repositories/live-chat-messages.js';
import type { DrizzleLiveChatMessage } from '../database/schemas/index.js';

/**
 * LiveChatService class
 *
 * Handles all live chat message-related business logic including:
 * - Message CRUD operations
 * - History retrieval and management
 * - Message pruning based on limits
 */
export class LiveChatService extends BaseService implements ILiveChatService {
  private readonly liveChatMessageRepository: LiveChatMessagesRepository;

  constructor(logger: Logger, liveChatMessagesRepository: LiveChatMessagesRepository) {
    super('LiveChatService', logger);
    this.liveChatMessageRepository = liveChatMessagesRepository;
  }

  /**
   * Get recent chat messages for a video
   */
  async getRecentMessages(videoId: string, count?: number): Promise<DrizzleLiveChatMessage[]> {
    return this.withErrorLogging('getRecentMessages', async () => {
      return this.liveChatMessageRepository.findRecentByVideoId(videoId, count);
    });
  }

  /**
   * Get messages after a timestamp
   */
  async getMessagesAfter(
    videoId: string,
    afterTimestamp: number,
    limit?: number
  ): Promise<DrizzleLiveChatMessage[]> {
    return this.withErrorLogging('getMessagesAfter', async () => {
      return this.liveChatMessageRepository.findAfterTimestamp(videoId, afterTimestamp, limit);
    });
  }

  /**
   * Create a new chat message
   */
  async createMessage(data: CreateChatMessageInput): Promise<DrizzleLiveChatMessage> {
    return this.withErrorLogging('createMessage', async () => {
      return this.liveChatMessageRepository.create({
        video_id: data.videoId,
        username: data.username,
        username_color_hex_code: data.usernameColorHexCode,
        chat_message: data.chatMessage,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Delete a chat message
   */
  async deleteMessage(messageId: number): Promise<boolean> {
    return this.withErrorLogging('deleteMessage', async () => {
      return this.liveChatMessageRepository.delete(messageId);
    });
  }

  /**
   * Delete all messages for a video
   */
  async deleteMessagesForVideo(videoId: string): Promise<number> {
    return this.withErrorLogging('deleteMessagesForVideo', async () => {
      return this.liveChatMessageRepository.deleteByVideoId(videoId);
    });
  }

  /**
   * Prune old messages (keep last N)
   */
  async pruneOldMessages(videoId: string, keepCount: number): Promise<number> {
    return this.withErrorLogging('pruneOldMessages', async () => {
      return this.liveChatMessageRepository.pruneOldMessages(videoId, keepCount);
    });
  }

  /**
   * Count messages for a video
   */
  async countMessagesForVideo(videoId: string): Promise<number> {
    return this.withErrorLogging('countMessagesForVideo', async () => {
      return this.liveChatMessageRepository.countByVideoId(videoId);
    });
  }
}
