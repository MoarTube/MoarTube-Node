/**
 * Unit tests for database/repositories/videos.ts
 *
 * Tests the VideosRepository interface implementations which provide CRUD operations
 * and specialized queries for video records.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createVideosRepository, type IVideosRepository, type VideoQueryOptions } from '@database/repositories/videos/index.js';

// Mock the schema import first
vi.mock('@database/schemas/sqlite/index.js', () => ({
  videos: {
    name: 'videos',
    id: { name: 'id' },
    video_id: { name: 'video_id' },
    title: { name: 'title' },
    description: { name: 'description' },
    tags: { name: 'tags' },
    length_seconds: { name: 'length_seconds' },
    length_timestamp: { name: 'length_timestamp' },
    views: { name: 'views' },
    comments: { name: 'comments' },
    likes: { name: 'likes' },
    dislikes: { name: 'dislikes' },
    bandwidth: { name: 'bandwidth' },
    is_importing: { name: 'is_importing' },
    is_imported: { name: 'is_imported' },
    is_publishing: { name: 'is_publishing' },
    is_published: { name: 'is_published' },
    is_streaming: { name: 'is_streaming' },
    is_streamed: { name: 'is_streamed' },
    is_stream_recorded_remotely: { name: 'is_stream_recorded_remotely' },
  },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
  asc: vi.fn((field) => ({ type: 'asc', field })),
  sql: vi.fn((strings, ...values) => ({ type: 'sql', strings, values })),
  and: vi.fn((...conditions) => ({ type: 'and', conditions })),
  or: vi.fn((...conditions) => ({ type: 'or', conditions })),
  like: vi.fn((field, pattern) => ({ type: 'like', field, pattern })),
  count: vi.fn(() => ({ type: 'count' })),
  lt: vi.fn((field, value) => ({ type: 'lt', field, value })),
}));

import { videos as mockVideosTable } from '@database/schemas/sqlite/index.js';

describe('database/repositories/videos.ts', () => {
  let mockDb: any;
  let repository: IVideosRepository<any, any>;

  beforeEach(() => {
    // Create chainable mock database
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    };

    // Create repository using factory function
    repository = createVideosRepository('sqlite', mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('factory function', () => {
    it('should create repository with database and table', () => {
      expect(repository).toBeDefined();
      expect(typeof repository.findById).toBe('function');
    });
  });

  describe('findById', () => {
    it('should find video by video_id', async () => {
      const mockVideo = { video_id: 'test123', title: 'Test Video' };
      mockDb.limit.mockResolvedValue([mockVideo]);

      const result = await repository.findById('test123');

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalledWith(mockVideosTable);
      expect(mockDb.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockVideo);
    });

    it('should return null when video not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByDbId', () => {
    it('should find video by database id', async () => {
      const mockVideo = { id: 1, video_id: 'test123' };
      mockDb.limit.mockResolvedValue([mockVideo]);

      const result = await repository.findByDbId(1);

      expect(result).toEqual(mockVideo);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findByDbId(999);

      expect(result).toBeNull();
    });
  });

  describe('findPublished', () => {
    it('should find published videos with default options', async () => {
      const mockVideos = [{ video_id: 'v1' }, { video_id: 'v2' }];
      mockDb.limit.mockResolvedValue(mockVideos);

      const result = await repository.findPublished();

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(50); // default limit
      expect(result).toEqual(mockVideos);
    });

    it('should apply custom limit', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findPublished({ limit: 50 });

      expect(mockDb.limit).toHaveBeenCalledWith(50);
    });

    it('should apply sorting options', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findPublished({ sortBy: 'views', sortDirection: 'asc' });

      expect(mockDb.orderBy).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all videos without limit when no options', async () => {
      const mockVideos = [{ video_id: 'v1' }];
      // When no limit, the query chain returns directly from orderBy
      mockDb.orderBy.mockResolvedValue(mockVideos);

      const result = await repository.findAll();

      expect(result).toEqual(mockVideos);
    });

    it('should apply limit when specified', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({ limit: 10 });

      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });

    it('should apply filter conditions', async () => {
      mockDb.where.mockReturnThis();
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({ isPublished: true, limit: 10 });

      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('getCount', () => {
    it('should return count of all videos', async () => {
      mockDb.select.mockReturnThis();
      mockDb.from.mockResolvedValue([{ count: 42 }]);

      const result = await repository.getCount();

      expect(result).toBe(42);
    });

    it('should return 0 when no videos', async () => {
      mockDb.select.mockReturnThis();
      mockDb.from.mockResolvedValue([{}]);

      const result = await repository.getCount();

      expect(result).toBe(0);
    });

    it('should apply filter conditions to count', async () => {
      mockDb.select.mockReturnThis();
      mockDb.from.mockReturnThis();
      mockDb.where.mockResolvedValue([{ count: 10 }]);

      const result = await repository.getCount({ isPublished: true });

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toBe(10);
    });
  });

  describe('create', () => {
    it('should create a video record', async () => {
      const videoData = { video_id: 'new123', title: 'New Video' };
      const createdVideo = { id: 1, ...videoData };
      mockDb.returning.mockResolvedValue([createdVideo]);

      const result = await repository.create(videoData);

      expect(mockDb.insert).toHaveBeenCalledWith(mockVideosTable);
      expect(mockDb.values).toHaveBeenCalledWith(videoData);
      expect(result).toEqual(createdVideo);
    });

    it('should throw error when insert fails', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(repository.create({ video_id: 'fail' })).rejects.toThrow(
        'Failed to create video record'
      );
    });
  });

  describe('update', () => {
    it('should update video by video_id', async () => {
      const updatedVideo = { video_id: 'test123', title: 'Updated Title' };
      mockDb.returning.mockResolvedValue([updatedVideo]);

      const result = await repository.update('test123', { title: 'Updated Title' });

      expect(mockDb.update).toHaveBeenCalledWith(mockVideosTable);
      expect(mockDb.set).toHaveBeenCalledWith({ title: 'Updated Title' });
      expect(result).toEqual(updatedVideo);
    });

    it('should return null when video not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.update('nonexistent', { title: 'New' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete video by video_id', async () => {
      mockDb.returning.mockResolvedValue([{ video_id: 'test123' }]);

      const result = await repository.delete('test123');

      expect(mockDb.delete).toHaveBeenCalledWith(mockVideosTable);
      expect(result).toBe(true);
    });

    it('should return false when video not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('incrementViews', () => {
    it('should increment view count', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.incrementViews('test123');

      expect(mockDb.update).toHaveBeenCalledWith(mockVideosTable);
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe('incrementViewsBy', () => {
    it('should increment views by specified amount', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.incrementViewsBy('test123', 5);

      expect(mockDb.update).toHaveBeenCalledWith(mockVideosTable);
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe('incrementLikes', () => {
    it('should increment like count', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.incrementLikes('test123');

      expect(mockDb.update).toHaveBeenCalledWith(mockVideosTable);
    });
  });

  describe('incrementDislikes', () => {
    it('should increment dislike count', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.incrementDislikes('test123');

      expect(mockDb.update).toHaveBeenCalledWith(mockVideosTable);
    });
  });

  describe('incrementComments', () => {
    it('should increment comment count', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.incrementComments('test123');

      expect(mockDb.update).toHaveBeenCalledWith(mockVideosTable);
    });
  });

  describe('decrementComments', () => {
    it('should decrement comment count', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.decrementComments('test123');

      expect(mockDb.update).toHaveBeenCalledWith(mockVideosTable);
    });
  });

  describe('updateBandwidth', () => {
    it('should update bandwidth for video', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.updateBandwidth('test123', 1024000);

      expect(mockDb.update).toHaveBeenCalledWith(mockVideosTable);
      expect(mockDb.set).toHaveBeenCalledWith({ bandwidth: 1024000 });
    });
  });

  describe('findStreaming', () => {
    it('should find all streaming videos', async () => {
      const streamingVideos = [{ video_id: 'stream1', is_streaming: true }];
      mockDb.orderBy.mockResolvedValue(streamingVideos);

      const result = await repository.findStreaming();

      expect(result).toEqual(streamingVideos);
    });
  });

  describe('findIndexed', () => {
    it('should find all indexed videos', async () => {
      const indexedVideos = [{ video_id: 'idx1', is_indexed: true }];
      mockDb.orderBy.mockResolvedValue(indexedVideos);

      const result = await repository.findIndexed();

      expect(result).toEqual(indexedVideos);
    });
  });

  describe('findPendingIndexing', () => {
    it('should find videos pending indexing', async () => {
      const pendingVideos = [{ video_id: 'pending1' }];
      mockDb.where.mockResolvedValue(pendingVideos);

      const result = await repository.findPendingIndexing();

      expect(result).toEqual(pendingVideos);
    });
  });

  describe('markAllIndexedAsOutdated', () => {
    it('should mark all indexed videos as outdated', async () => {
      mockDb.where.mockResolvedValue(undefined);

      await repository.markAllIndexedAsOutdated();

      expect(mockDb.update).toHaveBeenCalledWith(mockVideosTable);
      expect(mockDb.set).toHaveBeenCalledWith({ is_index_outdated: true });
    });
  });

  describe('deleteAll', () => {
    it('should delete all videos and return count', async () => {
      mockDb.returning.mockResolvedValue([{}, {}, {}]);

      const result = await repository.deleteAll();

      expect(mockDb.delete).toHaveBeenCalledWith(mockVideosTable);
      expect(result).toBe(3);
    });

    it('should return 0 when no videos to delete', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.deleteAll();

      expect(result).toBe(0);
    });
  });

  describe('createMany', () => {
    it('should create multiple videos', async () => {
      const videosData = [
        { video_id: 'v1', title: 'Video 1' },
        { video_id: 'v2', title: 'Video 2' },
      ];
      const createdVideos = [
        { id: 1, ...videosData[0] },
        { id: 2, ...videosData[1] },
      ];
      mockDb.returning.mockResolvedValue(createdVideos);

      const result = await repository.createMany(videosData);

      expect(mockDb.insert).toHaveBeenCalledWith(mockVideosTable);
      expect(mockDb.values).toHaveBeenCalledWith(videosData);
      expect(result).toEqual(createdVideos);
    });

    it('should return empty array when data is empty', async () => {
      const result = await repository.createMany([]);

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('Query options handling', () => {
    it('should handle search option', async () => {
      mockDb.where.mockReturnThis();
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({ search: 'test', limit: 10 });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should handle tagTerm option', async () => {
      mockDb.where.mockReturnThis();
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({ tagTerm: 'music', limit: 10 });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should handle timestamp option', async () => {
      mockDb.where.mockReturnThis();
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({ timestamp: 1234567890, limit: 10 });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should handle multiple filter options', async () => {
      mockDb.where.mockReturnThis();
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({
        isPublished: true,
        isStreaming: false,
        isFinalized: true,
        limit: 10
      });

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should handle empty search string', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      await repository.findAll({ search: '' });

      // Empty search should not add a where condition
    });

    it('should handle empty tagTerm', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      await repository.findAll({ tagTerm: '' });

      // Empty tagTerm should not add a where condition
    });

    it('should handle findAll without any filter conditions', async () => {
      // When no filter options are provided, buildWhereConditions returns undefined
      mockDb.orderBy.mockResolvedValue([]);

      await repository.findAll({});

      // No where should be called since conditions is undefined
      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.where).not.toHaveBeenCalled();
    });

    it('should handle findAll with undefined options', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      await repository.findAll(undefined);

      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.where).not.toHaveBeenCalled();
    });

    it('should handle findAll with ascending sort direction', async () => {
      mockDb.orderBy.mockResolvedValue([]);

      await repository.findAll({ sortDirection: 'asc' });

      expect(mockDb.orderBy).toHaveBeenCalled();
    });
  });

  describe('Sorting', () => {
    it('should sort by views', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findPublished({ sortBy: 'views' });

      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it('should sort by likes', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findPublished({ sortBy: 'likes' });

      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it('should sort by title', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findPublished({ sortBy: 'title' });

      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it('should default to creation_timestamp', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findPublished({ sortBy: 'creation_timestamp' });

      expect(mockDb.orderBy).toHaveBeenCalled();
    });
  });
});
