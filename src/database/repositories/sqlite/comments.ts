/**
 * Comments Repository
 *
 * Provides data access methods for comment records using Drizzle ORM.
 */
import { eq, desc, and, gt, lt, like, count } from 'drizzle-orm';
import type { DrizzleComment, DrizzleNewComment } from '../../schemas/sqlite/index.js';
import { comments } from '../../schemas/sqlite/index.js';
import { BaseRepository } from './base.js';

/**
 * CommentsRepository class for comment CRUD operations
 */
export class CommentsRepository extends BaseRepository {
  /**
   * Finds a comment by its database id
   *
   * @param id - The database primary key
   * @returns The comment record or null if not found
   */
  async findById(
    videoId: string,
    commentId: number,
    timestamp: number
  ): Promise<DrizzleComment | null> {
    const result = await this.db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.comment_id, commentId),
          eq(comments.video_id, videoId),
          eq(comments.timestamp, timestamp)
        )
      )
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all comments for a video with pagination
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of comments for the video
   */
  async findByVideoId(videoId: string): Promise<DrizzleComment[]> {
    return this.db
      .select()
      .from(comments)
      .where(eq(comments.video_id, videoId))
      .orderBy(desc(comments.timestamp));
  }

  /**
   * Finds comments for a video with timestamp-based filtering and sorting
   *
   * @param videoId - The video identifier
   * @param type - Direction filter: "before" or "after" the timestamp (non-inclusive)
   * @param timestamp - The timestamp to filter against
   * @param sort - Sort direction: "ascending" or "descending"
   * @returns Array of filtered and sorted comments
   */
  async findByVideoIdWithTimestampFilter(
    videoId: string,
    type: 'before' | 'after',
    sort: 'ascending' | 'descending',
    timestamp: number
  ): Promise<DrizzleComment[]> {
    const timestampCondition =
      type === 'before' ? lt(comments.timestamp, timestamp) : gt(comments.timestamp, timestamp);
    const orderBy = sort === 'ascending' ? comments.timestamp : desc(comments.timestamp);

    return this.db
      .select()
      .from(comments)
      .where(and(eq(comments.video_id, videoId), timestampCondition))
      .orderBy(orderBy);
  }

  /**
   * Counts total comments for a video
   *
   * @param videoId - The video identifier
   * @returns Total count of comments
   */
  async countByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(comments)
      .where(eq(comments.video_id, videoId));
    return result[0]?.count ?? 0;
  }

  /**
   * Finds all comments with optional pagination
   *
   * @param options - Pagination options (optional limit)
   * @returns Array of all comments
   */
  async findAll(): Promise<DrizzleComment[]> {
    const query = this.db.select().from(comments);

    return query;
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
    const result = await this.db
      .update(comments)
      .set(data)
      .where(eq(comments.comment_id, id))
      .returning();
    return result[0] ?? null;
  }

  /**
   * Deletes a comment record
   *
   * @param id - The database primary key
   * @returns true if deleted, false if not found
   */
  async delete(videoId: string, commentId: number, timestamp: number): Promise<boolean> {
    const result = await this.db
      .delete(comments)
      .where(
        and(
          eq(comments.comment_id, commentId),
          eq(comments.video_id, videoId),
          eq(comments.timestamp, timestamp)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Deletes all comments for a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted comments
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db.delete(comments).where(eq(comments.video_id, videoId)).returning();
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
      .where(and(eq(comments.video_id, videoId), eq(comments.timestamp, timestamp)))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Counts total comments across all videos
   *
   * @returns Total count of all comments
   */
  async countAll(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(comments);
    return result[0]?.count ?? 0;
  }

  /**
   * Counts comments newer than a given timestamp
   *
   * @param timestamp - The timestamp to compare against
   * @returns Count of comments newer than the timestamp
   */
  async countNewerThan(timestamp: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(comments)
      .where(gt(comments.timestamp, timestamp));
    return result[0]?.count ?? 0;
  }

  /**
   * Searches comments with optional filters
   *
   * @param options - Search options including videoId, searchTerm, beforeTimestamp
   * @returns Array of matching comments
   */
  async search(
    limit: number,
    sortDirection: string,
    timestamp: number,
    videoId?: string,
    searchTerm?: string
  ): Promise<DrizzleComment[]> {
    // Build conditions array
    const conditions = [];

    if (videoId !== undefined) {
      conditions.push(eq(comments.video_id, videoId));
    }

    if (searchTerm !== undefined) {
      conditions.push(like(comments.comment_plain_text_sanitized, `%${searchTerm}%`));
    }

    conditions.push(lt(comments.timestamp, timestamp));

    // Build query
    let query = this.db.select().from(comments);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // Sort
    if (sortDirection === 'ascending') {
      query = query.orderBy(comments.timestamp) as typeof query;
    } else {
      query = query.orderBy(desc(comments.timestamp)) as typeof query;
    }

    return query.limit(limit);
  }

  /**
   * Deletes all comment records
   *
   * @returns Number of deleted comments
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(comments).returning();
    return result.length;
  }

  /**
   * Creates multiple comment records in bulk
   *
   * @param data - Array of comment data for insertion
   * @returns Array of created comment records
   */
  async createMany(data: DrizzleNewComment[]): Promise<DrizzleComment[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(comments).values(data).returning();
  }
}
