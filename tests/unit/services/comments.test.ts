/**
 * Comments Service Tests
 *
 * Tests for the CommentsService class that handles comment CRUD operations
 * and integration with video comment counts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommentsService } from '@/services/comments.js';
import type { Logger } from '@/utils/logger.js';
import type { CommentsRepository } from '@/database/repositories/index.js';
import type { DrizzleComment, DrizzleNewComment } from '@/database/schemas/sqlite/index.js';

describe('CommentsService', () => {
  let service: CommentsService;
  let mockLogger: Logger;
  let mockCommentsRepository: CommentsRepository;

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
      findByIds: vi.fn().mockResolvedValue([]),
      getBacklinksForComments: vi.fn().mockResolvedValue([]),
      getCacheEpoch: vi.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111'),
      getCacheVersion: vi.fn().mockResolvedValue(100),
      getCacheChanges: vi.fn().mockResolvedValue([]),
      findByVideoIdWithTimestampFilter: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteByVideoId: vi.fn(),
      countByVideoId: vi.fn(),
      countNewerThan: vi.fn(),
      search: vi.fn(),
    } as unknown as CommentsRepository;

    service = new CommentsService(mockLogger, mockCommentsRepository);
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

      const result = await service.createComment({
        videoId: 'video123',
        commentPlainText: 'This is a test comment',
      });

      expect(result).toEqual(newComment);
      expect(mockCommentsRepository.create).toHaveBeenCalled();
    });

    it('should sanitize HTML in comment text', async () => {
      vi.mocked(mockCommentsRepository.create).mockImplementation(
        async (data: DrizzleNewComment) => ({
          id: 1,
          video_id: data.video_id,
          comment_plain_text_sanitized: data.comment_plain_text_sanitized,
          timestamp: data.timestamp,
        })
      );

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
      vi.mocked(mockCommentsRepository.create).mockImplementation(
        async (data: DrizzleNewComment) => ({
          id: 1,
          video_id: data.video_id,
          comment_plain_text_sanitized: data.comment_plain_text_sanitized,
          timestamp: data.timestamp,
        })
      );

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

      const result = await service.deleteComment('video123', 1, 1704067200000);

      expect(result).toBe(true);
      expect(mockCommentsRepository.delete).toHaveBeenCalledWith('video123', 1, 1704067200000);
    });

    it('should return false if comment not found', async () => {
      vi.mocked(mockCommentsRepository.findById).mockResolvedValue(null);

      const result = await service.deleteComment('video123', 999, 1704067200000);

      expect(result).toBe(false);
      expect(mockCommentsRepository.delete).not.toHaveBeenCalled();
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
  it('queries bounded comment history pages and refresh cursors', async () => {
    (mockCommentsRepository as any).findByVideoId = vi.fn().mockResolvedValue([]);
    expect(await service.getRecentComments('video')).toEqual([]);
    expect((mockCommentsRepository as any).findByVideoId).toHaveBeenCalledWith('video', {
      limit: 101,
      offset: 0,
    });
    vi.mocked(mockCommentsRepository.findByVideoIdWithTimestampFilter).mockResolvedValue([]);
    expect(await service.getCommentsForVideo('video', 'after', 'ascending', 100, 5)).toEqual([]);
    expect(mockCommentsRepository.findByVideoIdWithTimestampFilter).toHaveBeenCalledWith(
      'video',
      'after',
      'ascending',
      100,
      5
    );
  });
  it('resolves quote previews by video and ID without the quoting comment timestamp', async () => {
    vi.mocked(mockCommentsRepository.findById).mockResolvedValue(mockComment);
    expect(await service.getComment('video123', 1)).toEqual(mockComment);
    expect(mockCommentsRepository.findById).toHaveBeenCalledWith('video123', 1, undefined);
  });
  it('uses indexed backlinks with bounded lookahead and cursor', async () => {
    vi.mocked(mockCommentsRepository.getBacklinksForComments).mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({ parent_id: 5, reply_id: 300 - i }))
    );
    expect(await service.getCommentBacklinks('video', 5, 400)).toEqual({
      replyIds: Array.from({ length: 100 }, (_, i) => 300 - i),
      hasMore: true,
    });
    expect(mockCommentsRepository.getBacklinksForComments).toHaveBeenCalledWith('video', [5], 400);
    vi.mocked(mockCommentsRepository.getBacklinksForComments).mockResolvedValue([]);
    expect(await service.getCommentBacklinks('video', 5)).toEqual({ replyIds: [], hasMore: false });
  });
  it('batches metadata and caps each comment reply list', async () => {
    vi.mocked(mockCommentsRepository.getBacklinksForComments).mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({ parent_id: 5, reply_id: 300 - i }))
    );
    const rows = await service.formatComments('video', [
      { ...mockComment, comment_id: 5 },
      { ...mockComment, comment_id: 6 },
    ]);
    expect(rows[0].replyIds).toHaveLength(100);
    expect(rows[0].hasMoreReplies).toBe(true);
    expect(rows[1]).toMatchObject({ replyIds: [], hasMoreReplies: false });
  });
  it('returns bounded sync pages, deletes, missing rows and reset markers', async () => {
    vi.mocked(mockCommentsRepository.getCacheChanges).mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({ version: i + 1, comment_id: i + 1, deleted: i % 2 }))
    );
    vi.mocked(mockCommentsRepository.findById).mockResolvedValue(null);
    expect(await service.getCacheChanges('video', 0)).toMatchObject({
      version: 100,
      hasMore: true,
      reset: false,
      comments: [],
    });
    vi.mocked(mockCommentsRepository.getCacheChanges).mockResolvedValue([
      { version: 100, comment_id: 5, deleted: 0 },
    ]);
    vi.mocked(mockCommentsRepository.findByIds).mockResolvedValue([
      { ...mockComment, comment_id: 5 },
    ]);
    expect(await service.getCacheChanges('video', 200)).toMatchObject({
      version: 100,
      reset: true,
      hasMore: false,
      comments: [{ commentId: 5 }],
    });
    expect(mockCommentsRepository.getCacheChanges).toHaveBeenLastCalledWith('video', 0);
  });
  it('resets caches on a different database identity even when revisions increase', async () => {
    expect(await service.getCacheChanges('video', 1, 'old-database')).toMatchObject({
      reset: true,
      epoch: '11111111-1111-4111-8111-111111111111',
    });
    expect(mockCommentsRepository.getCacheChanges).toHaveBeenLastCalledWith('video', 0);
    expect(
      await service.getCacheChanges('video', 1, '11111111-1111-4111-8111-111111111111')
    ).toMatchObject({ reset: false });
  });
});
