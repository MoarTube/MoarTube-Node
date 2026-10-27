import { inArray, sql, type SQL, or } from 'drizzle-orm';
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

  async findByIds(videoId: string, ids: number[]): Promise<DrizzleComment[]> {
    if (!ids.length) {
      return [];
    }
    return this.db
      .select()
      .from(comments)
      .where(and(eq(comments.video_id, videoId), inArray(comments.comment_id, ids.slice(0, 100))));
  }

  async findById(
    videoId: string,
    commentId: number,
    timestamp?: number
  ): Promise<DrizzleComment | null> {
    const result = await this.db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.comment_id, commentId),
          eq(comments.video_id, videoId),
          timestamp === undefined ? undefined : eq(comments.timestamp, timestamp)
        )
      )
      .limit(1);
    return result[0] ?? null;
  }

  async findByVideoId(
    videoId: string,
    page = { limit: 101, offset: 0 }
  ): Promise<DrizzleComment[]> {
    return this.db
      .select()
      .from(comments)
      .where(eq(comments.video_id, videoId))
      .orderBy(desc(comments.timestamp), desc(comments.comment_id))
      .offset(page.offset)
      .limit(Math.min(page.limit, 101));
  }

  async findByVideoIdWithTimestampFilter(
    videoId: string,
    type: 'before' | 'after',
    sort: 'ascending' | 'descending',
    timestamp: number,
    cursorId?: number
  ): Promise<DrizzleComment[]> {
    const timestampCondition =
      type === 'before'
        ? cursorId !== undefined
          ? or(
              lt(comments.timestamp, timestamp),
              and(eq(comments.timestamp, timestamp), lt(comments.comment_id, cursorId))
            )
          : lt(comments.timestamp, timestamp)
        : cursorId !== undefined
          ? or(
              gt(comments.timestamp, timestamp),
              and(eq(comments.timestamp, timestamp), gt(comments.comment_id, cursorId))
            )
          : gt(comments.timestamp, timestamp);
    const orderBy = sort === 'ascending' ? comments.timestamp : desc(comments.timestamp);

    return this.db
      .select()
      .from(comments)
      .where(and(eq(comments.video_id, videoId), timestampCondition))
      .orderBy(orderBy, sort === 'ascending' ? comments.comment_id : desc(comments.comment_id))
      .limit(cursorId === undefined ? 100 : 101);
  }

  private async cacheQuery<T>(query: SQL): Promise<T[]> {
    return Array.from(await this.db.execute(query)) as T[];
  }

  async getBacklinksForComments(
    videoId: string,
    ids: number[],
    beforeReplyId?: number
  ): Promise<{ parent_id: number; reply_id: number }[]> {
    if (!ids.length) {
      return [];
    }
    const parts = ids.slice(0, 100).map(
      (id) => sql`SELECT parent_id,reply_id FROM (
      SELECT parent_id,reply_id FROM comment_edges WHERE video_id=${videoId} AND parent_id=${id}
      ${beforeReplyId === undefined ? sql`` : sql`AND reply_id<${beforeReplyId}`}
      ORDER BY reply_id DESC LIMIT 101) limited`
    );
    const rows = await this.cacheQuery<{ parent_id: number | string; reply_id: number | string }>(
      sql.join(parts, sql` UNION ALL `)
    );
    return rows.map((row) => ({
      parent_id: Number(row.parent_id),
      reply_id: Number(row.reply_id),
    }));
  }

  async getCacheEpoch(): Promise<string> {
    const rows = await this.cacheQuery<{ value: string }>(
      sql`SELECT value FROM database_meta WHERE key='instance_id'`
    );
    return (rows as [{ value: string }])[0].value;
  }

  async getCacheVersion(videoId: string): Promise<number> {
    const rows = await this.cacheQuery<{ version: number | string }>(
      sql`SELECT COALESCE(MAX(version),0) AS version FROM comment_changes WHERE video_id=${videoId}`
    );
    return Number((rows as [{ version: number | string }])[0].version);
  }

  async getCacheChanges(
    videoId: string,
    since: number
  ): Promise<{ version: number; comment_id: number; deleted: number }[]> {
    const rows = await this.cacheQuery<{
      version: number | string;
      comment_id: number | string;
      deleted: number;
    }>(
      sql`SELECT version,comment_id,deleted FROM comment_changes WHERE video_id=${videoId} AND version>${since} ORDER BY version LIMIT 101`
    );
    return rows.map((row) => ({
      version: Number(row.version),
      comment_id: Number(row.comment_id),
      deleted: row.deleted,
    }));
  }

  async countByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(comments)
      .where(eq(comments.video_id, videoId));
    // An ungrouped COUNT always returns one row, including zero matches.
    return (result as [{ count: number }])[0].count;
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
    // An ungrouped COUNT always returns one row, including zero matches.
    return (result as [{ count: number }])[0].count;
  }

  async countNewerThan(timestamp: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(comments)
      .where(gt(comments.timestamp, timestamp));
    // An ungrouped COUNT always returns one row, including zero matches.
    return (result as [{ count: number }])[0].count;
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
