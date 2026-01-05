/**
 * ReportsArchiveCommentsController Tests
 *
 * Tests for archived comment report management endpoints.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ReportsArchiveCommentsController } from '@controllers/reports-archive-comments.js';

// Mock services
const mockReportsService: Record<string, ReturnType<typeof vi.fn>> = {
  getArchivedCommentReports: vi.fn(),
  deleteArchivedCommentReport: vi.fn(),
};

describe('ReportsArchiveCommentsController', () => {
  let controller: ReportsArchiveCommentsController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    headers: Mock;
    type: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new ReportsArchiveCommentsController(mockReportsService as any);

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
    it('should create a ReportsArchiveCommentsController instance', () => {
      expect(controller).toBeInstanceOf(ReportsArchiveCommentsController);
    });
  });

  describe('getAllArchives', () => {
    it('should get all archived comment reports', async () => {
      const mockReports = [
        { archiveId: 1, commentId: 1, reason: 'Spam', archivedAt: new Date() },
        { archiveId: 2, commentId: 2, reason: 'Harassment', archivedAt: new Date() },
      ];
      mockReportsService.getArchivedCommentReports.mockResolvedValue(mockReports);

      await controller.getAllArchives(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.getArchivedCommentReports).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        reports: mockReports,
      });
    });

    it('should return empty array when no archived reports', async () => {
      mockReportsService.getArchivedCommentReports.mockResolvedValue([]);

      await controller.getAllArchives(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        reports: [],
      });
    });

    it('should return error on service failure', async () => {
      mockReportsService.getArchivedCommentReports.mockRejectedValue(new Error('Database error'));

      await controller.getAllArchives(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('deleteArchive', () => {
    it('should delete an archived comment report', async () => {
      mockRequest.params = { archiveId: 1 };
      mockReportsService.deleteArchivedCommentReport.mockResolvedValue(undefined);

      await controller.deleteArchive(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.deleteArchivedCommentReport).toHaveBeenCalledWith(1);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on service failure', async () => {
      mockRequest.params = { archiveId: 1 };
      mockReportsService.deleteArchivedCommentReport.mockRejectedValue(new Error('Database error'));

      await controller.deleteArchive(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
