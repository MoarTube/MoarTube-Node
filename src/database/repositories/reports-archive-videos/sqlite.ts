/**
 * Reports Archive Videos Repository - SQLite Implementation
 *
 * Provides data access methods for archived video report records using Drizzle ORM with SQLite.
 */
import { eq, desc, count } from 'drizzle-orm';
import type { PaginationOptions } from '@/types/index.js';
import type { IReportsArchiveVideosRepository } from './interface.js';
import type {
  DrizzleVideoReportArchive,
  DrizzleNewVideoReportArchive,
} from '@/database/schemas/sqlite/reports-archive-videos.js';
import type { DatabaseClient } from '@database/sqlite-connection.js';
import { videoReportsArchive } from '@/database/schemas/sqlite/reports-archive-videos.js';

/**
 * ReportsArchiveVideosRepositorySQLite class for archived video report CRUD operations
 */
export class ReportsArchiveVideosRepositorySQLite implements IReportsArchiveVideosRepository<
  DrizzleVideoReportArchive,
  DrizzleNewVideoReportArchive
> {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

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
      .where(eq(videoReportsArchive.archive_id, archiveId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all archived video reports with optional pagination
   *
   * @param options - Pagination options (optional limit)
   * @returns Array of archived video reports
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleVideoReportArchive[]> {
    const { limit } = { limit: options?.limit };

    const query = this.db
      .select()
      .from(videoReportsArchive)
      .orderBy(desc(videoReportsArchive.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
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
    const { limit } = { limit: options?.limit ?? 20 };

    return this.db
      .select()
      .from(videoReportsArchive)
      .where(eq(videoReportsArchive.video_id, videoId))
      .orderBy(desc(videoReportsArchive.timestamp))
      .limit(limit);
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
      .where(eq(videoReportsArchive.report_id, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Counts total archived video reports
   *
   * @returns Total count of archived video reports
   */
  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(videoReportsArchive);
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
      .where(eq(videoReportsArchive.archive_id, archiveId))
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
      .where(eq(videoReportsArchive.video_id, videoId))
      .returning();
    return result.length;
  }

  /**
   * Deletes all archived video report records
   *
   * @returns Number of deleted archive records
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(videoReportsArchive).returning();
    return result.length;
  }

  /**
   * Creates multiple archived video report records in bulk
   *
   * @param data - Array of archive data for insertion
   * @returns Array of created archive records
   */
  async createMany(data: DrizzleNewVideoReportArchive[]): Promise<DrizzleVideoReportArchive[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(videoReportsArchive).values(data).returning();
  }
}
