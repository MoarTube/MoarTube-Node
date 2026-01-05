/**
 * ReportsCommentsController Tests
 *
 * Tests for comment report management endpoints.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ReportsCommentsController } from '@controllers/reports-comments.js';

// Mock services
const mockReportsService: Record<string, ReturnType<typeof vi.fn>> = {
  getCommentReports: vi.fn(),
  archiveCommentReport: vi.fn(),
  deleteCommentReport: vi.fn(),
};

describe('ReportsCommentsController', () => {
  let controller: ReportsCommentsController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    headers: Mock;
    type: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new ReportsCommentsController(mockReportsService as any);

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
    it('should create a ReportsCommentsController instance', () => {
      expect(controller).toBeInstanceOf(ReportsCommentsController);
    });
  });

  describe('getAllReports', () => {
    it('should get all comment reports', async () => {
      const mockReports = [
        { reportId: 1, commentId: 1, reason: 'Spam' },
        { reportId: 2, commentId: 2, reason: 'Harassment' },
      ];
      mockReportsService.getCommentReports.mockResolvedValue(mockReports);

      await controller.getAllReports(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.getCommentReports).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        reports: mockReports,
      });
    });

    it('should return empty array when no reports', async () => {
      mockReportsService.getCommentReports.mockResolvedValue([]);

      await controller.getAllReports(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        reports: [],
      });
    });

    it('should return 500 error on service failure', async () => {
      mockReportsService.getCommentReports.mockRejectedValue(new Error('Database error'));

      await controller.getAllReports(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      // Note: This controller uses 500 status for errors
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('archiveReport', () => {
    it('should archive a comment report', async () => {
      mockRequest.body = { reportId: 1 };
      mockReportsService.archiveCommentReport.mockResolvedValue(undefined);

      await controller.archiveReport(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.archiveCommentReport).toHaveBeenCalledWith(1);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 error on service failure', async () => {
      mockRequest.body = { reportId: 1 };
      mockReportsService.archiveCommentReport.mockRejectedValue(new Error('Database error'));

      await controller.archiveReport(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('deleteReport', () => {
    it('should delete a comment report', async () => {
      mockRequest.params = { reportId: 1 };
      mockReportsService.deleteCommentReport.mockResolvedValue(undefined);

      await controller.deleteReport(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.deleteCommentReport).toHaveBeenCalledWith(1);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 error on service failure', async () => {
      mockRequest.params = { reportId: 1 };
      mockReportsService.deleteCommentReport.mockRejectedValue(new Error('Database error'));

      await controller.deleteReport(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
