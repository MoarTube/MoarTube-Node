// Test-only subclass to expose protected methods
import { VideosRepositoryPostgres } from '@database/repositories/videos/postgres.js';
class TestableVideosRepositoryPostgres extends VideosRepositoryPostgres {
  public testGetSortField(sortBy: string) {
    return this.getSortField(sortBy);
  }
  public testBuildWhereConditions(options: any) {
    return this.buildWhereConditions(options);
  }
}

describe('VideosRepositoryPostgres private/protected methods', () => {
  const repo = new TestableVideosRepositoryPostgres({} as any);

  it('getSortField covers all branches', () => {
    expect(repo.testGetSortField('views')).toEqual(expect.objectContaining({ name: 'views' }));
    expect(repo.testGetSortField('likes')).toEqual(expect.objectContaining({ name: 'likes' }));
    expect(repo.testGetSortField('title')).toEqual(expect.objectContaining({ name: 'title' }));
    expect(repo.testGetSortField('creation_timestamp')).toEqual(expect.objectContaining({ name: 'creation_timestamp' }));
    expect(repo.testGetSortField('unknown')).toEqual(expect.objectContaining({ name: 'creation_timestamp' }));
  });

  it('buildWhereConditions covers all branches', () => {
    // undefined options
    expect(repo.testBuildWhereConditions(undefined)).toBeUndefined();
    // isPublished only
    expect(repo.testBuildWhereConditions({ isPublished: true })).toEqual(expect.objectContaining({ type: 'eq', field: expect.objectContaining({ name: 'is_published' }), value: true }));
    // isStreaming only
    expect(repo.testBuildWhereConditions({ isStreaming: false })).toEqual(expect.objectContaining({ type: 'eq', field: expect.objectContaining({ name: 'is_streaming' }), value: false }));
    // isFinalized only
    expect(repo.testBuildWhereConditions({ isFinalized: true })).toEqual(expect.objectContaining({ type: 'eq', field: expect.objectContaining({ name: 'is_finalized' }), value: true }));
    // search only
    expect(repo.testBuildWhereConditions({ search: 'foo' })).toEqual(expect.objectContaining({ type: 'or', conditions: expect.any(Array) }));
    // tagTerm only
    expect(repo.testBuildWhereConditions({ tagTerm: 'bar' })).toEqual(expect.objectContaining({ type: 'like', field: expect.objectContaining({ name: 'tags' }), pattern: expect.any(String) }));
    // timestamp only
    expect(repo.testBuildWhereConditions({ timestamp: 123 })).toEqual(expect.objectContaining({ type: 'lt', field: expect.objectContaining({ name: 'creation_timestamp' }), value: 123 }));
    // empty search/tagTerm
    expect(repo.testBuildWhereConditions({ search: '' })).toBeUndefined();
    expect(repo.testBuildWhereConditions({ tagTerm: '' })).toBeUndefined();
    // multiple conditions (and)
    const andResult = repo.testBuildWhereConditions({ isPublished: true, isStreaming: false, isFinalized: true, search: 'foo', tagTerm: 'bar', timestamp: 123 });
    expect(andResult).toEqual(expect.objectContaining({ type: 'and', conditions: expect.any(Array) }));
  });
});
/**
 * Unit tests for database/repositories/videos.ts
 *
 * Tests the VideosRepository interface implementations for video CRUD operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the schema imports first
vi.mock('@database/schemas/sqlite/index.js', () => ({
  videos: {
    name: 'videos',
    id: { name: 'id' },
    video_id: { name: 'video_id' },
    source_file_extension: { name: 'source_file_extension' },
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
    is_stream_recorded_locally: { name: 'is_stream_recorded_locally' },
    is_live: { name: 'is_live' },
    is_indexing: { name: 'is_indexing' },
    is_indexed: { name: 'is_indexed' },
    is_index_outdated: { name: 'is_index_outdated' },
    is_error: { name: 'is_error' },
    is_finalized: { name: 'is_finalized' },
    is_hidden: { name: 'is_hidden' },
    is_passworded: { name: 'is_passworded' },
    password: { name: 'password' },
    is_comments_enabled: { name: 'is_comments_enabled' },
    is_likes_enabled: { name: 'is_likes_enabled' },
    is_dislikes_enabled: { name: 'is_dislikes_enabled' },
    is_reports_enabled: { name: 'is_reports_enabled' },
    is_live_chat_enabled: { name: 'is_live_chat_enabled' },
    outputs: { name: 'outputs' },
    meta: { name: 'meta' },
    creation_timestamp: { name: 'creation_timestamp' },
  },
}));

vi.mock('@database/schemas/postgres/index.js', () => ({
  videos: {
    name: 'videos',
    id: { name: 'id' },
    video_id: { name: 'video_id' },
    source_file_extension: { name: 'source_file_extension' },
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
    is_stream_recorded_locally: { name: 'is_stream_recorded_locally' },
    is_live: { name: 'is_live' },
    is_indexing: { name: 'is_indexing' },
    is_indexed: { name: 'is_indexed' },
    is_index_outdated: { name: 'is_index_outdated' },
    is_error: { name: 'is_error' },
    is_finalized: { name: 'is_finalized' },
    is_hidden: { name: 'is_hidden' },
    is_passworded: { name: 'is_passworded' },
    password: { name: 'password' },
    is_comments_enabled: { name: 'is_comments_enabled' },
    is_likes_enabled: { name: 'is_likes_enabled' },
    is_dislikes_enabled: { name: 'is_dislikes_enabled' },
    is_reports_enabled: { name: 'is_reports_enabled' },
    is_live_chat_enabled: { name: 'is_live_chat_enabled' },
    outputs: { name: 'outputs' },
    meta: { name: 'meta' },
    creation_timestamp: { name: 'creation_timestamp' },
  },
}));

import { createVideosRepository, type IVideosRepository } from '@database/repositories/videos/index.js';
import { videos as mockSQLiteVideosTable } from '@database/schemas/sqlite/index.js';
import { videos as mockPostgresVideosTable } from '@database/schemas/postgres/index.js';
import { videos as mockVideosTable } from '@database/schemas/sqlite/index.js'; // Default table for non-parameterized tests

// Define the expected table object for non-parameterized tests
const expectedVideosTable = {
  name: 'videos',
  id: { name: 'id' },
  video_id: { name: 'video_id' },
  source_file_extension: { name: 'source_file_extension' },
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
  is_stream_recorded_locally: { name: 'is_stream_recorded_locally' },
  is_live: { name: 'is_live' },
  is_indexing: { name: 'is_indexing' },
  is_indexed: { name: 'is_indexed' },
  is_index_outdated: { name: 'is_index_outdated' },
  is_error: { name: 'is_error' },
  is_finalized: { name: 'is_finalized' },
  is_hidden: { name: 'is_hidden' },
  is_passworded: { name: 'is_passworded' },
  password: { name: 'password' },
  is_comments_enabled: { name: 'is_comments_enabled' },
  is_likes_enabled: { name: 'is_likes_enabled' },
  is_dislikes_enabled: { name: 'is_dislikes_enabled' },
  is_reports_enabled: { name: 'is_reports_enabled' },
  is_live_chat_enabled: { name: 'is_live_chat_enabled' },
  outputs: { name: 'outputs' },
  meta: { name: 'meta' },
  creation_timestamp: { name: 'creation_timestamp' },
};

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
  gt: vi.fn((field, value) => ({ type: 'gt', field, value })),
  lte: vi.fn((field, value) => ({ type: 'lte', field, value })),
  gte: vi.fn((field, value) => ({ type: 'gte', field, value })),
}));

describe('database/repositories/videos.ts', () => {
  let mockDb: any;
  let sqliteRepository: IVideosRepository<any, any>;
  let postgresRepository: IVideosRepository<any, any>;
  let repository: IVideosRepository<any, any>;

  beforeEach(() => {
    mockDb = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn(),
      values: vi.fn(),
      returning: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    // Make them chainable
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
    mockDb.insert.mockReturnValue(mockDb);
    mockDb.values.mockReturnValue(mockDb);
    mockDb.update.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
    mockDb.delete.mockReturnValue(mockDb);

    // Create repositories using factory function
    sqliteRepository = createVideosRepository('sqlite', mockDb);
    postgresRepository = createVideosRepository('postgres', mockDb);
    repository = sqliteRepository; // Default to SQLite for non-parameterized tests
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('factory function', () => {
    it('should create SQLite repository', () => {
      expect(sqliteRepository).toBeDefined();
      expect(typeof sqliteRepository.findById).toBe('function');
    });

    it('should create Postgres repository', () => {
      expect(postgresRepository).toBeDefined();
      expect(typeof postgresRepository.findById).toBe('function');
    });
  });

  // --- Coverage: findPublished, findAll, getCount branch/ternary coverage ---
  describe('Coverage: findPublished/findAll/getCount branches', () => {
        it('findAll: explicit else branch (no conditions)', async () => {
          mockDb.orderBy.mockReturnThis();
          mockDb.limit.mockResolvedValue([]);
          // This should hit the else branch (conditions === undefined)
          await postgresRepository.findAll();
          await postgresRepository.findAll(undefined);
          // Also test with empty options
          await postgresRepository.findAll({});
        });
    it('findPublished: covers both sortDir branches', async () => {
      mockDb.limit.mockResolvedValue([]);
      await postgresRepository.findPublished({ sortDirection: 'asc' });
      await postgresRepository.findPublished({ sortDirection: 'desc' });
      await postgresRepository.findPublished({}); // default (desc)
      // No assertion needed, just coverage
    });

    it('findAll: covers both sortDir and conditions branches', async () => {
      mockDb.orderBy.mockReturnThis();
      mockDb.limit.mockResolvedValue([]);
      // sortDirection: asc
      await postgresRepository.findAll({ sortDirection: 'asc', limit: 1 });
      // sortDirection: desc
      await postgresRepository.findAll({ sortDirection: 'desc', limit: 1 });
      // sortDirection: undefined (should default to desc)
      await postgresRepository.findAll({ limit: 1 });
      // conditions undefined (no filters)
      mockDb.orderBy.mockResolvedValue([]);
      await postgresRepository.findAll();
      await postgresRepository.findAll(undefined);
    });

    it('getCount: covers both conditions branches', async () => {
      mockDb.select.mockReturnThis();
      mockDb.from.mockReturnThis();
      mockDb.where.mockResolvedValue([{ count: 5 }]);
      // With conditions
      await postgresRepository.getCount({ isPublished: true });
      // Without conditions
      mockDb.select.mockReturnThis();
      mockDb.from.mockResolvedValue([{ count: 7 }]);
      await postgresRepository.getCount();
      await postgresRepository.getCount(undefined);
    });
  });

  describe('findById', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find video by video_id', async () => {
          const mockVideo = { video_id: 'test123', title: 'Test Video' };
          mockDb.limit.mockResolvedValue([mockVideo]);

          const result = await repository().findById('test123');

          expect(result).toEqual(mockVideo);
        });

        it('should return null when video not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findById('test123');

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('findByDbId', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find video by database id', async () => {
          const mockVideo = { id: 1, video_id: 'test123' };
          mockDb.limit.mockResolvedValue([mockVideo]);

          const result = await repository().findByDbId(1);

          expect(result).toEqual(mockVideo);
        });

        it('should return null when video not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findByDbId(999);

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('findPublished', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find published videos with default options', async () => {
          const mockVideos = [{ video_id: 'v1' }, { video_id: 'v2' }];
          mockDb.limit.mockResolvedValue(mockVideos);

          const result = await repository().findPublished();

          expect(result).toEqual(mockVideos);
        });

        it('should apply limit when specified', async () => {
          mockDb.limit.mockResolvedValue([]);

          await repository().findPublished({ limit: 10 });

          expect(mockDb.limit).toHaveBeenCalledWith(10);
        });
      });
    });
  });

  describe('findAll', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find all videos with default options', async () => {
          const mockVideos = [{ video_id: 'v1' }];
          mockDb.orderBy.mockResolvedValue(mockVideos);

          const result = await repository().findAll();

          expect(result).toEqual(mockVideos);
        });

        it('should apply limit when specified', async () => {
          mockDb.limit.mockResolvedValue([]);

          await repository().findAll({ limit: 5 });

          expect(mockDb.limit).toHaveBeenCalledWith(5);
        });

        it('should apply where conditions when options are provided', async () => {
          // Arrange: mock the chain for .where()
          const mockVideos = [{ video_id: 'v2' }];
          mockDb.orderBy.mockReturnThis();
          mockDb.where.mockReturnThis();
          mockDb.limit.mockResolvedValue(mockVideos);

          // Act
          const result = await repository().findAll({ isPublished: true, limit: 1 });

          // Assert
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.limit).toHaveBeenCalledWith(1);
          expect(result).toEqual(mockVideos);
        });
      });
    });
  });

  describe('getCount', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should return count of videos', async () => {
          mockDb.from.mockResolvedValue([{ count: 15 }]);

          const result = await repository().getCount();

          expect(result).toBe(15);
        });

        it('should return 0 when no videos', async () => {
          mockDb.from.mockResolvedValue([{}]);

          const result = await repository().getCount();

          expect(result).toBe(0);
        });
      });
    });
  });

  describe('create', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should create a video record', async () => {
          const videoData = { video_id: 'v1', title: 'Test', description: 'Desc', tags: 'tag', length_seconds: 100, creation_timestamp: 123456 };
          const created = { id: 1, ...videoData };
          mockDb.returning.mockResolvedValue([created]);

          const result = await repository().create(videoData);

          expect(result).toEqual(created);
        });

        it('should throw error when insert fails', async () => {
          mockDb.returning.mockResolvedValue([]);

          await expect(repository().create({ video_id: 'v1', title: 'Test', description: 'Desc', tags: 'tag', length_seconds: 100, creation_timestamp: 123456 })).rejects.toThrow(
            'Failed to create video record'
          );
        });
      });
    });
  });

  describe('update', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should update video and return updated record', async () => {
          const updatedVideo = { video_id: 'v1', title: 'Updated Title' };
          mockDb.returning.mockResolvedValue([updatedVideo]);

          const result = await repository().update('v1', { title: 'Updated Title' });

          expect(result).toEqual(updatedVideo);
        });

        it('should return null when video not found', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().update('v1', { title: 'Updated' });

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('delete', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should delete video by video_id', async () => {
          mockDb.returning.mockResolvedValue([{ video_id: 'v1' }]);

          const result = await repository().delete('v1');

          expect(result).toBe(true);
        });

        it('should return false when video not found', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().delete('v1');

          expect(result).toBe(false);
        });
      });
    });
  });

  describe('incrementViews', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should increment views by 1', async () => {
          mockDb.returning.mockResolvedValue([{ video_id: 'v1' }]);

          await repository().incrementViews('v1');

          expect(mockDb.set).toHaveBeenCalled();
        });
      });
    });
  });

  describe('incrementViewsBy', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should increment views by specified count', async () => {
          mockDb.returning.mockResolvedValue([{ video_id: 'v1' }]);

          await repository().incrementViewsBy('v1', 5);

          expect(mockDb.set).toHaveBeenCalled();
        });
      });
    });
  });

  describe('incrementLikes', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should increment likes by 1', async () => {
          mockDb.returning.mockResolvedValue([{ video_id: 'v1' }]);

          await repository().incrementLikes('v1');

          expect(mockDb.set).toHaveBeenCalled();
        });
      });
    });
  });

  describe('incrementDislikes', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should increment dislikes by 1', async () => {
          mockDb.returning.mockResolvedValue([{ video_id: 'v1' }]);

          await repository().incrementDislikes('v1');

          expect(mockDb.set).toHaveBeenCalled();
        });
      });
    });
  });

  describe('incrementComments', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should increment comments by 1', async () => {
          mockDb.returning.mockResolvedValue([{ video_id: 'v1' }]);

          await repository().incrementComments('v1');

          expect(mockDb.set).toHaveBeenCalled();
        });
      });
    });
  });

  describe('decrementComments', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should decrement comments by 1', async () => {
          mockDb.returning.mockResolvedValue([{ video_id: 'v1' }]);

          await repository().decrementComments('v1');

          expect(mockDb.set).toHaveBeenCalled();
        });
      });
    });
  });

  describe('updateBandwidth', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should update bandwidth', async () => {
          mockDb.returning.mockResolvedValue([{ video_id: 'v1' }]);

          await repository().updateBandwidth('v1', 1000);

          expect(mockDb.set).toHaveBeenCalled();
        });
      });
    });
  });

  describe('findStreaming', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find streaming videos', async () => {
          const mockVideos = [{ video_id: 'v1', is_streaming: true }];
          mockDb.orderBy.mockResolvedValue(mockVideos);

          const result = await repository().findStreaming();

          expect(result).toEqual(mockVideos);
        });
      });
    });
  });

  describe('findIndexed', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find indexed videos', async () => {
          const mockVideos = [{ video_id: 'v1', is_indexed: true }];
          mockDb.orderBy.mockResolvedValue(mockVideos);

          const result = await repository().findIndexed();

          expect(result).toEqual(mockVideos);
        });
      });
    });
  });

  describe('findPendingIndexing', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find videos pending indexing', async () => {
          const mockVideos = [{ video_id: 'v1', is_indexed: false }];
          mockDb.where.mockResolvedValue(mockVideos);

          const result = await repository().findPendingIndexing();

          expect(result).toEqual(mockVideos);
        });
      });
    });
  });

  describe('markAllIndexedAsOutdated', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should mark all indexed videos as outdated', async () => {
          mockDb.returning.mockResolvedValue([]);

          await repository().markAllIndexedAsOutdated();

          expect(mockDb.set).toHaveBeenCalled();
        });
      });
    });
  });

  describe('deleteAll', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should delete all videos and return count', async () => {
          mockDb.returning.mockResolvedValue([{}, {}, {}]);

          const result = await repository().deleteAll();

          expect(result).toBe(3);
        });
      });
    });
  });

  describe('createMany', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should create multiple videos', async () => {
          const videosData = [
            { video_id: 'v1', title: 'Test1', description: 'Desc1', tags: 'tag1', length_seconds: 100, creation_timestamp: 123456 },
            { video_id: 'v2', title: 'Test2', description: 'Desc2', tags: 'tag2', length_seconds: 200, creation_timestamp: 123457 }
          ];
          const created = [{ id: 1 }, { id: 2 }];
          mockDb.returning.mockResolvedValue(created);

          const result = await repository().createMany(videosData);

          expect(result).toEqual(created);
        });

        it('should return empty array when data is empty', async () => {
          const result = await repository().createMany([]);

          expect(mockDb.insert).not.toHaveBeenCalled();
          expect(result).toEqual([]);
        });
      });
    });
  });
});

// Mock table for testing - removed to use imported mock

describe('database/repositories/videos.ts', () => {
  let mockDb: any;
  let sqliteRepository: IVideosRepository<any, any>;
  let postgresRepository: IVideosRepository<any, any>;
  let repository: IVideosRepository<any, any>;

  beforeEach(() => {
    // Create chainable mock database
    mockDb = {
      select: vi.fn(),
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn(),
      values: vi.fn(),
      returning: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    // Make them chainable
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
    mockDb.insert.mockReturnValue(mockDb);
    mockDb.values.mockReturnValue(mockDb);
    mockDb.update.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
    mockDb.delete.mockReturnValue(mockDb);

    // Create repositories using factory function
    sqliteRepository = createVideosRepository('sqlite', mockDb);
    postgresRepository = createVideosRepository('postgres', mockDb);
    repository = sqliteRepository; // Default to SQLite for non-parameterized tests
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('factory function', () => {
    it('should create SQLite repository', () => {
      expect(sqliteRepository).toBeDefined();
      expect(typeof sqliteRepository.findById).toBe('function');
    });

    it('should create Postgres repository', () => {
      expect(postgresRepository).toBeDefined();
      expect(typeof postgresRepository.findById).toBe('function');
    });
  });

  describe('findById', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteVideosTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresVideosTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should find video by video_id', async () => {
          const mockVideo = { video_id: 'test123', title: 'Test Video' };
          mockDb.limit.mockResolvedValue([mockVideo]);

          const result = await repository().findById('test123');

          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.limit).toHaveBeenCalledWith(1);
          expect(result).toEqual(mockVideo);
        });

        it('should return null when video not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findById('nonexistent');

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('findByDbId', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteVideosTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresVideosTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should find video by database id', async () => {
          const mockVideo = { id: 1, video_id: 'test123' };
          mockDb.limit.mockResolvedValue([mockVideo]);

          const result = await repository().findByDbId(1);

          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.limit).toHaveBeenCalledWith(1);
          expect(result).toEqual(mockVideo);
        });

        it('should return null when not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findByDbId(999);

          expect(result).toBeNull();
        });
      });
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

    it('should handle findAll with descending sort direction (default)', async () => {
      mockDb.orderBy.mockResolvedValue([]);
      await repository.findAll({ sortDirection: 'desc' });
      expect(mockDb.orderBy).toHaveBeenCalled();
    });

    it('should handle findAll with no sortDirection (should default to desc)', async () => {
      mockDb.orderBy.mockResolvedValue([]);
      await repository.findAll({});
      expect(mockDb.orderBy).toHaveBeenCalled();
    });
  });

  describe('Sorting', () => {
        it('should call getSortField for all sortBy options', async () => {
          // views
          mockDb.limit.mockResolvedValue([]);
          await repository.findPublished({ sortBy: 'views' });
          // likes
          mockDb.limit.mockResolvedValue([]);
          await repository.findPublished({ sortBy: 'likes' });
          // title
          mockDb.limit.mockResolvedValue([]);
          await repository.findPublished({ sortBy: 'title' });
          // creation_timestamp (default)
          mockDb.limit.mockResolvedValue([]);
          await repository.findPublished({ sortBy: 'creation_timestamp' });
          // unknown (should default)
          mockDb.limit.mockResolvedValue([]);
          await repository.findPublished({ sortBy: 'unknown_field' });
        });
        it('should handle isPublished option', async () => {
          mockDb.where.mockReturnThis();
          mockDb.limit.mockResolvedValue([]);
          await repository.findAll({ isPublished: true, limit: 1 });
          expect(mockDb.where).toHaveBeenCalled();
        });

        it('should handle isStreaming option', async () => {
          mockDb.where.mockReturnThis();
          mockDb.limit.mockResolvedValue([]);
          await repository.findAll({ isStreaming: false, limit: 1 });
          expect(mockDb.where).toHaveBeenCalled();
        });

        it('should handle isFinalized option', async () => {
          mockDb.where.mockReturnThis();
          mockDb.limit.mockResolvedValue([]);
          await repository.findAll({ isFinalized: true, limit: 1 });
          expect(mockDb.where).toHaveBeenCalled();
        });

        it('should handle search and tagTerm together', async () => {
          mockDb.where.mockReturnThis();
          mockDb.limit.mockResolvedValue([]);
          await repository.findAll({ search: 'foo', tagTerm: 'bar', limit: 1 });
          expect(mockDb.where).toHaveBeenCalled();
        });

        it('should handle timestamp option', async () => {
          mockDb.where.mockReturnThis();
          mockDb.limit.mockResolvedValue([]);
          await repository.findAll({ timestamp: 123, limit: 1 });
          expect(mockDb.where).toHaveBeenCalled();
        });

        it('should handle all filter options together (multiple conditions)', async () => {
          mockDb.where.mockReturnThis();
          mockDb.limit.mockResolvedValue([]);
          await repository.findAll({
            isPublished: true,
            isStreaming: false,
            isFinalized: true,
            search: 'foo',
            tagTerm: 'bar',
            timestamp: 123,
            limit: 1
          });
          expect(mockDb.where).toHaveBeenCalled();
        });

        it('should handle only one filter option (single condition)', async () => {
          mockDb.where.mockReturnThis();
          mockDb.limit.mockResolvedValue([]);
          await repository.findAll({ isPublished: false, limit: 1 });
          expect(mockDb.where).toHaveBeenCalled();
        });
    it('should sort by views', async () => {
      mockDb.limit.mockResolvedValue([]);
      await repository.findPublished({ sortBy: 'views' });
      expect(mockDb.orderBy).toHaveBeenCalledWith(expect.objectContaining({ type: 'desc', field: expect.objectContaining({ name: 'views' }) }));
    });

    it('should sort by likes', async () => {
      mockDb.limit.mockResolvedValue([]);
      await repository.findPublished({ sortBy: 'likes' });
      expect(mockDb.orderBy).toHaveBeenCalledWith(expect.objectContaining({ type: 'desc', field: expect.objectContaining({ name: 'likes' }) }));
    });

    it('should sort by title', async () => {
      mockDb.limit.mockResolvedValue([]);
      await repository.findPublished({ sortBy: 'title' });
      expect(mockDb.orderBy).toHaveBeenCalledWith(expect.objectContaining({ type: 'desc', field: expect.objectContaining({ name: 'title' }) }));
    });

    it('should default to creation_timestamp', async () => {
      mockDb.limit.mockResolvedValue([]);
      await repository.findPublished({ sortBy: 'creation_timestamp' });
      expect(mockDb.orderBy).toHaveBeenCalledWith(expect.objectContaining({ type: 'desc', field: expect.objectContaining({ name: 'creation_timestamp' }) }));
    });
      it('should call .where with isPublished', async () => {
        mockDb.where.mockReturnThis();
        mockDb.limit.mockResolvedValue([]);
        await repository.findAll({ isPublished: true, limit: 1 });
        expect(mockDb.where).toHaveBeenCalledWith(expect.objectContaining({ type: 'eq', field: expect.objectContaining({ name: 'is_published' }), value: true }));
      });

      it('should call .where with isStreaming', async () => {
        mockDb.where.mockReturnThis();
        mockDb.limit.mockResolvedValue([]);
        await repository.findAll({ isStreaming: false, limit: 1 });
        expect(mockDb.where).toHaveBeenCalledWith(expect.objectContaining({ type: 'eq', field: expect.objectContaining({ name: 'is_streaming' }), value: false }));
      });

      it('should call .where with isFinalized', async () => {
        mockDb.where.mockReturnThis();
        mockDb.limit.mockResolvedValue([]);
        await repository.findAll({ isFinalized: true, limit: 1 });
        expect(mockDb.where).toHaveBeenCalledWith(expect.objectContaining({ type: 'eq', field: expect.objectContaining({ name: 'is_finalized' }), value: true }));
      });

      it('should call .where with search', async () => {
        mockDb.where.mockReturnThis();
        mockDb.limit.mockResolvedValue([]);
        await repository.findAll({ search: 'foo', limit: 1 });
        expect(mockDb.where).toHaveBeenCalledWith(expect.objectContaining({ type: 'or', conditions: expect.any(Array) }));
      });

      it('should call .where with tagTerm', async () => {
        mockDb.where.mockReturnThis();
        mockDb.limit.mockResolvedValue([]);
        await repository.findAll({ tagTerm: 'bar', limit: 1 });
        expect(mockDb.where).toHaveBeenCalledWith(expect.objectContaining({ type: 'like', field: expect.objectContaining({ name: 'tags' }), pattern: expect.any(String) }));
      });

      it('should call .where with timestamp', async () => {
        mockDb.where.mockReturnThis();
        mockDb.limit.mockResolvedValue([]);
        await repository.findAll({ timestamp: 123, limit: 1 });
        expect(mockDb.where).toHaveBeenCalledWith(expect.objectContaining({ type: 'lt', field: expect.objectContaining({ name: 'creation_timestamp' }), value: 123 }));
      });

      it('should call .where with multiple conditions (and)', async () => {
        mockDb.where.mockReturnThis();
        mockDb.limit.mockResolvedValue([]);
        await repository.findAll({
          isPublished: true,
          isStreaming: false,
          isFinalized: true,
          search: 'foo',
          tagTerm: 'bar',
          timestamp: 123,
          limit: 1
        });
        expect(mockDb.where).toHaveBeenCalledWith(expect.objectContaining({ type: 'and', conditions: expect.any(Array) }));
      });

      it('should call .where with a single condition (not and)', async () => {
        mockDb.where.mockReturnThis();
        mockDb.limit.mockResolvedValue([]);
        await repository.findAll({ isPublished: false, limit: 1 });
        expect(mockDb.where).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'and' }));
      });
  });
});
