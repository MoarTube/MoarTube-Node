/**
 * Reports Archive Comments Repository - PostgreSQL Implementation
 *
 * Provides data access methods for archived comment report records using Drizzle ORM with PostgreSQL.
 */
import { eq, desc, count } from 'drizzle-orm';
import type { PaginationOptions } from '@/types/index.js';
import type { IReportsArchiveCommentsRepository } from './interface.js';
import type { DrizzleCommentReportArchive, DrizzleNewCommentReportArchive } from '@/database/schemas/postgres/reports-archive-comments.js';
import type { DatabaseClient } from '@database/postgres-connection.js';
import { commentReportsArchive } from '@/database/schemas/postgres/reports-archive-comments.js';

/**
 * ReportsArchiveCommentsRepositoryPostgres class for archived comment report CRUD operations
 */
export class ReportsArchiveCommentsRepositoryPostgres implements IReportsArchiveCommentsRepository<DrizzleCommentReportArchive, DrizzleNewCommentReportArchive> {
  private readonly db: DatabaseClient;
  
  constructor(db: DatabaseClient) {
    this.db = db;
  }

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
      .where(eq(commentReportsArchive.archive_id, archiveId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all archived comment reports with optional pagination
   *
   * @param options - Pagination options (optional limit)
   * @returns Array of archived comment reports
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleCommentReportArchive[]> {
    const { limit } = { limit: options?.limit };

    const query = this.db
      .select()
      .from(commentReportsArchive)
      .orderBy(desc(commentReportsArchive.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  /**
   * Finds all archived reports for comments on a specific video
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of archived reports for comments on the video
   */
  async findByVideoId(videoId: string, options?: PaginationOptions): Promise<DrizzleCommentReportArchive[]> {
    const { limit } = { limit: options?.limit ?? 20 };

    return this.db
      .select()
      .from(commentReportsArchive)
      .where(eq(commentReportsArchive.video_id, videoId))
      .orderBy(desc(commentReportsArchive.timestamp))
      .limit(limit);
  }

  /**
   * Finds all archived reports for a specific comment
   *
   * @param commentId - The comment identifier
   * @param options - Pagination options
   * @returns Array of archived reports for the comment
   */
  async findByCommentId(commentId: number, options?: PaginationOptions): Promise<DrizzleCommentReportArchive[]> {
    const { limit } = { limit: options?.limit ?? 20 };

    return this.db
      .select()
      .from(commentReportsArchive)
      .where(eq(commentReportsArchive.comment_id, commentId))
      .orderBy(desc(commentReportsArchive.timestamp))
      .limit(limit);
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
      .where(eq(commentReportsArchive.report_id, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Counts total archived comment reports
   *
   * @returns Total count of archived comment reports
   */
  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(commentReportsArchive);
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
      .where(eq(commentReportsArchive.archive_id, archiveId))
      .returning();
    return result.length > 0;
  }

  /**
   * Deletes all archived reports for a specific comment
   *
   * @param commentId - The comment identifier
   * @returns Number of deleted archive records
   */
  async deleteByCommentId(commentId: number): Promise<number> {
    const result = await this.db
      .delete(commentReportsArchive)
      .where(eq(commentReportsArchive.comment_id, commentId))
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
      .where(eq(commentReportsArchive.video_id, videoId))
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