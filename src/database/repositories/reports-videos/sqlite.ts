import { eq, desc, count, gt } from 'drizzle-orm';
import type { PaginationOptions } from '@/types/index.js';
import type { IReportsVideosRepository } from './interface.js';
import type {
  DrizzleVideoReport,
  DrizzleNewVideoReport,
} from '@database/schemas/sqlite/reports-videos.js';
import type { DatabaseClient } from '@database/sqlite-connection.js';
import { videoReports } from '@database/schemas/sqlite/index.js';

export class ReportsVideosRepositorySQLite implements IReportsVideosRepository<
  DrizzleVideoReport,
  DrizzleNewVideoReport
> {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async findById(reportId: number): Promise<DrizzleVideoReport | null> {
    const result = await this.db
      .select()
      .from(videoReports)
      .where(eq(videoReports.report_id, reportId))
      .limit(1);
    return result[0] ?? null;
  }

  async findAll(options?: PaginationOptions): Promise<DrizzleVideoReport[]> {
    const { limit } = { limit: options?.limit };

    const query = this.db.select().from(videoReports).orderBy(desc(videoReports.timestamp));

    if (limit !== undefined) {
      return query.limit(limit);
    }

    return query;
  }

  async findByVideoId(videoId: string, options?: PaginationOptions): Promise<DrizzleVideoReport[]> {
    const { limit } = { limit: options?.limit ?? 20 };

    return this.db
      .select()
      .from(videoReports)
      .where(eq(videoReports.video_id, videoId))
      .orderBy(desc(videoReports.timestamp))
      .limit(limit);
  }

  async getCount(): Promise<number> {
    const result = await this.db.select({ count: count() }).from(videoReports);
    return result[0]?.count ?? 0;
  }

  async create(data: DrizzleNewVideoReport): Promise<DrizzleVideoReport> {
    const result = await this.db.insert(videoReports).values(data).returning();
    if (!result[0]) {
      throw new Error('Failed to create video report record');
    }
    return result[0];
  }

  async delete(reportId: number): Promise<boolean> {
    const result = await this.db
      .delete(videoReports)
      .where(eq(videoReports.report_id, reportId))
      .returning();
    return result.length > 0;
  }

  async deleteByVideoId(videoId: string): Promise<number> {
    const result = await this.db
      .delete(videoReports)
      .where(eq(videoReports.video_id, videoId))
      .returning();
    return result.length;
  }

  async countNewerThan(timestamp: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(videoReports)
      .where(gt(videoReports.timestamp, timestamp));
    return result[0]?.count ?? 0;
  }

  async deleteAll(): Promise<number> {
    const result = await this.db.delete(videoReports).returning();
    return result.length;
  }

  async createMany(data: DrizzleNewVideoReport[]): Promise<DrizzleVideoReport[]> {
    if (data.length === 0) {
      return [];
    }
    return this.db.insert(videoReports).values(data).returning();
  }
}
