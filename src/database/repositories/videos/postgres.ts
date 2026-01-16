import { eq, desc, asc, sql, and, or, like, count, lt, type SQL } from 'drizzle-orm';
import { videos } from '@database/schemas/postgres/index.js';
import type { DatabaseClient } from '@database/postgres-connection.js';
import type { IVideosRepository, VideoQueryOptions } from '@database/repositories/videos/interface.js';
import type { DrizzleVideo, DrizzleNewVideo } from '@database/schemas/postgres/index.js';

/**
 * VideosRepositoryPostgres class for video CRUD operations using PostgreSQL
 */
export class VideosRepositoryPostgres implements IVideosRepository<DrizzleVideo, DrizzleNewVideo> {
  private readonly db: DatabaseClient;
  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Finds a video by its unique video_id
   */
  async findById(videoId: string): Promise<DrizzleVideo | null> {
    const result = await this.db
      .select()
      .from(videos)
      .where(eq(videos.video_id, videoId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds a video by its database id
   */
  async findByDbId(id: number): Promise<DrizzleVideo | null> {
    const result = await this.db
      .select()
      .from(videos)
      .where(eq(videos.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all published videos with pagination
   */
  async findPublished(options?: VideoQueryOptions): Promise<DrizzleVideo[]> {
    const limit = options?.limit ?? 50;
    const sortDir = options?.sortDirection === 'asc' ? asc : desc;
    const sortField = this.getSortField(options?.sortBy ?? 'creation_timestamp');

    return this.db
      .select()
      .from(videos)
      .where(eq(videos.is_published, true))
      .orderBy(sortDir(sortField))
      .limit(limit);
  }

  /**
   * Finds all videos with optional filters and pagination
   */
  async findAll(options?: VideoQueryOptions): Promise<DrizzleVideo[]> {
    const limit = options?.limit;
    const sortDir = options?.sortDirection === 'asc' ? asc : desc;
    const sortField = this.getSortField(options?.sortBy ?? 'creation_timestamp');

    const conditions = this.buildWhereConditions(options);

    let query = this.db.select().from(videos).orderBy(sortDir(sortField));

    // Apply where conditions only if they exist
    query = conditions !== undefined ? (query.where(conditions) as typeof query) : query;

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  /**
   * Counts total videos matching the criteria
   */
  async getCount(options?: VideoQueryOptions): Promise<number> {
    const conditions = this.buildWhereConditions(options);

    const query = this.db.select({ count: count() }).from(videos);

    const result = conditions ? await query.where(conditions) : await query;

    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new video record
   */
  async create(data: DrizzleNewVideo): Promise<DrizzleVideo> {
    const result = await this.db.insert(videos).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create video record');
    }
    return result[0];
  }

  /**
   * Updates a video record
   */
  async update(videoId: string, data: Partial<DrizzleNewVideo>): Promise<DrizzleVideo | null> {
    const result = await this.db
      .update(videos)
      .set(data)
      .where(eq(videos.video_id, videoId))
      .returning();
    return result[0] ?? null;
  }

  /**
   * Deletes a video record
   */
  async delete(videoId: string): Promise<boolean> {
    const result = await this.db
      .delete(videos)
      .where(eq(videos.video_id, videoId))
      .returning();
    return result.length > 0;
  }

  /**
   * Increments the view count for a video
   */
  async incrementViews(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ views: sql`${videos.views} + 1` })
      .where(eq(videos.video_id, videoId));
  }

  /**
   * Increments the view count for a video by a specified amount
   */
  async incrementViewsBy(videoId: string, count: number): Promise<void> {
    await this.db
      .update(videos)
      .set({
        views: sql`${videos.views} + ${count}`,
        // Mark index as outdated if video is indexed (matches JS behavior)
        is_index_outdated: sql`CASE WHEN ${videos.is_indexed} = true THEN true ELSE ${videos.is_index_outdated} END`,
      })
      .where(eq(videos.video_id, videoId));
  }

  /**
   * Increments the like count for a video
   */
  async incrementLikes(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ likes: sql`${videos.likes} + 1` })
      .where(eq(videos.video_id, videoId));
  }

  /**
   * Increments the dislike count for a video
   */
  async incrementDislikes(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ dislikes: sql`${videos.dislikes} + 1` })
      .where(eq(videos.video_id, videoId));
  }

  /**
   * Increments the comment count for a video
   */
  async incrementComments(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ comments: sql`${videos.comments} + 1` })
      .where(eq(videos.video_id, videoId));
  }

  /**
   * Decrements the comment count for a video
   */
  async decrementComments(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ comments: sql`${videos.comments} - 1` })
      .where(eq(videos.video_id, videoId));
  }

  /**
   * Updates the bandwidth for a video
   */
  async updateBandwidth(videoId: string, bandwidth: number): Promise<void> {
    await this.db
      .update(videos)
      .set({ bandwidth })
      .where(eq(videos.video_id, videoId));
  }

  /**
   * Finds all currently streaming videos
   */
  async findStreaming(): Promise<DrizzleVideo[]> {
    return this.db
      .select()
      .from(videos)
      .where(eq(videos.is_streaming, true))
      .orderBy(desc(videos.creation_timestamp));
  }

  /**
   * Finds all indexed videos
   */
  async findIndexed(): Promise<DrizzleVideo[]> {
    return this.db
      .select()
      .from(videos)
      .where(eq(videos.is_indexed, true))
      .orderBy(desc(videos.creation_timestamp));
  }

  /**
   * Finds all videos that need indexing
   */
  async findPendingIndexing(): Promise<DrizzleVideo[]> {
    return this.db
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.is_published, true),
          or(eq(videos.is_indexed, false), eq(videos.is_index_outdated, true))
        )
      );
  }

  /**
   * Marks all indexed videos as outdated
   */
  async markAllIndexedAsOutdated(): Promise<void> {
    await this.db
      .update(videos)
      .set({ is_index_outdated: true })
      .where(eq(videos.is_indexed, true));
  }

  /**
   * Deletes all video records
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(videos).returning();
    return result.length;
  }

  /**
   * Creates multiple video records in bulk
   */
  async createMany(data: DrizzleNewVideo[]): Promise<DrizzleVideo[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(videos).values(data).returning();
  }

  /**
   * Gets the sort field based on the sort option
   */
  private getSortField(
    sortBy: string
  ):
    | typeof videos.views
    | typeof videos.likes
    | typeof videos.title
    | typeof videos.creation_timestamp {
    switch (sortBy) {
      case 'views':
        return videos.views;
      case 'likes':
        return videos.likes;
      case 'title':
        return videos.title;
      case 'creation_timestamp':
      default:
        return videos.creation_timestamp;
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
      conditions.push(eq(videos.is_published, options.isPublished));
    }

    if (options.isStreaming !== undefined) {
      conditions.push(eq(videos.is_streaming, options.isStreaming));
    }

    if (options.isFinalized !== undefined) {
      conditions.push(eq(videos.is_finalized, options.isFinalized));
    }

    if (options.search !== undefined && options.search !== '') {
      const searchPattern = `%${options.search}%`;
      conditions.push(
        or(
          like(videos.title, searchPattern),
          like(videos.description, searchPattern),
          like(videos.tags, searchPattern)
        )
      );
    }

    if (options.tagTerm !== undefined && options.tagTerm !== '') {
      const tagPattern = `%${options.tagTerm}%`;
      conditions.push(like(videos.tags, tagPattern));
    }

    if (options.timestamp !== undefined) {
      conditions.push(lt(videos.creation_timestamp, options.timestamp));
    }

    if (conditions.length === 0) {
      return undefined;
    }
    if (conditions.length === 1) {
      return conditions[0];
    }
    return and(...conditions);
  }
}