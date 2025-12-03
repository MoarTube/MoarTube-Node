/**
 * Reports Archive Comments Repository
 *
 * Provides data access methods for archived comment report records using Drizzle ORM.
 */
import { eq, desc, sql } from 'drizzle-orm';
import type { DrizzleCommentReportArchive, DrizzleNewCommentReportArchive } from '../schema/index.js';
import { commentReportsArchive } from '../schema/index.js';
import { BaseRepository } from './base.js';
import type { PaginationOptions } from '../../types/models.js';

/**
 * ReportsArchiveCommentsRepository class for archived comment report CRUD operations
 */
export class ReportsArchiveCommentsRepository extends BaseRepository {
  /**
   * Finds an archived comment report by its archive_id
   *
   * @param archiveId - The archive primary key
   * @returns The archive record or null if not found
   */
  async findById(archiveId: number): Promise<DrizzleCommentReportArchive | null> {
    const result = await this.db
      .select()
      .from(commentReportsArchive)
      .where(eq(commentReportsArchive.archiveId, archiveId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all archived comment reports with optional pagination
   *
   * @param options - Pagination options (optional limit/offset)
   * @returns Array of archived comment reports
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleCommentReportArchive[]> {
    const { limit, offset } = this.getPaginationParams(options);

    const query = this.db
      .select()
      .from(commentReportsArchive)
      .orderBy(desc(commentReportsArchive.timestamp));

    if (limit !== undefined) {
      return query.limit(limit).offset(offset);
    }

    return query.offset(offset);
  }

  /**
   * Finds all archived reports for comments on a specific video
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of archived reports for comments on the video
   */
  async findByVideoId(
    videoId: string,
    options?: PaginationOptions
  ): Promise<DrizzleCommentReportArchive[]> {
    const { limit, offset } = this.getPaginationParamsWithDefault(options);

    return this.db
      .select()
      .from(commentReportsArchive)
      .where(eq(commentReportsArchive.videoId, videoId))
      .orderBy(desc(commentReportsArchive.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Finds all archived reports for a specific comment
   *
   * @param commentId - The comment identifier
   * @param options - Pagination options
   * @returns Array of archived reports for the comment
   */
  async findByCommentId(
    commentId: string,
    options?: PaginationOptions
  ): Promise<DrizzleCommentReportArchive[]> {
    const { limit, offset } = this.getPaginationParamsWithDefault(options);

    return this.db
      .select()
      .from(commentReportsArchive)
      .where(eq(commentReportsArchive.commentId, commentId))
      .orderBy(desc(commentReportsArchive.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Finds an archived report by its original report_id
   *
   * @param reportId - The original report ID
   * @returns The archive record or null if not found
   */
  async findByReportId(reportId: number): Promise<DrizzleCommentReportArchive | null> {
    const result = await this.db
      .select()
      .from(commentReportsArchive)
      .where(eq(commentReportsArchive.reportId, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Counts total archived comment reports
   *
   * @returns Total count of archived comment reports
   */
  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(commentReportsArchive);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new archived comment report record
   *
   * @param data - Archive data for insertion
   * @returns The created archive record
   * @throws Error if insert fails to return a record
   */
  async create(data: DrizzleNewCommentReportArchive): Promise<DrizzleCommentReportArchive> {
    const result = await this.db.insert(commentReportsArchive).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create comment report archive record');
    }
    return result[0];
  }

  /**
   * Deletes an archived comment report record
   *
   * @param archiveId - The archive primary key
   * @returns true if deleted, false if not found
   */
  async delete(archiveId: number): Promise<boolean> {
    const result = await this.db
      .delete(commentReportsArchive)
      .where(eq(commentReportsArchive.archiveId, archiveId))
      .returning();
    return result.length > 0;
  }

  /**
   * Deletes all archived reports for a specific comment
   *
   * @param commentId - The comment identifier
   * @returns Number of deleted archive records
   */
  async deleteByCommentId(commentId: string): Promise<number> {
    const result = await this.db
      .delete(commentReportsArchive)
      .where(eq(commentReportsArchive.commentId, commentId))
      .returning();
    return result.length;
  }

  /**
   * Deletes all archived reports for comments on a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted archive records
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .delete(commentReportsArchive)
      .where(eq(commentReportsArchive.videoId, videoId))
      .returning();
    return result.length;
  }

  /**
   * Deletes all archived comment report records
   *
   * @returns Number of deleted archive records
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(commentReportsArchive).returning();
    return result.length;
  }

  /**
   * Creates multiple archived comment report records in bulk
   *
   * @param data - Array of archive data for insertion
   * @returns Array of created archive records
   */
  async createMany(data: DrizzleNewCommentReportArchive[]): Promise<DrizzleCommentReportArchive[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(commentReportsArchive).values(data).returning();
  }
}
