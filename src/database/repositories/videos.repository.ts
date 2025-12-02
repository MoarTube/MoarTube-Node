/**
 * Videos Repository
 *
 * Provides data access methods for video records using Drizzle ORM.
 */
import { eq, desc, asc, sql, and, or, like } from 'drizzle-orm';
import type { DrizzleVideo, DrizzleNewVideo } from '../schema';
import { videos } from '../schema';
import { BaseRepository } from './base.repository';
import type { PaginationOptions } from '../../types/models';

/**
 * Options for querying videos
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
}

/**
 * VideosRepository class for video CRUD operations
 */
export class VideosRepository extends BaseRepository {
  /**
   * Finds a video by its unique video_id
   *
   * @param videoId - The unique video identifier
   * @returns The video record or null if not found
   */
  async findById(videoId: string): Promise<DrizzleVideo | null> {
    const result = await this.db.select().from(videos).where(eq(videos.videoId, videoId)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds a video by its database id
   *
   * @param id - The database primary key
   * @returns The video record or null if not found
   */
  async findByDbId(id: number): Promise<DrizzleVideo | null> {
    const result = await this.db.select().from(videos).where(eq(videos.id, id)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all published videos with pagination
   *
   * @param options - Query options for pagination and sorting
   * @returns Array of published videos
   */
  async findPublished(options?: VideoQueryOptions): Promise<DrizzleVideo[]> {
    const { limit, offset } = this.getPaginationParams(options);
    const sortDir = options?.sortDirection === 'asc' ? asc : desc;
    const sortField = this.getSortField(options?.sortBy ?? 'creation_timestamp');

    return this.db
      .select()
      .from(videos)
      .where(eq(videos.isPublished, true))
      .orderBy(sortDir(sortField))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Finds all videos with optional filters and pagination
   *
   * @param options - Query options
   * @returns Array of videos matching the criteria
   */
  async findAll(options?: VideoQueryOptions): Promise<DrizzleVideo[]> {
    const { limit, offset } = this.getPaginationParams(options);
    const sortDir = options?.sortDirection === 'asc' ? asc : desc;
    const sortField = this.getSortField(options?.sortBy ?? 'creation_timestamp');

    const conditions = this.buildWhereConditions(options);

    const query = this.db
      .select()
      .from(videos)
      .orderBy(sortDir(sortField))
      .limit(limit)
      .offset(offset);

    if (conditions) {
      return query.where(conditions);
    }

    return query;
  }

  /**
   * Counts total videos matching the criteria
   *
   * @param options - Query options for filtering
   * @returns Total count of matching videos
   */
  async count(options?: VideoQueryOptions): Promise<number> {
    const conditions = this.buildWhereConditions(options);

    const query = this.db.select({ count: sql<number>`count(*)` }).from(videos);

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
    const result = await this.db.insert(videos).values(data).returning();
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
      .update(videos)
      .set(data)
      .where(eq(videos.videoId, videoId))
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
    const result = await this.db.delete(videos).where(eq(videos.videoId, videoId)).returning();
    return result.length > 0;
  }

  /**
   * Increments the view count for a video
   *
   * @param videoId - The unique video identifier
   */
  async incrementViews(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ views: sql`${videos.views} + 1` })
      .where(eq(videos.videoId, videoId));
  }

  /**
   * Increments the like count for a video
   *
   * @param videoId - The unique video identifier
   */
  async incrementLikes(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ likes: sql`${videos.likes} + 1` })
      .where(eq(videos.videoId, videoId));
  }

  /**
   * Increments the dislike count for a video
   *
   * @param videoId - The unique video identifier
   */
  async incrementDislikes(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ dislikes: sql`${videos.dislikes} + 1` })
      .where(eq(videos.videoId, videoId));
  }

  /**
   * Increments the comment count for a video
   *
   * @param videoId - The unique video identifier
   */
  async incrementComments(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ comments: sql`${videos.comments} + 1` })
      .where(eq(videos.videoId, videoId));
  }

  /**
   * Decrements the comment count for a video
   *
   * @param videoId - The unique video identifier
   */
  async decrementComments(videoId: string): Promise<void> {
    await this.db
      .update(videos)
      .set({ comments: sql`${videos.comments} - 1` })
      .where(eq(videos.videoId, videoId));
  }

  /**
   * Updates the bandwidth for a video
   *
   * @param videoId - The unique video identifier
   * @param bandwidth - The new bandwidth value
   */
  async updateBandwidth(videoId: string, bandwidth: number): Promise<void> {
    await this.db.update(videos).set({ bandwidth }).where(eq(videos.videoId, videoId));
  }

  /**
   * Finds all currently streaming videos
   *
   * @returns Array of streaming videos
   */
  async findStreaming(): Promise<DrizzleVideo[]> {
    return this.db
      .select()
      .from(videos)
      .where(eq(videos.isStreaming, true))
      .orderBy(desc(videos.creationTimestamp));
  }

  /**
   * Finds all videos that need indexing
   *
   * @returns Array of videos pending indexing
   */
  async findPendingIndexing(): Promise<DrizzleVideo[]> {
    return this.db
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.isPublished, true),
          or(eq(videos.isIndexed, false), eq(videos.isIndexOutdated, true))
        )
      );
  }

  /**
   * Gets the sort field based on the sort option
   */
  private getSortField(sortBy: string) {
    switch (sortBy) {
      case 'views':
        return videos.views;
      case 'likes':
        return videos.likes;
      case 'title':
        return videos.title;
      case 'creation_timestamp':
      default:
        return videos.creationTimestamp;
    }
  }

  /**
   * Builds WHERE conditions from query options
   */
  private buildWhereConditions(options?: VideoQueryOptions) {
    if (!options) {
      return undefined;
    }

    const conditions = [];

    if (options.isPublished !== undefined) {
      conditions.push(eq(videos.isPublished, options.isPublished));
    }

    if (options.isStreaming !== undefined) {
      conditions.push(eq(videos.isStreaming, options.isStreaming));
    }

    if (options.isFinalized !== undefined) {
      conditions.push(eq(videos.isFinalized, options.isFinalized));
    }

    if (options.search) {
      const searchPattern = `%${options.search}%`;
      conditions.push(
        or(
          like(videos.title, searchPattern),
          like(videos.description, searchPattern),
          like(videos.tags, searchPattern)
        )
      );
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
