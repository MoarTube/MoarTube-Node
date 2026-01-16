import type { ICommentsRepository } from '@database/repositories/comments/interface.js';
import type { DrizzleComment, DrizzleNewComment } from '@database/schemas/postgres/comments.js';
import type { DatabaseClient } from '@database/postgres-connection.js';
import { comments } from '@database/schemas/postgres/index.js';
import { eq, desc, and, gt, lt, like, count } from 'drizzle-orm';

export class CommentsRepositoryPostgres implements ICommentsRepository<
  DrizzleComment,
  DrizzleNewComment
> {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

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

  async findByVideoId(videoId: string): Promise<DrizzleComment[]> {
    return this.db
      .select()
      .from(comments)
      .where(eq(comments.video_id, videoId))
      .orderBy(desc(comments.timestamp));
  }

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

  async countByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(comments)
      .where(eq(comments.video_id, videoId));
    return result[0]?.count ?? 0;
  }

  async findAll(): Promise<DrizzleComment[]> {
    return this.db.select().from(comments);
  }

  async create(data: DrizzleNewComment): Promise<DrizzleComment> {
    const result = await this.db.insert(comments).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create comment record');
    }
    return result[0];
  }

  async update(id: number, data: Partial<DrizzleNewComment>): Promise<DrizzleComment | null> {
    const result = await this.db
      .update(comments)
      .set(data)
      .where(eq(comments.comment_id, id))
      .returning();
    return result[0] ?? null;
  }

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

  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db.delete(comments).where(eq(comments.video_id, videoId)).returning();
    return result.length;
  }

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

  async countAll(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(comments);
    return result[0]?.count ?? 0;
  }

  async countNewerThan(timestamp: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(comments)
      .where(gt(comments.timestamp, timestamp));
    return result[0]?.count ?? 0;
  }

  async search(
    limit: number,
    sortDirection: string,
    timestamp: number,
    videoId?: string,
    searchTerm?: string
  ): Promise<DrizzleComment[]> {
    const conditions = [];
    if (videoId !== undefined) {
      conditions.push(eq(comments.video_id, videoId));
    }
    if (searchTerm !== undefined) {
      conditions.push(like(comments.comment_plain_text_sanitized, `%${searchTerm}%`));
    }
    conditions.push(lt(comments.timestamp, timestamp));
    let query = this.db
      .select()
      .from(comments)
      .where(and(...conditions));
    if (sortDirection === 'ascending') {
      query = query.orderBy(comments.timestamp) as typeof query;
    } else {
      query = query.orderBy(desc(comments.timestamp)) as typeof query;
    }
    return query.limit(limit);
  }

  async deleteAll(): Promise<number> {
    const result = await this.db.delete(comments).returning();
    return result.length;
  }

  async createMany(data: DrizzleNewComment[]): Promise<DrizzleComment[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(comments).values(data).returning();
  }
}
