/**
 * Comments Service Tests
 *
 * Tests for the CommentsService class that handles comment CRUD operations
 * and integration with video comment counts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommentsService } from '@/services/comments.js';
import type { Logger } from '@/utils/logger.js';
import type { CommentsRepository, VideosRepository } from '@/database/repositories/index.js';
import type { DrizzleComment, DrizzleNewComment } from '@/database/schemas/sqlite/index.js';

describe('CommentsService', () => {
  let service: CommentsService;
  let mockLogger: Logger;
  let mockCommentsRepository: CommentsRepository;
  let mockVideosRepository: VideosRepository;

  const mockComment: DrizzleComment = {
    id: 1,
    video_id: 'video123',
    comment_plain_text_sanitized: 'This is a test comment',
    timestamp: 1704067200000,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockCommentsRepository = {
      findById: vi.fn(),
      findByVideoIdWithTimestampFilter: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteByVideoId: vi.fn(),
      countByVideoId: vi.fn(),
      countNewerThan: vi.fn(),
      search: vi.fn(),
    } as unknown as CommentsRepository;

    mockVideosRepository = {
      incrementComments: vi.fn(),
      decrementComments: vi.fn(),
    } as unknown as VideosRepository;

    service = new CommentsService(mockLogger, mockCommentsRepository, mockVideosRepository);
  });

  describe('constructor', () => {
    it('should create a CommentsService instance', () => {
      expect(service).toBeInstanceOf(CommentsService);
    });
  });

  describe('getComment', () => {
    it('should return a comment by ID', async () => {
      vi.mocked(mockCommentsRepository.findById).mockResolvedValue(mockComment);

      const result = await service.getComment('video123', 1, 1704067200000);

      expect(result).toEqual(mockComment);
      expect(mockCommentsRepository.findById).toHaveBeenCalledWith('video123', 1, 1704067200000);
    });

    it('should return null if comment not found', async () => {
      vi.mocked(mockCommentsRepository.findById).mockResolvedValue(null);

      const result = await service.getComment('video123', 999, 1704067200000);

      expect(result).toBeNull();
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Database error');
      vi.mocked(mockCommentsRepository.findById).mockRejectedValue(error);

      await expect(service.getComment('video123', 1, 1704067200000)).rejects.toThrow(
        'Database error'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('getComment failed', error);
    });
  });

  describe('getCommentsForVideo', () => {
    const mockComments: DrizzleComment[] = [
      { ...mockComment, id: 1, timestamp: 1704067200000 },
      { ...mockComment, id: 2, timestamp: 1704067300000 },
    ];

    it('should return comments for a video with before type', async () => {
      vi.mocked(mockCommentsRepository.findByVideoIdWithTimestampFilter).mockResolvedValue(
        mockComments
      );

      const result = await service.getCommentsForVideo(
        'video123',
        'before',
        'descending',
        1704067400000
      );

      expect(result).toEqual(mockComments);
      expect(mockCommentsRepository.findByVideoIdWithTimestampFilter).toHaveBeenCalledWith(
        'video123',
        'before',
        'descending',
        1704067400000
      );
    });

    it('should return comments for a video with after type', async () => {
      vi.mocked(mockCommentsRepository.findByVideoIdWithTimestampFilter).mockResolvedValue(
        mockComments
      );

      const result = await service.getCommentsForVideo(
        'video123',
        'after',
        'ascending',
        1704067000000
      );

      expect(result).toEqual(mockComments);
      expect(mockCommentsRepository.findByVideoIdWithTimestampFilter).toHaveBeenCalledWith(
        'video123',
        'after',
        'ascending',
        1704067000000
      );
    });

    it('should throw error for invalid type', async () => {
      await expect(
        service.getCommentsForVideo('video123', 'invalid', 'descending', 1704067200000)
      ).rejects.toThrow('Type must be "before" or "after"');
    });

    it('should throw error for invalid sort', async () => {
      await expect(
        service.getCommentsForVideo('video123', 'before', 'invalid', 1704067200000)
      ).rejects.toThrow('Sort must be "ascending" or "descending"');
    });

    it('should return empty array if no comments found', async () => {
      vi.mocked(mockCommentsRepository.findByVideoIdWithTimestampFilter).mockResolvedValue([]);

      const result = await service.getCommentsForVideo(
        'video123',
        'before',
        'descending',
        1704067200000
      );

      expect(result).toEqual([]);
    });
  });

  describe('createComment', () => {
    it('should create a comment and increment video comment count', async () => {
      const newComment = { ...mockComment };
      vi.mocked(mockCommentsRepository.create).mockResolvedValue(newComment);
      vi.mocked(mockVideosRepository.incrementComments).mockResolvedValue();

      const result = await service.createComment({
        videoId: 'video123',
        commentPlainText: 'This is a test comment',
      });

      expect(result).toEqual(newComment);
      expect(mockCommentsRepository.create).toHaveBeenCalled();
      expect(mockVideosRepository.incrementComments).toHaveBeenCalledWith('video123');
    });

    it('should sanitize HTML in comment text', async () => {
      vi.mocked(mockCommentsRepository.create).mockImplementation(async (data: DrizzleNewComment) => ({
        id: 1,
        video_id: data.video_id,
        comment_plain_text_sanitized: data.comment_plain_text_sanitized,
        timestamp: data.timestamp,
      }));
      vi.mocked(mockVideosRepository.incrementComments).mockResolvedValue();

      await service.createComment({
        videoId: 'video123',
        commentPlainText: '<script>alert("xss")</script>Hello World',
      });

      const createCall = vi.mocked(mockCommentsRepository.create).mock.calls[0];
      expect(createCall).toBeDefined();
      const commentData = createCall[0] as DrizzleNewComment;
      // HTML tags should be stripped
      expect(commentData.comment_plain_text_sanitized).not.toContain('<script>');
      expect(commentData.comment_plain_text_sanitized).toContain('Hello World');
    });

    it('should set timestamp on new comment', async () => {
      vi.mocked(mockCommentsRepository.create).mockImplementation(async (data: DrizzleNewComment) => ({
        id: 1,
        video_id: data.video_id,
        comment_plain_text_sanitized: data.comment_plain_text_sanitized,
        timestamp: data.timestamp,
      }));
      vi.mocked(mockVideosRepository.incrementComments).mockResolvedValue();

      const beforeTime = Date.now();
      await service.createComment({
        videoId: 'video123',
        commentPlainText: 'Test comment',
      });
      const afterTime = Date.now();

      const createCall = vi.mocked(mockCommentsRepository.create).mock.calls[0];
      const commentData = createCall[0] as DrizzleNewComment;
      expect(commentData.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(commentData.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Create failed');
      vi.mocked(mockCommentsRepository.create).mockRejectedValue(error);

      await expect(
        service.createComment({
          videoId: 'video123',
          commentPlainText: 'Test',
        })
      ).rejects.toThrow('Create failed');
      expect(mockLogger.error).toHaveBeenCalledWith('createComment failed', error);
    });
  });

  describe('deleteComment', () => {
    it('should delete a comment and decrement video comment count', async () => {
      vi.mocked(mockCommentsRepository.findById).mockResolvedValue(mockComment);
      vi.mocked(mockCommentsRepository.delete).mockResolvedValue(true);
      vi.mocked(mockVideosRepository.decrementComments).mockResolvedValue();

      const result = await service.deleteComment('video123', 1, 1704067200000);

      expect(result).toBe(true);
      expect(mockCommentsRepository.delete).toHaveBeenCalledWith('video123', 1, 1704067200000);
      expect(mockVideosRepository.decrementComments).toHaveBeenCalledWith('video123');
    });

    it('should return false if comment not found', async () => {
      vi.mocked(mockCommentsRepository.findById).mockResolvedValue(null);

      const result = await service.deleteComment('video123', 999, 1704067200000);

      expect(result).toBe(false);
      expect(mockCommentsRepository.delete).not.toHaveBeenCalled();
      expect(mockVideosRepository.decrementComments).not.toHaveBeenCalled();
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Delete failed');
      vi.mocked(mockCommentsRepository.findById).mockResolvedValue(mockComment);
      vi.mocked(mockCommentsRepository.delete).mockRejectedValue(error);

      await expect(service.deleteComment('video123', 1, 1704067200000)).rejects.toThrow(
        'Delete failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('deleteComment failed', error);
    });
  });

  describe('deleteCommentsForVideo', () => {
    it('should delete all comments for a video', async () => {
      vi.mocked(mockCommentsRepository.deleteByVideoId).mockResolvedValue(5);

      const result = await service.deleteCommentsForVideo('video123');

      expect(result).toBe(5);
      expect(mockCommentsRepository.deleteByVideoId).toHaveBeenCalledWith('video123');
    });

    it('should log when deleting comments', async () => {
      vi.mocked(mockCommentsRepository.deleteByVideoId).mockResolvedValue(3);

      await service.deleteCommentsForVideo('video123');

      expect(mockLogger.info).toHaveBeenCalledWith('Deleting all comments for video', {
        videoId: 'video123',
      });
    });

    it('should return 0 if no comments to delete', async () => {
      vi.mocked(mockCommentsRepository.deleteByVideoId).mockResolvedValue(0);

      const result = await service.deleteCommentsForVideo('video123');

      expect(result).toBe(0);
    });
  });

  describe('countCommentsForVideo', () => {
    it('should return comment count for a video', async () => {
      vi.mocked(mockCommentsRepository.countByVideoId).mockResolvedValue(42);

      const result = await service.countCommentsForVideo('video123');

      expect(result).toBe(42);
      expect(mockCommentsRepository.countByVideoId).toHaveBeenCalledWith('video123');
    });

    it('should return 0 for videos with no comments', async () => {
      vi.mocked(mockCommentsRepository.countByVideoId).mockResolvedValue(0);

      const result = await service.countCommentsForVideo('video123');

      expect(result).toBe(0);
    });
  });

  describe('countCommentsNewerThan', () => {
    it('should return count of comments newer than timestamp', async () => {
      vi.mocked(mockCommentsRepository.countNewerThan).mockResolvedValue(15);

      const result = await service.countCommentsNewerThan(1704067200000);

      expect(result).toBe(15);
      expect(mockCommentsRepository.countNewerThan).toHaveBeenCalledWith(1704067200000);
    });

    it('should return 0 if no newer comments', async () => {
      vi.mocked(mockCommentsRepository.countNewerThan).mockResolvedValue(0);

      const result = await service.countCommentsNewerThan(Date.now());

      expect(result).toBe(0);
    });
  });

  describe('search', () => {
    const mockSearchResults: DrizzleComment[] = [
      { ...mockComment, id: 1, comment_plain_text_sanitized: 'matching comment 1' },
      { ...mockComment, id: 2, comment_plain_text_sanitized: 'matching comment 2' },
    ];

    it('should search comments with all parameters', async () => {
      vi.mocked(mockCommentsRepository.search).mockResolvedValue(mockSearchResults);

      const result = await service.search(10, 'descending', 1704067200000, 'video123', 'matching');

      expect(result).toEqual(mockSearchResults);
      expect(mockCommentsRepository.search).toHaveBeenCalledWith(
        10,
        'descending',
        1704067200000,
        'video123',
        'matching'
      );
    });

    it('should search comments without optional parameters', async () => {
      vi.mocked(mockCommentsRepository.search).mockResolvedValue(mockSearchResults);

      const result = await service.search(10, 'ascending', 1704067200000);

      expect(result).toEqual(mockSearchResults);
      expect(mockCommentsRepository.search).toHaveBeenCalledWith(
        10,
        'ascending',
        1704067200000,
        undefined,
        undefined
      );
    });

    it('should return empty array if no results', async () => {
      vi.mocked(mockCommentsRepository.search).mockResolvedValue([]);

      const result = await service.search(10, 'descending', 1704067200000, 'video123', 'nomatch');

      expect(result).toEqual([]);
    });
  });
});
