/**
 * Live Chat Messages Repository Interface
 *
 * Defines the contract for live chat message data access operations.
 */
import type { PaginationOptions } from '@/types/index.js';

export interface ILiveChatMessagesRepository<MessageType, NewMessageType> {
  /**
   * Finds a live chat message by its chat_message_id
   *
   * @param chatMessageId - The message primary key
   * @returns The message record or null if not found
   */
  findById(chatMessageId: number): Promise<MessageType | null>;

  /**
   * Finds all chat messages for a video with pagination
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of chat messages for the video
   */
  findByVideoId(videoId: string, options?: PaginationOptions): Promise<MessageType[]>;

  /**
   * Finds recent chat messages for a video (last N messages)
   *
   * @param videoId - The video identifier
   * @param count - Number of recent messages to retrieve
   * @returns Array of recent chat messages (ordered oldest to newest)
   */
  findRecentByVideoId(videoId: string, count?: number): Promise<MessageType[]>;

  /**
   * Finds chat messages after a specific timestamp
   *
   * @param videoId - The video identifier
   * @param afterTimestamp - Get messages after this timestamp
   * @param limit - Maximum number of messages to retrieve
   * @returns Array of chat messages after the timestamp
   */
  findAfterTimestamp(
    videoId: string,
    afterTimestamp: number,
    limit?: number
  ): Promise<MessageType[]>;

  /**
   * Counts total chat messages for a video
   *
   * @param videoId - The video identifier
   * @returns Total count of chat messages
   */
  countByVideoId(videoId: string): Promise<number>;

  /**
   * Finds all live chat messages with optional pagination
   *
   * @param options - Pagination options (optional limit/offset)
   * @returns Array of all live chat messages
   */
  findAll(options?: PaginationOptions): Promise<MessageType[]>;

  /**
   * Creates a new live chat message record
   *
   * @param data - Message data for insertion
   * @returns The created message record
   */
  create(data: NewMessageType): Promise<MessageType>;

  /**
   * Deletes a live chat message record
   *
   * @param chatMessageId - The message primary key
   * @returns true if deleted, false if not found
   */
  delete(chatMessageId: number): Promise<boolean>;

  /**
   * Deletes all chat messages for a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted messages
   */
  deleteByVideoId(videoId: string): Promise<number>;

  /**
   * Deletes old chat messages for a video (keep last N messages)
   *
   * @param videoId - The video identifier
   * @param keepCount - Number of recent messages to keep
   * @returns Number of deleted messages
   */
  pruneOldMessages(videoId: string, keepCount: number): Promise<number>;

  /**
   * Deletes all live chat message records
   *
   * @returns Number of deleted messages
   */
  deleteAll(): Promise<number>;

  /**
   * Creates multiple live chat message records in bulk
   *
   * @param data - Array of message data for insertion
   * @returns Array of created message records
   */
  createMany(data: NewMessageType[]): Promise<MessageType[]>;
}
