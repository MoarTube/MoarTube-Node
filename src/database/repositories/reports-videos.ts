/**
 * Reports Videos Repository
 *
 * Provides data access methods for video report records using Drizzle ORM.
 */
import { eq, desc, sql, gt } from 'drizzle-orm';
import type { DrizzleVideoReport, DrizzleNewVideoReport } from '../schema';
import { videoReports } from '../schema';
import { BaseRepository } from './base';
import type { PaginationOptions } from '../../types/models';

/**
 * ReportsVideosRepository class for video report CRUD operations
 */
export class ReportsVideosRepository extends BaseRepository {
  /**
   * Finds a video report by its report_id
   *
   * @param reportId - The report primary key
   * @returns The report record or null if not found
   */
  async findById(reportId: number): Promise<DrizzleVideoReport | null> {
    const result = await this.db
      .select()
      .from(videoReports)
      .where(eq(videoReports.reportId, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all video reports with pagination
   *
   * @param options - Pagination options
   * @returns Array of video reports
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleVideoReport[]> {
    const { limit, offset } = this.getPaginationParams(options);

    return this.db
      .select()
      .from(videoReports)
      .orderBy(desc(videoReports.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Finds all reports for a specific video
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of reports for the video
   */
  async findByVideoId(videoId: string, options?: PaginationOptions): Promise<DrizzleVideoReport[]> {
    const { limit, offset } = this.getPaginationParams(options);

    return this.db
      .select()
      .from(videoReports)
      .where(eq(videoReports.videoId, videoId))
      .orderBy(desc(videoReports.timestamp))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Counts total video reports
   *
   * @returns Total count of video reports
   */
  async count(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(videoReports);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new video report record
   *
   * @param data - Report data for insertion
   * @returns The created report record
   * @throws Error if insert fails to return a record
   */
  async create(data: DrizzleNewVideoReport): Promise<DrizzleVideoReport> {
    const result = await this.db.insert(videoReports).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create video report record');
    }
    return result[0];
  }

  /**
   * Deletes a video report record
   *
   * @param reportId - The report primary key
   * @returns true if deleted, false if not found
   */
  async delete(reportId: number): Promise<boolean> {
    const result = await this.db
      .delete(videoReports)
      .where(eq(videoReports.reportId, reportId))
      .returning();
    return result.length > 0;
  }

  /**
   * Deletes all reports for a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted reports
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .delete(videoReports)
      .where(eq(videoReports.videoId, videoId))
      .returning();
    return result.length;
  }

  /**
   * Counts video reports newer than a given timestamp
   *
   * @param timestamp - The timestamp to compare against
   * @returns Count of video reports newer than the timestamp
   */
  async countNewerThan(timestamp: number): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(videoReports)
      .where(gt(videoReports.timestamp, timestamp));
    return result[0]?.count ?? 0;
  }
}
