/**
 * Unit tests for CommentsController
 *
 * Tests comment search and reporting endpoints.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock dependencies
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    nodeSettings: {
      isReportsEnabled: true,
      isCloudflareTurnstileEnabled: false,
    },
  })),
}));

vi.mock('sanitize-html', () => ({
  default: vi.fn((input: string) => input),
}));

import type { FastifyRequest, FastifyReply } from 'fastify';
import { CommentsController } from '../../../src/controllers/comments.js';
import { getConfig } from '@config/index.js';

describe('CommentsController', () => {
  // Mock services
  const mockCommentsService: Record<string, ReturnType<typeof vi.fn>> = {
    search: vi.fn(),
    getComment: vi.fn(),
  };

  const mockReportsService: Record<string, ReturnType<typeof vi.fn>> = {
    createCommentReport: vi.fn(),
  };

  const mockVideosService: Record<string, ReturnType<typeof vi.fn>> = {
    getVideo: vi.fn(),
  };

  const mockCloudflareService: Record<string, ReturnType<typeof vi.fn>> = {
    validateTurnstileToken: vi.fn(),
  };

  let controller: CommentsController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    type: Mock;
    header: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new CommentsController(
      mockCommentsService as any,
      mockReportsService as any,
      mockVideosService as any,
      mockCloudflareService as any
    );

    mockRequest = {
      body: {},
      query: {},
      params: {},
      headers: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };
  });

  describe('constructor', () => {
    it('should create a CommentsController instance', () => {
      expect(controller).toBeInstanceOf(CommentsController);
    });
  });

  describe('search', () => {
    it('should search comments successfully', async () => {
      mockRequest.query = {
        limit: 10,
        sortDirection: 'desc',
        timestamp: 0,
      };

      const mockComments = [
        { id: 1, text: 'Test comment', timestamp: 123456 },
        { id: 2, text: 'Another comment', timestamp: 123457 },
      ];
      mockCommentsService.search.mockResolvedValue(mockComments);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockCommentsService.search).toHaveBeenCalledWith(10, 'desc', 0, undefined, undefined);
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        comments: mockComments,
      });
    });

    it('should search comments with videoId filter', async () => {
      mockRequest.query = {
        limit: 5,
        sortDirection: 'asc',
        timestamp: 100,
        videoId: 'video123',
      };

      mockCommentsService.search.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockCommentsService.search).toHaveBeenCalledWith(5, 'asc', 100, 'video123', undefined);
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should search comments with searchTerm', async () => {
      mockRequest.query = {
        limit: 20,
        sortDirection: 'desc',
        timestamp: 0,
        searchTerm: 'hello',
      };

      mockCommentsService.search.mockResolvedValue([]);

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockCommentsService.search).toHaveBeenCalledWith(20, 'desc', 0, undefined, 'hello');
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on service failure', async () => {
      mockRequest.query = {
        limit: 10,
        sortDirection: 'desc',
        timestamp: 0,
      };

      mockCommentsService.search.mockRejectedValue(new Error('Database error'));

      await controller.search(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('reportComment', () => {
    beforeEach(() => {
      mockRequest.params = { commentId: 123 };
      mockRequest.body = {
        videoId: 'video456',
        timestamp: 123456789,
        email: 'user@example.com',
        reportType: 'spam',
        message: 'This is spam',
      };
    });

    it('should report a comment successfully', async () => {
      mockCommentsService.getComment.mockResolvedValue({
        id: 123,
        text: 'Spam comment',
        timestamp: 123456789,
      });
      mockVideosService.getVideo.mockResolvedValue({
        videoId: 'video456',
        is_reports_enabled: true,
      });
      mockReportsService.createCommentReport.mockResolvedValue(undefined);

      await controller.reportComment(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockCommentsService.getComment).toHaveBeenCalledWith('video456', 123, 123456789);
      expect(mockVideosService.getVideo).toHaveBeenCalledWith('video456');
      expect(mockReportsService.createCommentReport).toHaveBeenCalledWith({
        videoId: 'video456',
        commentId: 123,
        commentTimestamp: 123456789,
        email: 'user@example.com',
        type: 'spam',
        message: 'This is spam',
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error when reports are disabled globally', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isReportsEnabled: false,
          isCloudflareTurnstileEnabled: false,
        },
      } as any);

      await controller.reportComment(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'reporting is currently disabled',
      });
    });

    it('should return error when comment does not exist', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isReportsEnabled: true,
          isCloudflareTurnstileEnabled: false,
        },
      } as any);

      mockCommentsService.getComment.mockResolvedValue(null);

      await controller.reportComment(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'this comment no longer exists',
      });
    });

    it('should return error when video does not exist', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isReportsEnabled: true,
          isCloudflareTurnstileEnabled: false,
        },
      } as any);

      mockCommentsService.getComment.mockResolvedValue({ id: 123, timestamp: 123456789 });
      mockVideosService.getVideo.mockResolvedValue(null);

      await controller.reportComment(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'this video no longer exists',
      });
    });

    it('should return error when reports are disabled on video', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isReportsEnabled: true,
          isCloudflareTurnstileEnabled: false,
        },
      } as any);

      mockCommentsService.getComment.mockResolvedValue({ id: 123, timestamp: 123456789 });
      mockVideosService.getVideo.mockResolvedValue({
        videoId: 'video456',
        is_reports_enabled: false,
      });

      await controller.reportComment(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'reporting is currently disabled',
      });
    });

    it('should require turnstile token when enabled', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isReportsEnabled: true,
          isCloudflareTurnstileEnabled: true,
        },
      } as any);

      // No token provided
      mockRequest.body = {
        videoId: 'video456',
        timestamp: 123456789,
        email: 'user@example.com',
        reportType: 'spam',
        message: 'This is spam',
      };

      await controller.reportComment(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'human verification was enabled on this MoarTube Node, please refresh your browser',
      });
    });

    it('should validate turnstile token when provided', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isReportsEnabled: true,
          isCloudflareTurnstileEnabled: true,
        },
      } as any);

      mockRequest.body = {
        videoId: 'video456',
        timestamp: 123456789,
        email: 'user@example.com',
        reportType: 'spam',
        message: 'This is spam',
        cloudflareTurnstileToken: 'valid-token',
      };
      mockRequest.headers = { 'cf-connecting-ip': '1.2.3.4' };

      mockCloudflareService.validateTurnstileToken.mockResolvedValue(false);

      await controller.reportComment(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockCloudflareService.validateTurnstileToken).toHaveBeenCalledWith('valid-token', '1.2.3.4');
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'human verification failed',
      });
    });

    it('should proceed when turnstile validation succeeds', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isReportsEnabled: true,
          isCloudflareTurnstileEnabled: true,
        },
      } as any);

      mockRequest.body = {
        videoId: 'video456',
        commentId: 1,
        timestamp: 123456789,
        email: 'user@example.com',
        reportType: 'spam',
        message: 'This is spam',
        cloudflareTurnstileToken: 'valid-token',
      };
      mockRequest.params = { commentId: 1 };
      mockRequest.headers = { 'cf-connecting-ip': '1.2.3.4' };

      // Token validates successfully
      mockCloudflareService.validateTurnstileToken.mockResolvedValue(true);
      mockCommentsService.getComment.mockResolvedValue({ timestamp: 123456789 });
      mockVideosService.getVideo.mockResolvedValue({ is_reports_enabled: true });
      mockReportsService.createCommentReport.mockResolvedValue(undefined);

      await controller.reportComment(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockCloudflareService.validateTurnstileToken).toHaveBeenCalledWith('valid-token', '1.2.3.4');
      // Should continue past turnstile validation and succeed
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return error on service failure', async () => {
      vi.mocked(getConfig).mockReturnValue({
        nodeSettings: {
          isReportsEnabled: true,
          isCloudflareTurnstileEnabled: false,
        },
      } as any);

      mockCommentsService.getComment.mockRejectedValue(new Error('Database error'));

      await controller.reportComment(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
