/**
 * Live Chat Messages Repository - PostgreSQL Implementation
 *
 * Provides data access methods for live chat message records using Drizzle ORM with PostgreSQL.
 */
import { eq, and, gte, count, lt, asc } from 'drizzle-orm';
import type { PaginationOptions } from '@/types/index.js';
import type { ILiveChatMessagesRepository } from './interface.js';
import type { DrizzleLiveChatMessage, DrizzleNewLiveChatMessage } from '@/database/schemas/postgres/live-chat-messages.js';
import type { DatabaseClient } from '@database/postgres-connection.js';
import { liveChatMessages } from '@/database/schemas/postgres/live-chat-messages.js';

/**
 * LiveChatMessagesRepositoryPostgres class for live chat message CRUD operations
 */
export class LiveChatMessagesRepositoryPostgres implements ILiveChatMessagesRepository<DrizzleLiveChatMessage, DrizzleNewLiveChatMessage> {
  private readonly db: DatabaseClient;
  
  constructor(db: DatabaseClient) {
    this.db = db;
  }

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
      .where(eq(liveChatMessages.chat_message_id, chatMessageId))
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
  async findByVideoId(videoId: string, options?: PaginationOptions): Promise<DrizzleLiveChatMessage[]> {
    const { limit } = { limit: options?.limit ?? 20 };

    return this.db
      .select()
      .from(liveChatMessages)
      .where(eq(liveChatMessages.video_id, videoId))
      .orderBy(asc(liveChatMessages.timestamp))
      .limit(limit);
  }

  /**
   * Finds recent chat messages for a video (last N messages)
   *
   * @param videoId - The video identifier
   * @param count - Number of recent messages to retrieve
   * @returns Array of recent chat messages (ordered oldest to newest)
   */
  async findRecentByVideoId(videoId: string, count: number = 50): Promise<DrizzleLiveChatMessage[]> {
    const messages = await this.db
      .select()
      .from(liveChatMessages)
      .where(eq(liveChatMessages.video_id, videoId))
      .orderBy(asc(liveChatMessages.timestamp))
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
        and(
          eq(liveChatMessages.video_id, videoId),
          gte(liveChatMessages.timestamp, afterTimestamp)
        )
      )
      .orderBy(asc(liveChatMessages.timestamp))
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
      .from(liveChatMessages)
      .where(eq(liveChatMessages.video_id, videoId));
    return result[0]?.count ?? 0;
  }

  /**
   * Finds all live chat messages with optional pagination
   *
   * @param options - Pagination options (optional limit/offset)
   * @returns Array of all live chat messages
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleLiveChatMessage[]> {
    const { limit } = { limit: options?.limit };

    const query = this.db.select().from(liveChatMessages);

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
      .where(eq(liveChatMessages.chat_message_id, chatMessageId))
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
      .where(eq(liveChatMessages.video_id, videoId))
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
      .where(eq(liveChatMessages.video_id, videoId))
      .orderBy(asc(liveChatMessages.timestamp))
      .limit(keepCount);

    if (recentMessages.length < keepCount) {
      // Not enough messages to prune
      return 0;
    }

    const oldestKeptMessage = recentMessages.at(0);

    if(oldestKeptMessage === undefined) {
        return 0;
    }
    else {
        const cutoffTimestamp = oldestKeptMessage.timestamp;

        // Delete messages older than the cutoff
        const result = await this.db
        .delete(liveChatMessages)
        .where(
            and(
            eq(liveChatMessages.video_id, videoId),
            lt(liveChatMessages.timestamp, cutoffTimestamp)
            )
        )
        .returning();

        return result.length;
    }
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