/**
 * ReportsVideosController Tests
 *
 * Tests for video report management endpoints.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ReportsVideosController } from '@controllers/reports-videos.js';

// Mock services
const mockReportsService: Record<string, ReturnType<typeof vi.fn>> = {
  getVideoReports: vi.fn(),
  archiveVideoReport: vi.fn(),
  deleteVideoReport: vi.fn(),
};

describe('ReportsVideosController', () => {
  let controller: ReportsVideosController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    headers: Mock;
    type: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new ReportsVideosController(mockReportsService as any);

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
    it('should create a ReportsVideosController instance', () => {
      expect(controller).toBeInstanceOf(ReportsVideosController);
    });
  });

  describe('getAllReports', () => {
    it('should get all video reports', async () => {
      const mockReports = [
        { reportId: 1, videoId: 'vid1', reason: 'Spam' },
        { reportId: 2, videoId: 'vid2', reason: 'Inappropriate' },
      ];
      mockReportsService.getVideoReports.mockResolvedValue(mockReports);

      await controller.getAllReports(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.getVideoReports).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        reports: mockReports,
      });
    });

    it('should return empty array when no reports', async () => {
      mockReportsService.getVideoReports.mockResolvedValue([]);

      await controller.getAllReports(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        reports: [],
      });
    });

    it('should return error on service failure', async () => {
      mockReportsService.getVideoReports.mockRejectedValue(new Error('Database error'));

      await controller.getAllReports(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('archiveReport', () => {
    it('should archive a video report', async () => {
      mockRequest.body = { reportId: 1 };
      mockReportsService.archiveVideoReport.mockResolvedValue(undefined);

      await controller.archiveReport(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.archiveVideoReport).toHaveBeenCalledWith(1);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on service failure', async () => {
      mockRequest.body = { reportId: 1 };
      mockReportsService.archiveVideoReport.mockRejectedValue(new Error('Database error'));

      await controller.archiveReport(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('deleteReport', () => {
    it('should delete a video report', async () => {
      mockRequest.params = { reportId: 1 };
      mockReportsService.deleteVideoReport.mockResolvedValue(undefined);

      await controller.deleteReport(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.deleteVideoReport).toHaveBeenCalledWith(1);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on service failure', async () => {
      mockRequest.params = { reportId: 1 };
      mockReportsService.deleteVideoReport.mockRejectedValue(new Error('Database error'));

      await controller.deleteReport(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
