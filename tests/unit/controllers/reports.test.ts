/**
 * Unit tests for ReportsController
 *
 * Tests report count endpoints.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ReportsController } from '../../../src/controllers/reports.js';

describe('ReportsController', () => {
  // Mock services
  const mockReportsService: Record<string, ReturnType<typeof vi.fn>> = {
    countVideoReports: vi.fn(),
    countCommentReports: vi.fn(),
  };

  let controller: ReportsController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    type: Mock;
    header: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new ReportsController(mockReportsService as any);

    mockRequest = {};

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };
  });

  describe('constructor', () => {
    it('should create a ReportsController instance', () => {
      expect(controller).toBeInstanceOf(ReportsController);
    });
  });

  describe('getReportsCount', () => {
    it('should get report counts', async () => {
      mockReportsService.countVideoReports.mockResolvedValue(5);
      mockReportsService.countCommentReports.mockResolvedValue(3);

      await controller.getReportsCount(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReportsService.countVideoReports).toHaveBeenCalled();
      expect(mockReportsService.countCommentReports).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        videoReportCount: 5,
        commentReportCount: 3,
        totalReportCount: 8,
      });
    });

    it('should return zero counts when no reports', async () => {
      mockReportsService.countVideoReports.mockResolvedValue(0);
      mockReportsService.countCommentReports.mockResolvedValue(0);

      await controller.getReportsCount(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        videoReportCount: 0,
        commentReportCount: 0,
        totalReportCount: 0,
      });
    });

    it('should return error on service failure', async () => {
      mockReportsService.countVideoReports.mockRejectedValue(new Error('Database error'));

      await controller.getReportsCount(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
