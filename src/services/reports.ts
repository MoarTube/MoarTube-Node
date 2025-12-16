/**
 * Report Service
 *
 * Service layer for content reporting and moderation functionality.
 * Handles video and comment reports, archiving, and moderation workflows.
 */
import { BaseService } from './base.js';
import type { ILogger } from '../utils/logger.js';
import type {
  IReportService,
  CreateVideoReportInput,
  CreateCommentReportInput,
} from './interfaces.js';
import type { ReportsVideosRepository } from '../database/repositories/reports-videos.js';
import type { ReportsCommentsRepository } from '../database/repositories/reports-comments.js';
import type { ReportsArchiveVideosRepository } from '../database/repositories/reports-archive-videos.js';
import type { ReportsArchiveCommentsRepository } from '../database/repositories/reports-archive-comments.js';
import type {
  DrizzleVideoReport,
  DrizzleCommentReport,
  DrizzleVideoReportArchive,
  DrizzleCommentReportArchive,
  DrizzleNewVideoReport,
  DrizzleNewCommentReport,
  DrizzleNewVideoReportArchive,
  DrizzleNewCommentReportArchive,
} from '../database/schemas/index.js';
import type { PaginationOptions } from '../types/models.js';

/**
 * ReportService class
 *
 * Handles all content reporting and moderation:
 * - Creating video and comment reports
 * - Managing report queues
 * - Archiving handled reports
 * - Report statistics
 */
export class ReportsService extends BaseService implements IReportService {
  private readonly reportsVideosRepository: ReportsVideosRepository;
  private readonly reportsCommentsRepository: ReportsCommentsRepository;
  private readonly reportsArchiveVideosRepository: ReportsArchiveVideosRepository;
  private readonly reportsArchiveCommentsRepository: ReportsArchiveCommentsRepository;

  constructor(
    logger: ILogger,
    reportsVideosRepository: ReportsVideosRepository,
    reportsCommentsRepository: ReportsCommentsRepository,
    reportsArchiveVideosRepository: ReportsArchiveVideosRepository,
    reportsArchiveCommentsRepository: ReportsArchiveCommentsRepository
  ) {
    super('ReportsService', logger);
    this.reportsVideosRepository = reportsVideosRepository;
    this.reportsCommentsRepository = reportsCommentsRepository;
    this.reportsArchiveVideosRepository = reportsArchiveVideosRepository;
    this.reportsArchiveCommentsRepository = reportsArchiveCommentsRepository;
  }

  /**
   * Create a video report
   */
  async createVideoReport(data: CreateVideoReportInput): Promise<DrizzleVideoReport> {
    return this.withErrorLogging('createVideoReport', async () => {
      const timestamp = this.getCurrentTimestampMs();

      const reportData: DrizzleNewVideoReport = {
        timestamp,
        video_timestamp: data.videoTimestamp,
        video_id: data.videoId,
        email: data.email,
        type: data.type,
        message: data.message,
      };

      this.logger.info('Creating video report', {
        videoId: data.videoId,
        type: data.type,
      });

      return this.reportsVideosRepository.create(reportData);
    });
  }

  /**
   * Create a comment report
   */
  async createCommentReport(data: CreateCommentReportInput): Promise<DrizzleCommentReport> {
    return this.withErrorLogging('createCommentReport', async () => {
      const timestamp = this.getCurrentTimestampMs();

      const reportData: DrizzleNewCommentReport = {
        timestamp,
        comment_timestamp: data.commentTimestamp,
        video_id: data.videoId,
        comment_id: data.commentId,
        email: data.email,
        type: data.type,
        message: data.message,
      };

      this.logger.info('Creating comment report', {
        videoId: data.videoId,
        commentId: data.commentId,
        type: data.type,
      });

      return this.reportsCommentsRepository.create(reportData);
    });
  }

  /**
   * Get all video reports
   */
  async getVideoReports(options?: PaginationOptions): Promise<DrizzleVideoReport[]> {
    return this.reportsVideosRepository.findAll(options);
  }

  /**
   * Get all comment reports
   */
  async getCommentReports(options?: PaginationOptions): Promise<DrizzleCommentReport[]> {
    return this.reportsCommentsRepository.findAll(options);
  }

  /**
   * Get video reports for a specific video
   */
  async getVideoReportsForVideo(videoId: string): Promise<DrizzleVideoReport[]> {
    return this.reportsVideosRepository.findByVideoId(videoId);
  }

  /**
   * Get comment reports for a specific video
   */
  async getCommentReportsForVideo(videoId: string): Promise<DrizzleCommentReport[]> {
    return this.reportsCommentsRepository.findByVideoId(videoId);
  }

