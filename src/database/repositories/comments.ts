/**
 * this.commentsTable Repository
 *
 * Provides data access methods for comment records using Drizzle ORM.
 */
import { eq, desc, and, gt, lt, like, count } from 'drizzle-orm';
import { BaseRepository } from '@database/repositories/base.js';

/**
 * CommentsRepository class for comment CRUD operations
 */
export class CommentsRepository extends BaseRepository {
  constructor(
    db: any,
    private readonly commentsTable: any
  ) {
    super(db);
  }
  /**
   * Finds a comment by its database id
   *
   * @param id - The database primary key
   * @returns The comment record or null if not found
   */
  async findById(videoId: string, commentId: number, timestamp: number): Promise<any | null> {
    const result = await this.db
      .select()
      .from(this.commentsTable)
      .where(
        and(
          eq(this.commentsTable.comment_id, commentId),
          eq(this.commentsTable.video_id, videoId),
          eq(this.commentsTable.timestamp, timestamp)
        )
      )
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all this.commentsTable for a video with pagination
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of this.commentsTable for the video
   */
  async findByVideoId(videoId: string): Promise<any[]> {
    return this.db
      .select()
      .from(this.commentsTable)
      .where(eq(this.commentsTable.video_id, videoId))
      .orderBy(desc(this.commentsTable.timestamp));
  }

  /**
   * Finds this.commentsTable for a video with timestamp-based filtering and sorting
   *
   * @param videoId - The video identifier
   * @param type - Direction filter: "before" or "after" the timestamp (non-inclusive)
   * @param timestamp - The timestamp to filter against
   * @param sort - Sort direction: "ascending" or "descending"
   * @returns Array of filtered and sorted this.commentsTable
   */
  async findByVideoIdWithTimestampFilter(
    videoId: string,
    type: 'before' | 'after',
    sort: 'ascending' | 'descending',
    timestamp: number
  ): Promise<any[]> {
    const timestampCondition =
      type === 'before'
        ? lt(this.commentsTable.timestamp, timestamp)
        : gt(this.commentsTable.timestamp, timestamp);
    const orderBy =
      sort === 'ascending' ? this.commentsTable.timestamp : desc(this.commentsTable.timestamp);

    return this.db
      .select()
      .from(this.commentsTable)
      .where(and(eq(this.commentsTable.video_id, videoId), timestampCondition))
      .orderBy(orderBy);
  }

  /**
   * Counts total this.commentsTable for a video
   *
   * @param videoId - The video identifier
   * @returns Total count of this.commentsTable
   */
  async countByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(this.commentsTable)
      .where(eq(this.commentsTable.video_id, videoId));
    return result[0]?.count ?? 0;
  }

  /**
   * Finds all this.commentsTable with optional pagination
   *
   * @param options - Pagination options (optional limit)
   * @returns Array of all this.commentsTable
   */
  async findAll(): Promise<any[]> {
    const query = this.db.select().from(this.commentsTable);

    return query;
  }

  /**
   * Creates a new comment record
   *
   * @param data - Comment data for insertion
   * @returns The created comment record
   * @throws Error if insert fails to return a record
   */
  async create(data: any): Promise<any> {
    const result = await this.db.insert(this.commentsTable).values(data).returning();
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
  async update(id: number, data: Partial<any>): Promise<any | null> {
    const result = await this.db
      .update(this.commentsTable)
      .set(data)
      .where(eq(this.commentsTable.comment_id, id))
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
      .delete(this.commentsTable)
      .where(
        and(
          eq(this.commentsTable.comment_id, commentId),
          eq(this.commentsTable.video_id, videoId),
          eq(this.commentsTable.timestamp, timestamp)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Deletes all this.commentsTable for a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted this.commentsTable
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .delete(this.commentsTable)
      .where(eq(this.commentsTable.video_id, videoId))
      .returning();
    return result.length;
  }

  /**
   * Finds a comment by video ID and timestamp
   *
   * @param videoId - The video identifier
   * @param timestamp - The comment timestamp
   * @returns The comment record or null if not found
   */
  async findByVideoIdAndTimestamp(videoId: string, timestamp: number): Promise<any | null> {
    const result = await this.db
      .select()
      .from(this.commentsTable)
      .where(
        and(eq(this.commentsTable.video_id, videoId), eq(this.commentsTable.timestamp, timestamp))
      )
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Counts total this.commentsTable across all videos
   *
   * @returns Total count of all this.commentsTable
   */
  async countAll(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(this.commentsTable);
    return result[0]?.count ?? 0;
  }

  /**
   * Counts this.commentsTable newer than a given timestamp
   *
   * @param timestamp - The timestamp to compare against
   * @returns Count of this.commentsTable newer than the timestamp
   */
  async countNewerThan(timestamp: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(this.commentsTable)
      .where(gt(this.commentsTable.timestamp, timestamp));
    return result[0]?.count ?? 0;
  }

  /**
   * Searches this.commentsTable with optional filters
   *
   * @param options - Search options including videoId, searchTerm, beforeTimestamp
   * @returns Array of matching this.commentsTable
   */
  async search(
    limit: number,
    sortDirection: string,
    timestamp: number,
    videoId?: string,
    searchTerm?: string
  ): Promise<any[]> {
    // Build conditions array
    const conditions = [];

    if (videoId !== undefined) {
      conditions.push(eq(this.commentsTable.video_id, videoId));
    }

    if (searchTerm !== undefined) {
      conditions.push(like(this.commentsTable.comment_plain_text_sanitized, `%${searchTerm}%`));
    }

    conditions.push(lt(this.commentsTable.timestamp, timestamp));

    // Build query - conditions always has at least the timestamp condition
    let query = this.db
      .select()
      .from(this.commentsTable)
      .where(and(...conditions));

    // Sort
    if (sortDirection === 'ascending') {
      query = query.orderBy(this.commentsTable.timestamp) as typeof query;
    } else {
      query = query.orderBy(desc(this.commentsTable.timestamp)) as typeof query;
    }

    return query.limit(limit);
  }

  /**
   * Deletes all comment records
   *
   * @returns Number of deleted this.commentsTable
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(this.commentsTable).returning();
    return result.length;
  }

  /**
   * Creates multiple comment records in bulk
   *
   * @param data - Array of comment data for insertion
   * @returns Array of created comment records
   */
  async createMany(data: any[]): Promise<any[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(this.commentsTable).values(data).returning();
  }
}
