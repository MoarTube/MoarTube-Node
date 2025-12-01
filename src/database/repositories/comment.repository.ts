/**
 * Comment Repository
 *
 * Provides data access methods for comment records using Drizzle ORM.
 */
import { eq, desc, sql, and } from 'drizzle-orm';
import type { DrizzleComment, DrizzleNewComment } from '../schema';
import { comments } from '../schema';
import { BaseRepository } from './base.repository';
import type { PaginationOptions } from '../../types/models';

/**
 * CommentRepository class for comment CRUD operations
 */
export class CommentRepository extends BaseRepository {
  /**
   * Finds a comment by its database id
   *
   * @param id - The database primary key
   * @returns The comment record or null if not found
   */
  async findById(id: number): Promise<DrizzleComment | null> {
    const result = await this.db.select().from(comments).where(eq(comments.id, id)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all comments for a video with pagination
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of comments for the video
   */
  async findByVideoId(videoId: string, options?: PaginationOptions): Promise<DrizzleComment[]> {
    const { limit, offset } = this.getPaginationParams(options);

    return this.db
      .select()
      .from(comments)
      .where(eq(comments.videoId, videoId))
      .orderBy(desc(comments.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Counts total comments for a video
   *
   * @param videoId - The video identifier
   * @returns Total count of comments
   */
  async countByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.videoId, videoId));
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new comment record
   *
   * @param data - Comment data for insertion
   * @returns The created comment record
   * @throws Error if insert fails to return a record
   */
  async create(data: DrizzleNewComment): Promise<DrizzleComment> {
    const result = await this.db.insert(comments).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create comment record');
    }
    return result[0];
  }

  /**
   * Updates a comment record
   *
   * @param id - The database primary key
   * @param data - Partial comment data to update
   * @returns The updated comment record or null if not found
   */
  async update(id: number, data: Partial<DrizzleNewComment>): Promise<DrizzleComment | null> {
    const result = await this.db.update(comments).set(data).where(eq(comments.id, id)).returning();
    return result[0] ?? null;
  }

  /**
   * Deletes a comment record
   *
   * @param id - The database primary key
   * @returns true if deleted, false if not found
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.db.delete(comments).where(eq(comments.id, id)).returning();
    return result.length > 0;
  }

  /**
   * Deletes all comments for a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted comments
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db.delete(comments).where(eq(comments.videoId, videoId)).returning();
    return result.length;
  }

  /**
   * Finds a comment by video ID and timestamp
   *
   * @param videoId - The video identifier
   * @param timestamp - The comment timestamp
   * @returns The comment record or null if not found
   */
  async findByVideoIdAndTimestamp(
    videoId: string,
    timestamp: number
  ): Promise<DrizzleComment | null> {
    const result = await this.db
      .select()
      .from(comments)
      .where(and(eq(comments.videoId, videoId), eq(comments.timestamp, timestamp)))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Counts total comments across all videos
   *
   * @returns Total count of all comments
   */
  async countAll(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(comments);
    return result[0]?.count ?? 0;
  }
}
