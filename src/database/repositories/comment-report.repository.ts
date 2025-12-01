/**
 * Comment Report Repository
 *
 * Provides data access methods for comment report records using Drizzle ORM.
 */
import { eq, desc, sql } from 'drizzle-orm';
import type { DrizzleCommentReport, DrizzleNewCommentReport } from '../schema';
import { commentReports } from '../schema';
import { BaseRepository } from './base.repository';
import type { PaginationOptions } from '../../types/models';

/**
 * CommentReportRepository class for comment report CRUD operations
 */
export class CommentReportRepository extends BaseRepository {
  /**
   * Finds a comment report by its report_id
   *
   * @param reportId - The report primary key
   * @returns The report record or null if not found
   */
  async findById(reportId: number): Promise<DrizzleCommentReport | null> {
    const result = await this.db
      .select()
      .from(commentReports)
      .where(eq(commentReports.reportId, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all comment reports with pagination
   *
   * @param options - Pagination options
   * @returns Array of comment reports
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleCommentReport[]> {
    const { limit, offset } = this.getPaginationParams(options);

    return this.db
      .select()
      .from(commentReports)
      .orderBy(desc(commentReports.timestamp))
      .limit(limit)
      .offset(offset);
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
  ): Promise<DrizzleCommentReport[]> {
    const { limit, offset } = this.getPaginationParams(options);

    return this.db
      .select()
      .from(commentReports)
      .where(eq(commentReports.videoId, videoId))
      .orderBy(desc(commentReports.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Finds all reports for a specific comment
   *
   * @param commentId - The comment identifier
   * @param options - Pagination options
   * @returns Array of reports for the comment
   */
  async findByCommentId(
    commentId: string,
    options?: PaginationOptions
  ): Promise<DrizzleCommentReport[]> {
    const { limit, offset } = this.getPaginationParams(options);

    return this.db
      .select()
      .from(commentReports)
      .where(eq(commentReports.commentId, commentId))
      .orderBy(desc(commentReports.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Counts total comment reports
   *
   * @returns Total count of comment reports
   */
  async count(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(commentReports);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new comment report record
   *
   * @param data - Report data for insertion
   * @returns The created report record
   * @throws Error if insert fails to return a record
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
   *
   * @param reportId - The report primary key
   * @returns true if deleted, false if not found
   */
  async delete(reportId: number): Promise<boolean> {
    const result = await this.db
      .delete(commentReports)
      .where(eq(commentReports.reportId, reportId))
      .returning();
    return result.length > 0;
  }

  /**
   * Deletes all reports for a specific comment
   *
   * @param commentId - The comment identifier
   * @returns Number of deleted reports
   */
  async deleteByCommentId(commentId: string): Promise<number> {
    const result = await this.db
      .delete(commentReports)
      .where(eq(commentReports.commentId, commentId))
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
      .delete(commentReports)
      .where(eq(commentReports.videoId, videoId))
      .returning();
    return result.length;
  }
}
