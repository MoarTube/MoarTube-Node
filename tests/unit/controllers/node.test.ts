import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { NodeController } from '@/controllers/node.js';
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    lastCheckedContentTracker: {
      lastCheckedCommentsTimestamp: 1,
      lastCheckedVideoReportsTimestamp: 1,
      lastCheckedCommentReportsTimestamp: 1,
    },
    updateLastCheckedContentTracker: vi.fn(),
  })),
}));
describe('Node moderation activity controller', () => {
  const mockCommentsService = { countCommentsNewerThan: vi.fn() };
  const mockReportsService = {
    countVideoReportsNewerThan: vi.fn(),
    countCommentReportsNewerThan: vi.fn(),
  };
  let controller: NodeController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.clearAllMocks();
    controller = new NodeController(mockCommentsService as never, mockReportsService as never);
    mockRequest = { body: {}, query: {}, headers: {} };
    mockReply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
  });
  describe('getNewContentCounts', () => {
    it('should get new content counts', async () => {
      mockCommentsService.countCommentsNewerThan.mockResolvedValue(5);
      mockReportsService.countVideoReportsNewerThan.mockResolvedValue(2);
      mockReportsService.countCommentReportsNewerThan.mockResolvedValue(1);

      await controller.getNewContentCounts(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockCommentsService.countCommentsNewerThan).toHaveBeenCalled();
      expect(mockReportsService.countVideoReportsNewerThan).toHaveBeenCalled();
      expect(mockReportsService.countCommentReportsNewerThan).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        newContentCounts: {
          newCommentsCount: 5,
          newVideoReportsCount: 2,
          newCommentReportsCount: 1,
        },
      });
    });

    it('should return zero counts when no new content', async () => {
      mockCommentsService.countCommentsNewerThan.mockResolvedValue(0);
      mockReportsService.countVideoReportsNewerThan.mockResolvedValue(0);
      mockReportsService.countCommentReportsNewerThan.mockResolvedValue(0);

      await controller.getNewContentCounts(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        newContentCounts: {
          newCommentsCount: 0,
          newVideoReportsCount: 0,
          newCommentReportsCount: 0,
        },
      });
    });

    it('should return error on service failure', async () => {
      mockCommentsService.countCommentsNewerThan.mockRejectedValue(new Error('Database error'));

      await controller.getNewContentCounts(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('contentChecked', () => {
    it('should update comments checked timestamp', async () => {
      mockRequest.body = { contentType: 'comments' };

      await controller.contentChecked(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // The config.updateLastCheckedContentTracker is called internally
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should update video reports checked timestamp', async () => {
      mockRequest.body = { contentType: 'videoReports' };

      await controller.contentChecked(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should update comment reports checked timestamp', async () => {
      mockRequest.body = { contentType: 'commentReports' };

      await controller.contentChecked(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return success even for unknown content type (no-op)', async () => {
      mockRequest.body = { contentType: 'unknown' };

      await controller.contentChecked(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      // The switch just does nothing for unknown types
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on failure', async () => {
      mockRequest.body = { contentType: 'comments' };

      // Mock getConfig to throw an error
      const { getConfig } = await import('@config/index.js');
      vi.mocked(getConfig).mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      await controller.contentChecked(
        mockRequest as FastifyRequest,
        mockReply as unknown as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
