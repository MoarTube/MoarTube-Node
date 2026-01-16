import { eq, desc, count, gt } from 'drizzle-orm';
import type { PaginationOptions } from '@/types/index.js';
import type { IReportsCommentsRepository } from './interface.js';
import type {
  DrizzleCommentReport,
  DrizzleNewCommentReport,
} from '@database/schemas/postgres/reports-comments.js';
import type { DatabaseClient } from '@database/postgres-connection.js';
import { commentReports } from '@database/schemas/postgres/index.js';

/**
 * PostgreSQL implementation of the Reports Comments Repository
 */
export class ReportsCommentsRepositoryPostgres implements IReportsCommentsRepository<
  DrizzleCommentReport,
  DrizzleNewCommentReport
> {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Finds a comment report by its report_id
   */
  async findById(reportId: number): Promise<DrizzleCommentReport | null> {
    const result = await this.db
      .select()
      .from(commentReports)
      .where(eq(commentReports.report_id, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all comment reports with optional pagination
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleCommentReport[]> {
    const { limit } = { limit: options?.limit };

    const query = this.db.select().from(commentReports).orderBy(desc(commentReports.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  /**
   * Finds all reports for comments on a specific video
   */
  async findByVideoId(
    videoId: string,
    options?: PaginationOptions
  ): Promise<DrizzleCommentReport[]> {
    const { limit } = { limit: options?.limit ?? 20 };

    return this.db
      .select()
      .from(commentReports)
      .where(eq(commentReports.video_id, videoId))
      .orderBy(desc(commentReports.timestamp))
      .limit(limit);
  }

  /**
   * Finds all reports for a specific comment
   */
  async findByCommentId(
    commentId: number,
    options?: PaginationOptions
  ): Promise<DrizzleCommentReport[]> {
    const { limit } = { limit: options?.limit ?? 20 };

    return this.db
      .select()
      .from(commentReports)
      .where(eq(commentReports.comment_id, commentId))
      .orderBy(desc(commentReports.timestamp))
      .limit(limit);
  }

  /**
   * Counts total comment reports
   */
  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(commentReports);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new comment report record
   */
  async create(data: DrizzleNewCommentReport): Promise<DrizzleCommentReport> {
    const result = await this.db.insert(commentReports).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create comment report record');
    }
    return result[0];
  }

  /**
   * Deletes a comment report record
   */
  async delete(reportId: number): Promise<boolean> {
    const result = await this.db
      .delete(commentReports)
      .where(eq(commentReports.report_id, reportId))
      .returning();
    return result.length > 0;
  }

  /**
   * Deletes all reports for a specific comment
   */
  async deleteByCommentId(commentId: number): Promise<number> {
    const result = await this.db
      .delete(commentReports)
      .where(eq(commentReports.comment_id, commentId))
      .returning();
    return result.length;
  }

  /**
   * Deletes all reports for comments on a video
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .delete(commentReports)
      .where(eq(commentReports.video_id, videoId))
      .returning();
    return result.length;
  }

  /**
   * Counts comment reports newer than a given timestamp
   */
  async countNewerThan(timestamp: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(commentReports)
      .where(gt(commentReports.timestamp, timestamp));
    return result[0]?.count ?? 0;
  }

  /**
   * Deletes all comment report records
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(commentReports).returning();
    return result.length;
  }

  /**
   * Creates multiple comment report records in bulk
   */
  async createMany(data: DrizzleNewCommentReport[]): Promise<DrizzleCommentReport[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(commentReports).values(data).returning();
  }
}
