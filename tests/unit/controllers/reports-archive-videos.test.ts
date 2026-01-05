/**
 * ReportsArchiveVideosController Tests
 *
 * Tests for archived video report management endpoints.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ReportsArchiveVideosController } from '@controllers/reports-archive-videos.js';

// Mock services
const mockReportsService: Record<string, ReturnType<typeof vi.fn>> = {
  getArchivedVideoReports: vi.fn(),
  deleteArchivedVideoReport: vi.fn(),
};

describe('ReportsArchiveVideosController', () => {
  let controller: ReportsArchiveVideosController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    headers: Mock;
    type: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new ReportsArchiveVideosController(mockReportsService as any);

    mockRequest = {
      body: {},
      params: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
    };
  });

  describe('constructor', () => {
    it('should create a ReportsArchiveVideosController instance', () => {
      expect(controller).toBeInstanceOf(ReportsArchiveVideosController);
    });
  });

  describe('getAllArchives', () => {
    it('should get all archived video reports', async () => {
      const mockReports = [
        { archiveId: 1, videoId: 'vid1', reason: 'Spam', archivedAt: new Date() },
        { archiveId: 2, videoId: 'vid2', reason: 'Inappropriate', archivedAt: new Date() },
      ];
      mockReportsService.getArchivedVideoReports.mockResolvedValue(mockReports);

      await controller.getAllArchives(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.getArchivedVideoReports).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        reports: mockReports,
      });
    });

    it('should return empty array when no archived reports', async () => {
      mockReportsService.getArchivedVideoReports.mockResolvedValue([]);

      await controller.getAllArchives(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        reports: [],
      });
    });

    it('should return error on service failure', async () => {
      mockReportsService.getArchivedVideoReports.mockRejectedValue(new Error('Database error'));

      await controller.getAllArchives(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('deleteArchive', () => {
    it('should delete an archived video report', async () => {
      mockRequest.params = { archiveId: 1 };
      mockReportsService.deleteArchivedVideoReport.mockResolvedValue(undefined);

      await controller.deleteArchive(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.deleteArchivedVideoReport).toHaveBeenCalledWith(1);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on service failure', async () => {
      mockRequest.params = { archiveId: 1 };
      mockReportsService.deleteArchivedVideoReport.mockRejectedValue(new Error('Database error'));

      await controller.deleteArchive(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
