import { eq, desc, count, gt } from 'drizzle-orm';
import type { PaginationOptions } from '@/types/index.js';
import type { IReportsVideosRepository } from './interface.js';
import type { DrizzleVideoReport, DrizzleNewVideoReport } from '@database/schemas/postgres/reports-videos.js';
import type { DatabaseClient } from '@database/postgres-connection.js';
import { videoReports } from '@database/schemas/postgres/index.js';

/**
 * PostgreSQL implementation of the Reports Videos Repository
 */
export class ReportsVideosRepositoryPostgres
  implements IReportsVideosRepository<DrizzleVideoReport, DrizzleNewVideoReport>
{
  private readonly db: DatabaseClient;
  
  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Finds a video report by its report_id
   */
  async findById(reportId: number): Promise<DrizzleVideoReport | null> {
    const result = await this.db
      .select()
      .from(videoReports)
      .where(eq(videoReports.report_id, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Finds all video reports with optional pagination
   */
  async findAll(options?: PaginationOptions): Promise<DrizzleVideoReport[]> {
    const { limit } = { limit: options?.limit };

    const query = this.db
      .select()
      .from(videoReports)
      .orderBy(desc(videoReports.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  /**
   * Finds all reports for a specific video
   */
  async findByVideoId(videoId: string, options?: PaginationOptions): Promise<DrizzleVideoReport[]> {
    const { limit } = { limit: options?.limit ?? 20 };

    return this.db
      .select()
      .from(videoReports)
      .where(eq(videoReports.video_id, videoId))
      .orderBy(desc(videoReports.timestamp))
      .limit(limit);
  }

  /**
   * Counts total video reports
   */
  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(videoReports);
    return result[0]?.count ?? 0;
  }

  /**
   * Creates a new video report record
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
   */
  async delete(reportId: number): Promise<boolean> {
    const result = await this.db
      .delete(videoReports)
      .where(eq(videoReports.report_id, reportId))
      .returning();
    return result.length > 0;
  }

  /**
   * Deletes all reports for a video
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .delete(videoReports)
      .where(eq(videoReports.video_id, videoId))
      .returning();
    return result.length;
  }

  /**
   * Counts video reports newer than a given timestamp
   */
  async countNewerThan(timestamp: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(videoReports)
      .where(gt(videoReports.timestamp, timestamp));
    return result[0]?.count ?? 0;
  }

  /**
   * Deletes all video report records
   */
  async deleteAll(): Promise<number> {
    const result = await this.db.delete(videoReports).returning();
    return result.length;
  }

  /**
   * Creates multiple video report records in bulk
   */
  async createMany(data: DrizzleNewVideoReport[]): Promise<DrizzleVideoReport[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(videoReports).values(data).returning();
  }
}
