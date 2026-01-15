/**
 * this.videosTable Repository
 *
 * Provides data access methods for video records using Drizzle ORM.
 */
import { eq, desc, asc, sql, and, or, like, count, lt, type SQL } from 'drizzle-orm';
import { BaseRepository } from '@database/repositories/base.js';
import type { PaginationOptions } from '@/types/index.js';
import type { DrizzleVideo, DrizzleNewVideo } from '@database/schemas/sqlite/index.js';

/**
 * Options for querying this.videosTable
 */
export interface VideoQueryOptions extends PaginationOptions {
  /** Sort field */
  sortBy?: 'creation_timestamp' | 'views' | 'likes' | 'title';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
  /** Filter by published status */
  isPublished?: boolean;
  /** Filter by streaming status */
  isStreaming?: boolean;
  /** Filter by finalized status */
  isFinalized?: boolean;
  /** Search in title, description, or tags */
  search?: string;
  /** Filter by specific tag */
  tagTerm?: string;
  /** Timestamp for pagination */
  timestamp?: number;
}

/**
 * VideosRepository class for video CRUD operations
 */
export class VideosRepository extends BaseRepository {
  constructor(
    db: any,
    private readonly videosTable: any
  ) {
    super(db);
  }
  /**
   * Finds a video by its unique video_id
   *
   * @param videoId - The unique video identifier
   * @returns The video record or null if not found
   */
  async findById(videoId: string): Promise<DrizzleVideo | null> {
    const result = await this.db
      .select()
      .from(this.videosTable)
      .where(eq(this.videosTable.video_id, videoId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds a video by its database id
   *
   * @param id - The database primary key
   * @returns The video record or null if not found
   */
  async findByDbId(id: number): Promise<DrizzleVideo> {
    const result = await this.db
      .select()
      .from(this.videosTable)
      .where(eq(this.videosTable.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all published this.videosTable with pagination
   *
   * @param options - Query options for pagination and sorting
   * @returns Array of published this.videosTable
   */
  async findPublished(options?: VideoQueryOptions): Promise<DrizzleVideo[]> {
    const { limit } = this.getPaginationParamsWithDefault(options);
    const sortDir = options?.sortDirection === 'asc' ? asc : desc;
    const sortField = this.getSortField(options?.sortBy ?? 'creation_timestamp');

    return this.db
      .select()
      .from(this.videosTable)
      .where(eq(this.videosTable.is_published, true))
      .orderBy(sortDir(sortField))
      .limit(limit);
  }

  /**
   * Finds all this.videosTable with optional filters and pagination
   *
   * @param options - Query options including optional limit
   * @returns Array of this.videosTable matching the criteria
   */
  async findAll(options?: VideoQueryOptions): Promise<DrizzleVideo[]> {
    const { limit } = this.getPaginationParams(options);
    const sortDir = options?.sortDirection === 'asc' ? asc : desc;
    const sortField = this.getSortField(options?.sortBy ?? 'creation_timestamp');

    const conditions = this.buildWhereConditions(options);

    let query = this.db.select().from(this.videosTable).orderBy(sortDir(sortField));

    // Apply where conditions only if they exist
    query = conditions !== undefined ? (query.where(conditions)) : query;

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  /**
   * Counts total this.videosTable matching the criteria
   *
   * @param options - Query options for filtering
   * @returns Total count of matching this.videosTable
   */
  async getCount(options?: VideoQueryOptions): Promise<number> {
    const conditions = this.buildWhereConditions(options);

    const query = this.db.select({ count: count() }).from(this.videosTable);

    const result = conditions ? await query.where(conditions) : await query;

    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new video record
   *
   * @param data - Video data for insertion
   * @returns The created video record
   * @throws Error if insert fails to return a record
   */
  async create(data: DrizzleNewVideo): Promise<DrizzleVideo> {
    const result = await this.db.insert(this.videosTable).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create video record');
    }
    return result[0];
  }

  /**
   * Updates a video record
   *
   * @param videoId - The unique video identifier
   * @param data - Partial video data to update
   * @returns The updated video record or null if not found
   */
  async update(videoId: string, data: Partial<DrizzleNewVideo>): Promise<DrizzleVideo | null> {
    const result = await this.db
      .update(this.videosTable)
      .set(data)
      .where(eq(this.videosTable.video_id, videoId))
      .returning();
    return result[0] ?? null;
  }

  /**
   * Deletes a video record
   *
   * @param videoId - The unique video identifier
   * @returns true if deleted, false if not found
   */
  async delete(videoId: string): Promise<boolean> {
    const result = await this.db
      .delete(this.videosTable)
      .where(eq(this.videosTable.video_id, videoId))
      .returning();
    return result.length > 0;
  }

  /**
   * Increments the view count for a video
   *
   * @param videoId - The unique video identifier
   */
  async incrementViews(videoId: string): Promise<void> {
    await this.db
      .update(this.videosTable)
      .set({ views: sql`${this.videosTable.views} + 1` })
      .where(eq(this.videosTable.video_id, videoId));
  }

  /**
   * Increments the view count for a video by a specified amount
   * Also marks the index as outdated if the video is indexed
   *
   * @param videoId - The unique video identifier
   * @param count - The number of views to add
   */
  async incrementViewsBy(videoId: string, count: number): Promise<void> {
    await this.db
      .update(this.videosTable)
      .set({
        views: sql`${this.videosTable.views} + ${count}`,
        // Mark index as outdated if video is indexed (matches JS behavior)
        is_index_outdated: sql`CASE WHEN ${this.videosTable.is_indexed} = true THEN true ELSE ${this.videosTable.is_index_outdated} END`,
      })
      .where(eq(this.videosTable.video_id, videoId));
  }

  /**
   * Increments the like count for a video
   *
   * @param videoId - The unique video identifier
   */
  async incrementLikes(videoId: string): Promise<void> {
    await this.db
      .update(this.videosTable)
      .set({ likes: sql`${this.videosTable.likes} + 1` })
      .where(eq(this.videosTable.video_id, videoId));
  }

  /**
   * Increments the dislike count for a video
   *
   * @param videoId - The unique video identifier
   */
  async incrementDislikes(videoId: string): Promise<void> {
    await this.db
      .update(this.videosTable)
      .set({ dislikes: sql`${this.videosTable.dislikes} + 1` })
      .where(eq(this.videosTable.video_id, videoId));
  }

  /**
   * Increments the comment count for a video
   *
   * @param videoId - The unique video identifier
   */
  async incrementComments(videoId: string): Promise<void> {
    await this.db
      .update(this.videosTable)
      .set({ comments: sql`${this.videosTable.comments} + 1` })
      .where(eq(this.videosTable.video_id, videoId));
  }

  /**
   * Decrements the comment count for a video
   *
   * @param videoId - The unique video identifier
   */
  async decrementComments(videoId: string): Promise<void> {
    await this.db
      .update(this.videosTable)
      .set({ comments: sql`${this.videosTable.comments} - 1` })
      .where(eq(this.videosTable.video_id, videoId));
  }

  /**
   * Updates the bandwidth for a video
   *
   * @param videoId - The unique video identifier
   * @param bandwidth - The new bandwidth value
   */
  async updateBandwidth(videoId: string, bandwidth: number): Promise<void> {
    await this.db
      .update(this.videosTable)
      .set({ bandwidth })
      .where(eq(this.videosTable.video_id, videoId));
  }

  /**
   * Finds all currently streaming this.videosTable
   *
   * @returns Array of streaming this.videosTable
   */
  async findStreaming(): Promise<DrizzleVideo[]> {
    return this.db
      .select()
      .from(this.videosTable)
      .where(eq(this.videosTable.is_streaming, true))
      .orderBy(desc(this.videosTable.creation_timestamp));
  }

  /**
   * Finds all indexed this.videosTable
   *
   * @returns Array of indexed this.videosTable
   */
  async findIndexed(): Promise<DrizzleVideo[]> {
    return this.db
      .select()
      .from(this.videosTable)
      .where(eq(this.videosTable.is_indexed, true))
      .orderBy(desc(this.videosTable.creation_timestamp));
  }

  /**
   * Finds all this.videosTable that need indexing
   *
   * @returns Array of this.videosTable pending indexing
   */
  async findPendingIndexing(): Promise<DrizzleVideo[]> {
    return this.db
      .select()
      .from(this.videosTable)
      .where(
        and(
          eq(this.videosTable.is_published, true),
          or(eq(this.videosTable.is_indexed, false), eq(this.videosTable.is_index_outdated, true))
        )
      );
  }

  /**
   * Marks all indexed this.videosTable as outdated
   *
   * This is used when node settings change (e.g., avatar update)
   * to signal that indexed this.videosTable need to be re-indexed.
   */
  async markAllIndexedAsOutdated(): Promise<void> {
    await this.db
      .update(this.videosTable)
      .set({ is_index_outdated: true })
      .where(eq(this.videosTable.is_indexed, true));
  }

  /**
   * Gets the sort field based on the sort option
   */
  private getSortField(
    sortBy: string
  ):
    | typeof this.videosTable.views
     
     
      {
    switch (sortBy) {
      case 'views':
        return this.videosTable.views;
      case 'likes':
        return this.videosTable.likes;
      case 'title':
        return this.videosTable.title;
      case 'creation_timestamp':
      default:
        return this.videosTable.creation_timestamp;
    }
  }

  /**
   * Builds WHERE conditions from query options
   */
  private buildWhereConditions(options?: VideoQueryOptions): SQL | undefined {
    if (options === undefined) {
      return undefined;
    }

    const conditions = [];

    if (options.isPublished !== undefined) {
      conditions.push(eq(this.videosTable.is_published, options.isPublished));
    }

    if (options.isStreaming !== undefined) {
      conditions.push(eq(this.videosTable.is_streaming, options.isStreaming));
    }

    if (options.isFinalized !== undefined) {
      conditions.push(eq(this.videosTable.is_finalized, options.isFinalized));
    }

    if (options.search !== undefined && options.search !== '') {
      const searchPattern = `%${options.search}%`;
      conditions.push(
        or(
          like(this.videosTable.title, searchPattern),
          like(this.videosTable.description, searchPattern),
          like(this.videosTable.tags, searchPattern)
        )
      );
    }

    if (options.tagTerm !== undefined && options.tagTerm !== '') {
      const tagPattern = `%${options.tagTerm}%`;
      conditions.push(like(this.videosTable.tags, tagPattern));
    }

    if (options.timestamp !== undefined) {
      conditions.push(lt(this.videosTable.creation_timestamp, options.timestamp));
    }

    if (conditions.length === 0) {
      return undefined;
    }
    if (conditions.length === 1) {
      return conditions[0];
    }
    return and(...conditions);
  }

  /**
   * Deletes all video records
   *
   * @returns Number of deleted this.videosTable
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(this.videosTable).returning();
    return result.length;
  }

  /**
   * Creates multiple video records in bulk
   *
   * @param data - Array of video data for insertion
   * @returns Array of created video records
   */
  async createMany(data: DrizzleNewVideo[]): Promise<DrizzleVideo[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(this.videosTable).values(data).returning();
  }
}
