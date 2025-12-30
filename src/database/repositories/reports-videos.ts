/**
 * Reports Videos Repository
 *
 * Provides data access methods for video report records using Drizzle ORM.
 */
import { eq, desc, count, gt } from 'drizzle-orm';
import { BaseRepository } from '@database/repositories/base.js';
import type { PaginationOptions } from '@/types/models.js';

/**
 * ReportsVideosRepository class for video report CRUD operations
 */
export class ReportsVideosRepository extends BaseRepository {
  constructor(db: any, private readonly videoReportsTable: any) {
    super(db);
  }
  /**
   * Finds a video report by its report_id
   *
   * @param reportId - The report primary key
   * @returns The report record or null if not found
   */
  async findById(reportId: number): Promise<any | null> {
    const result = await this.db
      .select()
      .from(this.videoReportsTable)
      .where(eq(this.videoReportsTable.report_id, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all video reports with optional pagination
   *
   * @param options - Pagination options (optional limit)
   * @returns Array of video reports
   */
  async findAll(options?: PaginationOptions): Promise<any[]> {
    const { limit } = this.getPaginationParams(options);

    const query = this.db.select().from(this.videoReportsTable).orderBy(desc(this.videoReportsTable.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  /**
   * Finds all reports for a specific video
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of reports for the video
   */
  async findByVideoId(videoId: string, options?: PaginationOptions): Promise<any[]> {
    const { limit } = this.getPaginationParamsWithDefault(options);

    return this.db
      .select()
      .from(this.videoReportsTable)
      .where(eq(this.videoReportsTable.video_id, videoId))
      .orderBy(desc(this.videoReportsTable.timestamp))
      .limit(limit);
  }

  /**
   * Counts total video reports
   *
   * @returns Total count of video reports
   */
  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(this.videoReportsTable);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new video report record
   *
   * @param data - Report data for insertion
   * @returns The created report record
   * @throws Error if insert fails to return a record
   */
  async create(data: any): Promise<any> {
    const result = await this.db.insert(this.videoReportsTable).values(data).returning();
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
      .delete(this.videoReportsTable)
      .where(eq(this.videoReportsTable.report_id, reportId))
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
      .delete(this.videoReportsTable)
      .where(eq(this.videoReportsTable.video_id, videoId))
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
      .select({ count: count() })
      .from(this.videoReportsTable)
      .where(gt(this.videoReportsTable.timestamp, timestamp));
    return result[0]?.count ?? 0;
  }

  /**
   * Deletes all video report records
   *
   * @returns Number of deleted reports
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(this.videoReportsTable).returning();
    return result.length;
  }

  /**
   * Creates multiple video report records in bulk
   *
   * @param data - Array of report data for insertion
   * @returns Array of created report records
   */
  async createMany(data: any[]): Promise<any[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(this.videoReportsTable).values(data).returning();
  }
}
