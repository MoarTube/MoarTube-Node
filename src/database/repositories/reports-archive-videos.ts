/**
 * Reports Archive Videos Repository
 *
 * Provides data access methods for archived video report records using Drizzle ORM.
 */
import { eq, desc, sql } from 'drizzle-orm';
import type { DrizzleVideoReportArchive, DrizzleNewVideoReportArchive } from '../schema';
import { videoReportsArchive } from '../schema';
import { BaseRepository } from './base';
import type { PaginationOptions } from '../../types/models';

/**
 * ReportsArchiveVideosRepository class for archived video report CRUD operations
 */
export class ReportsArchiveVideosRepository extends BaseRepository {
  /**
   * Finds an archived video report by its archive_id
   *
   * @param archiveId - The archive primary key
   * @returns The archive record or null if not found
   */
  async findById(archiveId: number): Promise<DrizzleVideoReportArchive | null> {
    const result = await this.db
      .select()
      .from(videoReportsArchive)
      .where(eq(videoReportsArchive.archiveId, archiveId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all archived video reports with pagination
   *
   * @param options - Pagination options
   * @returns Array of archived video reports
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleVideoReportArchive[]> {
    const { limit, offset } = this.getPaginationParams(options);

    return this.db
      .select()
      .from(videoReportsArchive)
      .orderBy(desc(videoReportsArchive.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Finds all archived reports for a specific video
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of archived reports for the video
   */
  async findByVideoId(
    videoId: string,
    options?: PaginationOptions
  ): Promise<DrizzleVideoReportArchive[]> {
    const { limit, offset } = this.getPaginationParams(options);

    return this.db
      .select()
      .from(videoReportsArchive)
      .where(eq(videoReportsArchive.videoId, videoId))
      .orderBy(desc(videoReportsArchive.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Finds an archived report by its original report_id
   *
   * @param reportId - The original report ID
   * @returns The archive record or null if not found
   */
  async findByReportId(reportId: number): Promise<DrizzleVideoReportArchive | null> {
    const result = await this.db
      .select()
      .from(videoReportsArchive)
      .where(eq(videoReportsArchive.reportId, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Counts total archived video reports
   *
   * @returns Total count of archived video reports
   */
  async count(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(videoReportsArchive);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new archived video report record
   *
   * @param data - Archive data for insertion
   * @returns The created archive record
   * @throws Error if insert fails to return a record
   */
  async create(data: DrizzleNewVideoReportArchive): Promise<DrizzleVideoReportArchive> {
    const result = await this.db.insert(videoReportsArchive).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create video report archive record');
    }
    return result[0];
  }

  /**
   * Deletes an archived video report record
   *
   * @param archiveId - The archive primary key
   * @returns true if deleted, false if not found
   */
  async delete(archiveId: number): Promise<boolean> {
    const result = await this.db
      .delete(videoReportsArchive)
      .where(eq(videoReportsArchive.archiveId, archiveId))
      .returning();
    return result.length > 0;
  }

  /**
   * Deletes all archived reports for a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted archive records
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .delete(videoReportsArchive)
      .where(eq(videoReportsArchive.videoId, videoId))
      .returning();
    return result.length;
  }
}
