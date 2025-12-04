/**
 * Report Service
 *
 * Service layer for content reporting and moderation functionality.
 * Handles video and comment reports, archiving, and moderation workflows.
 */
import { BaseService, type ServiceOptions } from './base.js';
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
} from '../database/schema/index.js';
import type { PaginationOptions } from '../types/models.js';

/**
 * Report service dependencies
 */
export interface ReportServiceDependencies {
  videoReportRepository: ReportsVideosRepository;
  commentReportRepository: ReportsCommentsRepository;
  videoReportsArchiveRepository: ReportsArchiveVideosRepository;
  commentReportsArchiveRepository: ReportsArchiveCommentsRepository;
}

/**
 * ReportService class
 *
 * Handles all content reporting and moderation:
 * - Creating video and comment reports
 * - Managing report queues
 * - Archiving handled reports
 * - Report statistics
 */
export class ReportService extends BaseService implements IReportService {
  private readonly videoReportRepository: ReportsVideosRepository;
  private readonly commentReportRepository: ReportsCommentsRepository;
  private readonly videoReportsArchiveRepository: ReportsArchiveVideosRepository;
  private readonly commentReportsArchiveRepository: ReportsArchiveCommentsRepository;

  constructor(
    videoReportRepository: ReportsVideosRepository,
    commentReportRepository: ReportsCommentsRepository,
    videoReportsArchiveRepository: ReportsArchiveVideosRepository,
    commentReportsArchiveRepository: ReportsArchiveCommentsRepository,
    options?: ServiceOptions
  ) {
    super('ReportService', options);
    this.videoReportRepository = videoReportRepository;
    this.commentReportRepository = commentReportRepository;
    this.videoReportsArchiveRepository = videoReportsArchiveRepository;
    this.commentReportsArchiveRepository = commentReportsArchiveRepository;
  }

  /**
   * Create a video report
   */
  async createVideoReport(data: CreateVideoReportInput): Promise<DrizzleVideoReport> {
    return this.withErrorLogging('createVideoReport', async () => {
      const timestamp = this.getCurrentTimestamp();

      const reportData: DrizzleNewVideoReport = {
        timestamp,
        videoTimestamp: data.videoTimestamp,
        videoId: data.videoId,
        email: data.email,
        type: data.type,
        message: data.message,
      };

      this.logger.info('Creating video report', {
        videoId: data.videoId,
        type: data.type,
      });

      return this.videoReportRepository.create(reportData);
    });
  }

  /**
   * Create a comment report
   */
  async createCommentReport(data: CreateCommentReportInput): Promise<DrizzleCommentReport> {
    return this.withErrorLogging('createCommentReport', async () => {
      const timestamp = this.getCurrentTimestamp();

      const reportData: DrizzleNewCommentReport = {
        timestamp,
        commentTimestamp: data.commentTimestamp,
        videoId: data.videoId,
        commentId: data.commentId,
        email: data.email,
        type: data.type,
        message: data.message,
      };

      this.logger.info('Creating comment report', {
        videoId: data.videoId,
        commentId: data.commentId,
        type: data.type,
      });

      return this.commentReportRepository.create(reportData);
    });
  }

  /**
   * Get all video reports
   */
  async getVideoReports(options?: PaginationOptions): Promise<DrizzleVideoReport[]> {
    return this.videoReportRepository.findAll(options);
  }

  /**
   * Get all comment reports
   */
  async getCommentReports(options?: PaginationOptions): Promise<DrizzleCommentReport[]> {
    return this.commentReportRepository.findAll(options);
  }

  /**
   * Get video reports for a specific video
   */
  async getVideoReportsForVideo(videoId: string): Promise<DrizzleVideoReport[]> {
    return this.videoReportRepository.findByVideoId(videoId);
  }

  /**
   * Get comment reports for a specific video
   */
  async getCommentReportsForVideo(videoId: string): Promise<DrizzleCommentReport[]> {
    return this.commentReportRepository.findByVideoId(videoId);
  }

  /**
   * Archive a video report (mark as handled)
   */
  async archiveVideoReport(reportId: number): Promise<DrizzleVideoReportArchive> {
    return this.withErrorLogging('archiveVideoReport', async () => {
      const report = await this.videoReportRepository.findById(reportId);
      if (!report) {
        throw new Error(`Video report not found: ${String(reportId)}`);
      }

      // Create archive record
      const archiveData: DrizzleNewVideoReportArchive = {
        reportId: report.reportId,
        timestamp: report.timestamp,
        videoTimestamp: report.videoTimestamp,
        videoId: report.videoId,
        email: report.email,
        type: report.type,
        message: report.message,
      };

      const archived = await this.videoReportsArchiveRepository.create(archiveData);

      // Delete original report
      await this.videoReportRepository.delete(reportId);

      this.logger.info('Video report archived', { reportId, videoId: report.videoId });

      return archived;
    });
  }

  /**
   * Archive a comment report (mark as handled)
   */
  async archiveCommentReport(reportId: number): Promise<DrizzleCommentReportArchive> {
    return this.withErrorLogging('archiveCommentReport', async () => {
      const report = await this.commentReportRepository.findById(reportId);
      if (!report) {
        throw new Error(`Comment report not found: ${String(reportId)}`);
      }

      // Create archive record
      const archiveData: DrizzleNewCommentReportArchive = {
        reportId: report.reportId,
        timestamp: report.timestamp,
        commentTimestamp: report.commentTimestamp,
        videoId: report.videoId,
        commentId: report.commentId,
        email: report.email,
        type: report.type,
        message: report.message,
      };

      const archived = await this.commentReportsArchiveRepository.create(archiveData);

      // Delete original report
      await this.commentReportRepository.delete(reportId);

      this.logger.info('Comment report archived', {
        reportId,
        videoId: report.videoId,
        commentId: report.commentId,
      });

      return archived;
    });
  }

  /**
   * Delete a video report
   */
  async deleteVideoReport(reportId: number): Promise<boolean> {
    return this.videoReportRepository.delete(reportId);
  }

  /**
   * Delete a comment report
   */
  async deleteCommentReport(reportId: number): Promise<boolean> {
    return this.commentReportRepository.delete(reportId);
  }

  /**
   * Get archived video reports
   */
  async getArchivedVideoReports(options?: PaginationOptions): Promise<DrizzleVideoReportArchive[]> {
    return this.videoReportsArchiveRepository.findAll(options);
  }

  /**
   * Get archived comment reports
   */
  async getArchivedCommentReports(
    options?: PaginationOptions
  ): Promise<DrizzleCommentReportArchive[]> {
    return this.commentReportsArchiveRepository.findAll(options);
  }

  /**
   * Delete archived video report
   */
  async deleteArchivedVideoReport(archiveId: number): Promise<boolean> {
    return this.videoReportsArchiveRepository.delete(archiveId);
  }

  /**
   * Delete archived comment report
   */
  async deleteArchivedCommentReport(archiveId: number): Promise<boolean> {
    return this.commentReportsArchiveRepository.delete(archiveId);
  }

  /**
   * Count total video reports
   */
  async countVideoReports(): Promise<number> {
    return this.videoReportRepository.getCount();
  }

  /**
   * Count total comment reports
   */
  async countCommentReports(): Promise<number> {
    return this.commentReportRepository.getCount();
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
        this.videoReportsArchiveRepository.getCount(),
        this.commentReportsArchiveRepository.getCount(),
      ]);

    return {
      videoReports,
      commentReports,
      archivedVideoReports,
      archivedCommentReports,
    };
  }
}
