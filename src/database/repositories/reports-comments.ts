/**
 * Reports Comments Repository
 *
 * Provides data access methods for comment report records using Drizzle ORM.
 */
import { eq, desc, count, gt } from 'drizzle-orm';
import { BaseRepository } from '@database/repositories/base.js';
import type { PaginationOptions } from '@/types/index.js';

/**
 * ReportsCommentsRepository class for comment report CRUD operations
 */
export class ReportsCommentsRepository extends BaseRepository {
  constructor(db: any, private readonly commentReportsTable: any) {
    super(db);
  }
  /**
   * Finds a comment report by its report_id
   *
   * @param reportId - The report primary key
   * @returns The report record or null if not found
   */
  async findById(reportId: number): Promise<any | null> {
    const result = await this.db
      .select()
      .from(this.commentReportsTable)
      .where(eq(this.commentReportsTable.report_id, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all comment reports with optional pagination
   *
   * @param options - Pagination options (optional limit)
   * @returns Array of comment reports
   */
  async findAll(options?: PaginationOptions): Promise<any[]> {
    const { limit } = this.getPaginationParams(options);

    const query = this.db.select().from(this.commentReportsTable).orderBy(desc(this.commentReportsTable.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  /**
   * Finds all reports for comments on a specific video
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of reports for comments on the video
   */
  async findByVideoId(
    videoId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    const { limit } = this.getPaginationParamsWithDefault(options);

    return this.db
      .select()
      .from(this.commentReportsTable)
      .where(eq(this.commentReportsTable.video_id, videoId))
      .orderBy(desc(this.commentReportsTable.timestamp))
      .limit(limit);
  }

  /**
   * Finds all reports for a specific comment
   *
   * @param commentId - The comment identifier
   * @param options - Pagination options
   * @returns Array of reports for the comment
   */
  async findByCommentId(
    commentId: number,
    options?: PaginationOptions
  ): Promise<any[]> {
    const { limit } = this.getPaginationParamsWithDefault(options);

    return this.db
      .select()
      .from(this.commentReportsTable)
      .where(eq(this.commentReportsTable.comment_id, commentId))
      .orderBy(desc(this.commentReportsTable.timestamp))
      .limit(limit);
  }

  /**
   * Counts total comment reports
   *
   * @returns Total count of comment reports
   */
  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(this.commentReportsTable);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new comment report record
   *
   * @param data - Report data for insertion
   * @returns The created report record
   * @throws Error if insert fails to return a record
   */
  async create(data: any): Promise<any> {
    const result = await this.db.insert(this.commentReportsTable).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create comment report record');
    }
    return result[0];
  }

  /**
   * Deletes a comment report record
   *
   * @param reportId - The report primary key
   * @returns true if deleted, false if not found
   */
  async delete(reportId: number): Promise<boolean> {
    const result = await this.db
      .delete(this.commentReportsTable)
      .where(eq(this.commentReportsTable.report_id, reportId))
      .returning();
    return result.length > 0;
  }

  /**
   * Deletes all reports for a specific comment
   *
   * @param commentId - The comment identifier
   * @returns Number of deleted reports
   */
  async deleteByCommentId(commentId: number): Promise<number> {
    const result = await this.db
      .delete(this.commentReportsTable)
      .where(eq(this.commentReportsTable.comment_id, commentId))
      .returning();
    return result.length;
  }

  /**
   * Deletes all reports for comments on a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted reports
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .delete(this.commentReportsTable)
      .where(eq(this.commentReportsTable.video_id, videoId))
      .returning();
    return result.length;
  }

  /**
   * Counts comment reports newer than a given timestamp
   *
   * @param timestamp - The timestamp to compare against
   * @returns Count of comment reports newer than the timestamp
   */
  async countNewerThan(timestamp: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(this.commentReportsTable)
      .where(gt(this.commentReportsTable.timestamp, timestamp));
    return result[0]?.count ?? 0;
  }

  /**
   * Deletes all comment report records
   *
   * @returns Number of deleted reports
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(this.commentReportsTable).returning();
    return result.length;
  }

  /**
   * Creates multiple comment report records in bulk
   *
   * @param data - Array of report data for insertion
   * @returns Array of created report records
   */
  async createMany(data: any[]): Promise<any[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(this.commentReportsTable).values(data).returning();
  }
}
