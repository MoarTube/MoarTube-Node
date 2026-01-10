/**
 * Live Chat Message Repository
 *
 * Provides data access methods for live chat message records using Drizzle ORM.
 */
import { eq, and, gte, count, lt, asc } from 'drizzle-orm';
import { BaseRepository } from '@database/repositories/base.js';
import type { PaginationOptions } from '@/types/index.js';

/**
 * LiveChatMessageRepository class for live chat message CRUD operations
 */
export class LiveChatMessagesRepository extends BaseRepository {
  constructor(
    db: any,
    private readonly liveChatMessagesTable: any
  ) {
    super(db);
  }
  /**
   * Finds a live chat message by its chat_message_id
   *
   * @param chatMessageId - The message primary key
   * @returns The message record or null if not found
   */
  async findById(chatMessageId: number): Promise<any | null> {
    const result = await this.db
      .select()
      .from(this.liveChatMessagesTable)
      .where(eq(this.liveChatMessagesTable.chat_message_id, chatMessageId))
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
  async findByVideoId(videoId: string, options?: PaginationOptions): Promise<any[]> {
    const { limit } = this.getPaginationParamsWithDefault(options);

    return this.db
      .select()
      .from(this.liveChatMessagesTable)
      .where(eq(this.liveChatMessagesTable.video_id, videoId))
      .orderBy(asc(this.liveChatMessagesTable.timestamp))
      .limit(limit);
  }

  /**
   * Finds recent chat messages for a video (last N messages)
   *
   * @param videoId - The video identifier
   * @param count - Number of recent messages to retrieve
   * @returns Array of recent chat messages (ordered oldest to newest)
   */
  async findRecentByVideoId(videoId: string, count: number = 50): Promise<any[]> {
    const messages = await this.db
      .select()
      .from(this.liveChatMessagesTable)
      .where(eq(this.liveChatMessagesTable.video_id, videoId))
      .orderBy(asc(this.liveChatMessagesTable.timestamp))
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
  ): Promise<any[]> {
    return this.db
      .select()
      .from(this.liveChatMessagesTable)
      .where(
        and(
          eq(this.liveChatMessagesTable.video_id, videoId),
          gte(this.liveChatMessagesTable.timestamp, afterTimestamp)
        )
      )
      .orderBy(asc(this.liveChatMessagesTable.timestamp))
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
      .select({ count: count() })
      .from(this.liveChatMessagesTable)
      .where(eq(this.liveChatMessagesTable.video_id, videoId));
    return result[0]?.count ?? 0;
  }

  /**
   * Finds all live chat messages with optional pagination
   *
   * @param options - Pagination options (optional limit/offset)
   * @returns Array of all live chat messages
   */
  async findAll(options?: PaginationOptions): Promise<any[]> {
    const { limit } = this.getPaginationParams(options);

    const query = this.db.select().from(this.liveChatMessagesTable);

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  /**
   * Creates a new live chat message record
   *
   * @param data - Message data for insertion
   * @returns The created message record
   * @throws Error if insert fails to return a record
   */
  async create(data: any): Promise<any> {
    const result = await this.db.insert(this.liveChatMessagesTable).values(data).returning();
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
      .delete(this.liveChatMessagesTable)
      .where(eq(this.liveChatMessagesTable.chat_message_id, chatMessageId))
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
      .delete(this.liveChatMessagesTable)
      .where(eq(this.liveChatMessagesTable.video_id, videoId))
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
      .select({ timestamp: this.liveChatMessagesTable.timestamp })
      .from(this.liveChatMessagesTable)
      .where(eq(this.liveChatMessagesTable.video_id, videoId))
      .orderBy(asc(this.liveChatMessagesTable.timestamp))
      .limit(keepCount);

    if (recentMessages.length < keepCount) {
      // Not enough messages to prune
      return 0;
    }

    const oldestKeptMessage = recentMessages.at(0);

    const cutoffTimestamp = oldestKeptMessage.timestamp;

    // Delete messages older than the cutoff
    const result = await this.db
      .delete(this.liveChatMessagesTable)
      .where(
        and(
          eq(this.liveChatMessagesTable.video_id, videoId),
          lt(this.liveChatMessagesTable.timestamp, cutoffTimestamp)
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
    const result = await this.db.delete(this.liveChatMessagesTable).returning();
    return result.length;
  }

  /**
   * Creates multiple live chat message records in bulk
   *
   * @param data - Array of message data for insertion
   * @returns Array of created message records
   */
  async createMany(data: any[]): Promise<any[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(this.liveChatMessagesTable).values(data).returning();
  }
}