  /**
   * Archive a video report (mark as handled)
   */
  async archiveVideoReport(reportId: number): Promise<DrizzleVideoReportArchive> {
    return this.withErrorLogging('archiveVideoReport', async () => {
      const report = await this.reportsVideosRepository.findById(reportId);
      if (!report) {
        throw new Error(`Video report not found: ${String(reportId)}`);
      }

      // Create archive record
      const archiveData: DrizzleNewVideoReportArchive = {
        report_id: report.report_id,
        timestamp: report.timestamp,
        video_timestamp: report.video_timestamp,
        video_id: report.video_id,
        email: report.email,
        type: report.type,
        message: report.message,
      };

      const archived = await this.reportsArchiveVideosRepository.create(archiveData);

      // Delete original report
      await this.reportsVideosRepository.delete(reportId);

      this.logger.info('Video report archived', { reportId, videoId: report.video_id });

      return archived;
    });
  }

  /**
   * Archive a comment report (mark as handled)
   */
  async archiveCommentReport(reportId: number): Promise<DrizzleCommentReportArchive> {
    return this.withErrorLogging('archiveCommentReport', async () => {
      const report = await this.reportsCommentsRepository.findById(reportId);
      if (!report) {
        throw new Error(`Comment report not found: ${String(reportId)}`);
      }

      // Create archive record
      const archiveData: DrizzleNewCommentReportArchive = {
        report_id: report.report_id,
        timestamp: report.timestamp,
        comment_timestamp: report.comment_timestamp,
        video_id: report.video_id,
        comment_id: report.comment_id,
        email: report.email,
        type: report.type,
        message: report.message,
      };

      const archived = await this.reportsArchiveCommentsRepository.create(archiveData);

      // Delete original report
      await this.reportsCommentsRepository.delete(reportId);

      this.logger.info('Comment report archived', {
        reportId,
        videoId: report.video_id,
        commentId: report.comment_id,
      });

      return archived;
    });
  }

  /**
   * Delete a video report
   */
  async deleteVideoReport(reportId: number): Promise<boolean> {
    return this.reportsVideosRepository.delete(reportId);
  }

  /**
   * Delete a comment report
   */
  async deleteCommentReport(reportId: number): Promise<boolean> {
    return this.reportsCommentsRepository.delete(reportId);
  }

  /**
   * Get archived video reports
   */
  async getArchivedVideoReports(options?: PaginationOptions): Promise<DrizzleVideoReportArchive[]> {
    return this.reportsArchiveVideosRepository.findAll(options);
  }

  /**
   * Get archived comment reports
   */
  async getArchivedCommentReports(
    options?: PaginationOptions
  ): Promise<DrizzleCommentReportArchive[]> {
    return this.reportsArchiveCommentsRepository.findAll(options);
  }

  /**
   * Delete archived video report
   */
  async deleteArchivedVideoReport(archiveId: number): Promise<boolean> {
    return this.reportsArchiveVideosRepository.delete(archiveId);
  }

  /**
   * Delete archived comment report
   */
  async deleteArchivedCommentReport(archiveId: number): Promise<boolean> {
    return this.reportsArchiveCommentsRepository.delete(archiveId);
  }

  /**
   * Count total video reports
   */
  async countVideoReports(): Promise<number> {
    return this.reportsVideosRepository.getCount();
  }

  /**
   * Count total comment reports
   */
  async countCommentReports(): Promise<number> {
    return this.reportsCommentsRepository.getCount();
  }

  /**
   * Count video reports newer than timestamp
   */
  async countVideoReportsNewerThan(timestamp: number): Promise<number> {
    return this.reportsVideosRepository.countNewerThan(timestamp);
  }

  /**
   * Count comment reports newer than timestamp
   */
  async countCommentReportsNewerThan(timestamp: number): Promise<number> {
    return this.reportsCommentsRepository.countNewerThan(timestamp);
  }

  /**
   * Get report summary statistics
   */
  async getReportStats(): Promise<{
    videoReports: number;
    commentReports: number;
    archivedVideoReports: number;
    archivedCommentReports: number;
  }> {
    const [videoReports, commentReports, archivedVideoReports, archivedCommentReports] =
      await Promise.all([
        this.countVideoReports(),
        this.countCommentReports(),
        this.reportsArchiveVideosRepository.getCount(),
        this.reportsArchiveCommentsRepository.getCount(),
      ]);

    return {
      videoReports,
      commentReports,
      archivedVideoReports,
      archivedCommentReports,
    };
  }
}
