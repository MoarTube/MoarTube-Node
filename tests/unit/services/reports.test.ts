/**
 * Reports Service Tests
 *
 * Tests for the ReportsService class that handles content reporting
 * and moderation functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReportsService } from '@/services/reports.js';
import type { Logger } from '@/utils/logger.js';
import type {
  ReportsVideosRepository,
  ReportsCommentsRepository,
  ReportsArchiveVideosRepository,
  ReportsArchiveCommentsRepository,
} from '@/database/repositories/index.js';
import type { CreateVideoReportInput, CreateCommentReportInput } from '@/services/interfaces.js';

describe('ReportsService', () => {
  let service: ReportsService;
  let mockLogger: Logger;
  let mockReportsVideosRepository: ReportsVideosRepository;
  let mockReportsCommentsRepository: ReportsCommentsRepository;
  let mockReportsArchiveVideosRepository: ReportsArchiveVideosRepository;
  let mockReportsArchiveCommentsRepository: ReportsArchiveCommentsRepository;

  const mockVideoReport = {
    report_id: 1,
    timestamp: 1700000000000,
    video_timestamp: 1699999999000,
    video_id: 'video123',
    email: 'reporter@example.com',
    type: 'inappropriate',
    message: 'Inappropriate content',
  };

  const mockCommentReport = {
    report_id: 1,
    timestamp: 1700000000000,
    comment_timestamp: 1699999999000,
    video_id: 'video123',
    comment_id: 'comment123',
    email: 'reporter@example.com',
    type: 'spam',
    message: 'This is spam',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockReportsVideosRepository = {
      create: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      findByVideoId: vi.fn(),
      delete: vi.fn(),
      getCount: vi.fn(),
      countNewerThan: vi.fn(),
    } as unknown as ReportsVideosRepository;

    mockReportsCommentsRepository = {
      create: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      findByVideoId: vi.fn(),
      delete: vi.fn(),
      getCount: vi.fn(),
      countNewerThan: vi.fn(),
    } as unknown as ReportsCommentsRepository;

    mockReportsArchiveVideosRepository = {
      create: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
      getCount: vi.fn(),
    } as unknown as ReportsArchiveVideosRepository;

    mockReportsArchiveCommentsRepository = {
      create: vi.fn(),
      findAll: vi.fn(),
      delete: vi.fn(),
      getCount: vi.fn(),
    } as unknown as ReportsArchiveCommentsRepository;

    service = new ReportsService(
      mockLogger,
      mockReportsVideosRepository,
      mockReportsCommentsRepository,
      mockReportsArchiveVideosRepository,
      mockReportsArchiveCommentsRepository
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a ReportsService instance', () => {
      expect(service).toBeInstanceOf(ReportsService);
    });
  });

  describe('createVideoReport', () => {
    it('should create a video report with timestamp', async () => {
      const input: CreateVideoReportInput = {
        videoId: 'video123',
        videoTimestamp: 1699999999000,
        email: 'reporter@example.com',
        type: 'inappropriate',
        message: 'Inappropriate content',
      };

      vi.mocked(mockReportsVideosRepository.create).mockResolvedValue(mockVideoReport);

      const result = await service.createVideoReport(input);

      expect(result).toEqual(mockVideoReport);
      expect(mockReportsVideosRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          video_id: 'video123',
          video_timestamp: 1699999999000,
          email: 'reporter@example.com',
          type: 'inappropriate',
          message: 'Inappropriate content',
          timestamp: expect.any(Number),
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Creating video report', {
        videoId: 'video123',
        type: 'inappropriate',
      });
    });

    it('should log and rethrow errors', async () => {
      const input: CreateVideoReportInput = {
        videoId: 'video123',
        videoTimestamp: 1699999999000,
        email: 'reporter@example.com',
        type: 'inappropriate',
        message: 'Test',
      };

      const error = new Error('Database error');
      vi.mocked(mockReportsVideosRepository.create).mockRejectedValue(error);

      await expect(service.createVideoReport(input)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createCommentReport', () => {
    it('should create a comment report with timestamp', async () => {
      const input: CreateCommentReportInput = {
        videoId: 'video123',
        commentId: 'comment123',
        commentTimestamp: 1699999999000,
        email: 'reporter@example.com',
        type: 'spam',
        message: 'This is spam',
      };

      vi.mocked(mockReportsCommentsRepository.create).mockResolvedValue(mockCommentReport);

      const result = await service.createCommentReport(input);

      expect(result).toEqual(mockCommentReport);
      expect(mockReportsCommentsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          video_id: 'video123',
          comment_id: 'comment123',
          comment_timestamp: 1699999999000,
          email: 'reporter@example.com',
          type: 'spam',
          message: 'This is spam',
          timestamp: expect.any(Number),
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Creating comment report', {
        videoId: 'video123',
        commentId: 'comment123',
        type: 'spam',
      });
    });
  });

  describe('getVideoReports', () => {
    it('should return all video reports', async () => {
      const reports = [mockVideoReport];
      vi.mocked(mockReportsVideosRepository.findAll).mockResolvedValue(reports);

      const result = await service.getVideoReports();

      expect(result).toEqual(reports);
      expect(mockReportsVideosRepository.findAll).toHaveBeenCalledWith(undefined);
    });

    it('should accept pagination options', async () => {
      const options = { limit: 10, offset: 0 };
      vi.mocked(mockReportsVideosRepository.findAll).mockResolvedValue([]);

      await service.getVideoReports(options);

      expect(mockReportsVideosRepository.findAll).toHaveBeenCalledWith(options);
    });
  });

  describe('getCommentReports', () => {
    it('should return all comment reports', async () => {
      const reports = [mockCommentReport];
      vi.mocked(mockReportsCommentsRepository.findAll).mockResolvedValue(reports);

      const result = await service.getCommentReports();

      expect(result).toEqual(reports);
    });
  });

  describe('getVideoReportsForVideo', () => {
    it('should return video reports for a specific video', async () => {
      vi.mocked(mockReportsVideosRepository.findByVideoId).mockResolvedValue([mockVideoReport]);

      const result = await service.getVideoReportsForVideo('video123');

      expect(result).toEqual([mockVideoReport]);
      expect(mockReportsVideosRepository.findByVideoId).toHaveBeenCalledWith('video123');
    });
  });

  describe('getCommentReportsForVideo', () => {
    it('should return comment reports for a specific video', async () => {
      vi.mocked(mockReportsCommentsRepository.findByVideoId).mockResolvedValue([mockCommentReport]);

      const result = await service.getCommentReportsForVideo('video123');

      expect(result).toEqual([mockCommentReport]);
      expect(mockReportsCommentsRepository.findByVideoId).toHaveBeenCalledWith('video123');
    });
  });

  describe('archiveVideoReport', () => {
    it('should archive a video report', async () => {
      vi.mocked(mockReportsVideosRepository.findById).mockResolvedValue(mockVideoReport);
      vi.mocked(mockReportsArchiveVideosRepository.create).mockResolvedValue({
        ...mockVideoReport,
        archive_id: 1,
      });
      vi.mocked(mockReportsVideosRepository.delete).mockResolvedValue(true);

      const result = await service.archiveVideoReport(1);

      expect(result).toEqual(expect.objectContaining({ report_id: 1 }));
      expect(mockReportsArchiveVideosRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          report_id: 1,
          video_id: 'video123',
        })
      );
      expect(mockReportsVideosRepository.delete).toHaveBeenCalledWith(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Video report archived', {
        reportId: 1,
        videoId: 'video123',
      });
    });

    it('should throw error when report not found', async () => {
      vi.mocked(mockReportsVideosRepository.findById).mockResolvedValue(null);

      await expect(service.archiveVideoReport(999)).rejects.toThrow('Video report not found: 999');
    });
  });

  describe('archiveCommentReport', () => {
    it('should archive a comment report', async () => {
      vi.mocked(mockReportsCommentsRepository.findById).mockResolvedValue(mockCommentReport);
      vi.mocked(mockReportsArchiveCommentsRepository.create).mockResolvedValue({
        ...mockCommentReport,
        archive_id: 1,
      });
      vi.mocked(mockReportsCommentsRepository.delete).mockResolvedValue(true);

      const result = await service.archiveCommentReport(1);

      expect(result).toEqual(expect.objectContaining({ report_id: 1 }));
      expect(mockReportsArchiveCommentsRepository.create).toHaveBeenCalled();
      expect(mockReportsCommentsRepository.delete).toHaveBeenCalledWith(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Comment report archived', {
        reportId: 1,
        videoId: 'video123',
        commentId: 'comment123',
      });
    });

    it('should throw error when report not found', async () => {
      vi.mocked(mockReportsCommentsRepository.findById).mockResolvedValue(null);

      await expect(service.archiveCommentReport(999)).rejects.toThrow(
        'Comment report not found: 999'
      );
    });
  });

  describe('deleteVideoReport', () => {
    it('should delete a video report', async () => {
      vi.mocked(mockReportsVideosRepository.delete).mockResolvedValue(true);

      const result = await service.deleteVideoReport(1);

      expect(result).toBe(true);
      expect(mockReportsVideosRepository.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('deleteCommentReport', () => {
    it('should delete a comment report', async () => {
      vi.mocked(mockReportsCommentsRepository.delete).mockResolvedValue(true);

      const result = await service.deleteCommentReport(1);

      expect(result).toBe(true);
      expect(mockReportsCommentsRepository.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('getArchivedVideoReports', () => {
    it('should return archived video reports', async () => {
      const archived = [{ ...mockVideoReport, archive_id: 1 }];
      vi.mocked(mockReportsArchiveVideosRepository.findAll).mockResolvedValue(archived);

      const result = await service.getArchivedVideoReports();

      expect(result).toEqual(archived);
    });
  });

  describe('getArchivedCommentReports', () => {
    it('should return archived comment reports', async () => {
      const archived = [{ ...mockCommentReport, archive_id: 1 }];
      vi.mocked(mockReportsArchiveCommentsRepository.findAll).mockResolvedValue(archived);

      const result = await service.getArchivedCommentReports();

      expect(result).toEqual(archived);
    });
  });

  describe('deleteArchivedVideoReport', () => {
    it('should delete an archived video report', async () => {
      vi.mocked(mockReportsArchiveVideosRepository.delete).mockResolvedValue(true);

      const result = await service.deleteArchivedVideoReport(1);

      expect(result).toBe(true);
      expect(mockReportsArchiveVideosRepository.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('deleteArchivedCommentReport', () => {
    it('should delete an archived comment report', async () => {
      vi.mocked(mockReportsArchiveCommentsRepository.delete).mockResolvedValue(true);

      const result = await service.deleteArchivedCommentReport(1);

      expect(result).toBe(true);
      expect(mockReportsArchiveCommentsRepository.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('countVideoReports', () => {
    it('should return count of video reports', async () => {
      vi.mocked(mockReportsVideosRepository.getCount).mockResolvedValue(5);

      const result = await service.countVideoReports();

      expect(result).toBe(5);
    });
  });

  describe('countCommentReports', () => {
    it('should return count of comment reports', async () => {
      vi.mocked(mockReportsCommentsRepository.getCount).mockResolvedValue(3);

      const result = await service.countCommentReports();

      expect(result).toBe(3);
    });
  });

  describe('countVideoReportsNewerThan', () => {
    it('should return count of video reports newer than timestamp', async () => {
      vi.mocked(mockReportsVideosRepository.countNewerThan).mockResolvedValue(2);

      const result = await service.countVideoReportsNewerThan(1699999999000);

      expect(result).toBe(2);
      expect(mockReportsVideosRepository.countNewerThan).toHaveBeenCalledWith(1699999999000);
    });
  });

  describe('countCommentReportsNewerThan', () => {
    it('should return count of comment reports newer than timestamp', async () => {
      vi.mocked(mockReportsCommentsRepository.countNewerThan).mockResolvedValue(1);

      const result = await service.countCommentReportsNewerThan(1699999999000);

      expect(result).toBe(1);
      expect(mockReportsCommentsRepository.countNewerThan).toHaveBeenCalledWith(1699999999000);
    });
  });

  describe('getReportStats', () => {
    it('should return report statistics', async () => {
      vi.mocked(mockReportsVideosRepository.getCount).mockResolvedValue(5);
      vi.mocked(mockReportsCommentsRepository.getCount).mockResolvedValue(3);
      vi.mocked(mockReportsArchiveVideosRepository.getCount).mockResolvedValue(10);
      vi.mocked(mockReportsArchiveCommentsRepository.getCount).mockResolvedValue(8);

      const result = await service.getReportStats();

      expect(result).toEqual({
        videoReports: 5,
        commentReports: 3,
        archivedVideoReports: 10,
        archivedCommentReports: 8,
      });
    });

    it('should handle zero counts', async () => {
      vi.mocked(mockReportsVideosRepository.getCount).mockResolvedValue(0);
      vi.mocked(mockReportsCommentsRepository.getCount).mockResolvedValue(0);
      vi.mocked(mockReportsArchiveVideosRepository.getCount).mockResolvedValue(0);
      vi.mocked(mockReportsArchiveCommentsRepository.getCount).mockResolvedValue(0);

      const result = await service.getReportStats();

      expect(result).toEqual({
        videoReports: 0,
        commentReports: 0,
        archivedVideoReports: 0,
        archivedCommentReports: 0,
      });
    });
  });
});
