/**
 * Live Chat Message Repository
 *
 * Provides data access methods for live chat message records using Drizzle ORM.
 */
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import type { DrizzleLiveChatMessage, DrizzleNewLiveChatMessage } from '../schema/index.js';
import { liveChatMessages } from '../schema/index.js';
import { BaseRepository } from './base.js';
import type { PaginationOptions } from '../../types/models.js';

/**
 * LiveChatMessageRepository class for live chat message CRUD operations
 */
export class LiveChatMessageRepository extends BaseRepository {
  /**
   * Finds a live chat message by its chat_message_id
   *
   * @param chatMessageId - The message primary key
   * @returns The message record or null if not found
   */
  async findById(chatMessageId: number): Promise<DrizzleLiveChatMessage | null> {
    const result = await this.db
      .select()
      .from(liveChatMessages)
      .where(eq(liveChatMessages.chatMessageId, chatMessageId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all chat messages for a video with pagination
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of chat messages for the video
   */
  async findByVideoId(
    videoId: string,
    options?: PaginationOptions
  ): Promise<DrizzleLiveChatMessage[]> {
    const { limit, offset } = this.getPaginationParamsWithDefault(options);

    return this.db
      .select()
      .from(liveChatMessages)
      .where(eq(liveChatMessages.videoId, videoId))
      .orderBy(desc(liveChatMessages.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Finds recent chat messages for a video (last N messages)
   *
   * @param videoId - The video identifier
   * @param count - Number of recent messages to retrieve
   * @returns Array of recent chat messages (ordered oldest to newest)
   */
  async findRecentByVideoId(
    videoId: string,
    count: number = 50
  ): Promise<DrizzleLiveChatMessage[]> {
    const messages = await this.db
      .select()
      .from(liveChatMessages)
      .where(eq(liveChatMessages.videoId, videoId))
      .orderBy(desc(liveChatMessages.timestamp))
      .limit(count);

    // Reverse to get oldest to newest order for display
    return messages.reverse();
  }

  /**
   * Finds chat messages after a specific timestamp
   *
   * @param videoId - The video identifier
   * @param afterTimestamp - Get messages after this timestamp
   * @param limit - Maximum number of messages to retrieve
   * @returns Array of chat messages after the timestamp
   */
  async findAfterTimestamp(
    videoId: string,
    afterTimestamp: number,
    limit: number = 100
  ): Promise<DrizzleLiveChatMessage[]> {
    return this.db
      .select()
      .from(liveChatMessages)
      .where(
        and(eq(liveChatMessages.videoId, videoId), gte(liveChatMessages.timestamp, afterTimestamp))
      )
      .orderBy(liveChatMessages.timestamp)
      .limit(limit);
  }

  /**
   * Counts total chat messages for a video
   *
   * @param videoId - The video identifier
   * @returns Total count of chat messages
   */
  async countByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(liveChatMessages)
      .where(eq(liveChatMessages.videoId, videoId));
    return result[0]?.count ?? 0;
  }

  /**
   * Finds all live chat messages with optional pagination
   *
   * @param options - Pagination options (optional limit/offset)
   * @returns Array of all live chat messages
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleLiveChatMessage[]> {
    const { limit, offset } = this.getPaginationParams(options);

    const query = this.db.select().from(liveChatMessages);

    if (limit !== undefined) {
      return query.limit(limit).offset(offset);
    }

    return query.offset(offset);
  }

  /**
   * Creates a new live chat message record
   *
   * @param data - Message data for insertion
   * @returns The created message record
   * @throws Error if insert fails to return a record
   */
  async create(data: DrizzleNewLiveChatMessage): Promise<DrizzleLiveChatMessage> {
    const result = await this.db.insert(liveChatMessages).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create live chat message record');
    }
    return result[0];
  }

  /**
   * Deletes a live chat message record
   *
   * @param chatMessageId - The message primary key
   * @returns true if deleted, false if not found
   */
  async delete(chatMessageId: number): Promise<boolean> {
    const result = await this.db
      .delete(liveChatMessages)
      .where(eq(liveChatMessages.chatMessageId, chatMessageId))
      .returning();
    return result.length > 0;
  }

  /**
   * Deletes all chat messages for a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted messages
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .delete(liveChatMessages)
      .where(eq(liveChatMessages.videoId, videoId))
      .returning();
    return result.length;
  }

  /**
   * Deletes old chat messages for a video (keep last N messages)
   *
   * @param videoId - The video identifier
   * @param keepCount - Number of recent messages to keep
   * @returns Number of deleted messages
   */
  async pruneOldMessages(videoId: string, keepCount: number): Promise<number> {
    // First, find the timestamp cutoff
    const recentMessages = await this.db
      .select({ timestamp: liveChatMessages.timestamp })
      .from(liveChatMessages)
      .where(eq(liveChatMessages.videoId, videoId))
      .orderBy(desc(liveChatMessages.timestamp))
      .limit(keepCount);

    if (recentMessages.length < keepCount) {
      // Not enough messages to prune
      return 0;
    }

    const lastMessage = recentMessages.at(-1);
    if (!lastMessage) {
      // Should not happen given the length check above, but satisfies TypeScript
      return 0;
    }
    const cutoffTimestamp = lastMessage.timestamp;

    // Delete messages older than the cutoff
    const result = await this.db
      .delete(liveChatMessages)
      .where(
        and(
          eq(liveChatMessages.videoId, videoId),
          sql`${liveChatMessages.timestamp} < ${cutoffTimestamp}`
        )
      )
      .returning();

    return result.length;
  }

  /**
   * Deletes all live chat message records
   *
   * @returns Number of deleted messages
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(liveChatMessages).returning();
    return result.length;
  }

  /**
   * Creates multiple live chat message records in bulk
   *
   * @param data - Array of message data for insertion
   * @returns Array of created message records
   */
  async createMany(data: DrizzleNewLiveChatMessage[]): Promise<DrizzleLiveChatMessage[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(liveChatMessages).values(data).returning();
  }
}
