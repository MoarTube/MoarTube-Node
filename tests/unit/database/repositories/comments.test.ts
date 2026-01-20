/**
 * Unit tests for database/repositories/comments.ts
 *
 * Tests the CommentsRepository interface implementations which provide CRUD operations
 * and specialized queries for comment records.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the schema imports first
vi.mock('@database/schemas/sqlite/index.js', () => ({
  comments: {
    name: 'comments',
    comment_id: { name: 'comment_id' },
    video_id: { name: 'video_id' },
    timestamp: { name: 'timestamp' },
    comment_plain_text_sanitized: { name: 'comment_plain_text_sanitized' },
  },
}));

vi.mock('@database/schemas/postgres/index.js', () => ({
  comments: {
    name: 'comments',
    comment_id: { name: 'comment_id' },
    video_id: { name: 'video_id' },
    timestamp: { name: 'timestamp' },
    comment_plain_text_sanitized: { name: 'comment_plain_text_sanitized' },
  },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
  and: vi.fn((...conditions) => ({ type: 'and', conditions })),
  gt: vi.fn((field, value) => ({ type: 'gt', field, value })),
  lt: vi.fn((field, value) => ({ type: 'lt', field, value })),
  like: vi.fn((field, pattern) => ({ type: 'like', field, pattern })),
  count: vi.fn(() => ({ type: 'count' })),
}));

import { createCommentsRepository, type ICommentsRepository } from '@database/repositories/comments/index.js';
import { comments as mockSQLiteCommentsTable } from '@database/schemas/sqlite/index.js';
import { comments as mockPostgresCommentsTable } from '@database/schemas/postgres/index.js';

describe('database/repositories/comments.ts', () => {
  let mockDb: any;
  let sqliteRepository: ICommentsRepository<any, any>;
  let postgresRepository: ICommentsRepository<any, any>;

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

    // Create repositories using factory function
    sqliteRepository = createCommentsRepository('sqlite', mockDb);
    postgresRepository = createCommentsRepository('postgres', mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('factory function', () => {
    it('should create SQLite repository with database and table', () => {
      expect(sqliteRepository).toBeDefined();
      expect(typeof sqliteRepository.findById).toBe('function');
    });

    it('should create Postgres repository with database and table', () => {
      expect(postgresRepository).toBeDefined();
      expect(typeof postgresRepository.findById).toBe('function');
    });
  });

  describe('findById', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should find comment by videoId, commentId, and timestamp', async () => {
          const mockComment = { comment_id: 1, video_id: 'v1', timestamp: 12345 };
          mockDb.limit.mockResolvedValue([mockComment]);

          const result = await repository().findById('v1', 1, 12345);

          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.limit).toHaveBeenCalledWith(1);
          expect(result).toEqual(mockComment);
        });

        it('should return null when comment not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findById('v1', 999, 12345);

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('findByVideoId', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should find all comments for a video', async () => {
          const mockComments = [
            { comment_id: 1, video_id: 'v1' },
            { comment_id: 2, video_id: 'v1' },
          ];
          mockDb.orderBy.mockResolvedValue(mockComments);

          const result = await repository().findByVideoId('v1');

          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.orderBy).toHaveBeenCalled();
          expect(result).toEqual(mockComments);
        });

        it('should return empty array when no comments', async () => {
          mockDb.orderBy.mockResolvedValue([]);

          const result = await repository().findByVideoId('v1');

          expect(result).toEqual([]);
        });
      });
    });
  });

  describe('findByVideoIdWithTimestampFilter', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should find comments before timestamp in descending order', async () => {
          const mockComments = [{ comment_id: 1 }];
          mockDb.orderBy.mockResolvedValue(mockComments);

          const result = await repository().findByVideoIdWithTimestampFilter(
            'v1',
            'before',
            'descending',
            12345
          );

          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.orderBy).toHaveBeenCalled();
          expect(result).toEqual(mockComments);
        });

        it('should find comments after timestamp in ascending order', async () => {
          const mockComments = [{ comment_id: 2 }];
          mockDb.orderBy.mockResolvedValue(mockComments);

          const result = await repository().findByVideoIdWithTimestampFilter(
            'v1',
            'after',
            'ascending',
            12345
          );

          expect(result).toEqual(mockComments);
        });
      });
    });
  });

  describe('countByVideoId', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should return count of comments for a video', async () => {
          mockDb.where.mockResolvedValue([{ count: 10 }]);

          const result = await repository().countByVideoId('v1');

          expect(result).toBe(10);
        });

        it('should return 0 when no comments', async () => {
          mockDb.where.mockResolvedValue([{}]);

          const result = await repository().countByVideoId('v1');

          expect(result).toBe(0);
        });
      });
    });
  });

  describe('findAll', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should return all comments', async () => {
          const mockComments = [{ comment_id: 1 }, { comment_id: 2 }];
          mockDb.from.mockResolvedValue(mockComments);

          const result = await repository().findAll();

          expect(mockDb.select).toHaveBeenCalled();
          expect(result).toEqual(mockComments);
        });
      });
    });
  });

  describe('create', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should create a comment record', async () => {
          const commentData = { video_id: 'v1', comment_plain_text_sanitized: 'Test' };
          const createdComment = { id: 1, ...commentData };
          mockDb.returning.mockResolvedValue([createdComment]);

          const result = await repository().create(commentData);

          expect(mockDb.insert).toHaveBeenCalledWith(table);
          expect(mockDb.values).toHaveBeenCalledWith(commentData);
          expect(result).toEqual(createdComment);
        });

        it('should throw error when insert fails', async () => {
          mockDb.returning.mockResolvedValue([]);

          await expect(repository().create({ video_id: 'v1' })).rejects.toThrow(
            'Failed to create comment record'
          );
        });
      });
    });
  });

  describe('update', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should update comment by id', async () => {
          const updatedComment = { comment_id: 1, comment_plain_text_sanitized: 'Updated' };
          mockDb.returning.mockResolvedValue([updatedComment]);

          const result = await repository().update(1, { comment_plain_text_sanitized: 'Updated' });

          expect(mockDb.update).toHaveBeenCalledWith(table);
          expect(mockDb.set).toHaveBeenCalledWith({ comment_plain_text_sanitized: 'Updated' });
          expect(result).toEqual(updatedComment);
        });

        it('should return null when comment not found', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().update(999, { comment_plain_text_sanitized: 'New' });

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('delete', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should delete comment by videoId, commentId, and timestamp', async () => {
          mockDb.returning.mockResolvedValue([{ comment_id: 1 }]);

          const result = await repository().delete('v1', 1, 12345);

          expect(mockDb.delete).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
          expect(result).toBe(true);
        });

        it('should return false when comment not found', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().delete('v1', 999, 12345);

          expect(result).toBe(false);
        });
      });
    });
  });

  describe('deleteByVideoId', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should delete all comments for a video', async () => {
          mockDb.returning.mockResolvedValue([{}, {}, {}]);

          const result = await repository().deleteByVideoId('v1');

          expect(mockDb.delete).toHaveBeenCalledWith(table);
          expect(result).toBe(3);
        });

        it('should return 0 when no comments to delete', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().deleteByVideoId('v1');

          expect(result).toBe(0);
        });
      });
    });
  });

  describe('findByVideoIdAndTimestamp', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should find comment by videoId and timestamp', async () => {
          const mockComment = { video_id: 'v1', timestamp: 12345 };
          mockDb.limit.mockResolvedValue([mockComment]);

          const result = await repository().findByVideoIdAndTimestamp('v1', 12345);

          expect(mockDb.where).toHaveBeenCalled();
          expect(result).toEqual(mockComment);
        });

        it('should return null when not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findByVideoIdAndTimestamp('v1', 99999);

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('countAll', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should return total count of all comments', async () => {
          mockDb.from.mockResolvedValue([{ count: 100 }]);

          const result = await repository().countAll();

          expect(result).toBe(100);
        });

        it('should return 0 when no comments exist', async () => {
          mockDb.from.mockResolvedValue([{}]);

          const result = await repository().countAll();

          expect(result).toBe(0);
        });
      });
    });
  });

  describe('countNewerThan', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should count comments newer than timestamp', async () => {
          mockDb.where.mockResolvedValue([{ count: 5 }]);

          const result = await repository().countNewerThan(12345);

          expect(mockDb.where).toHaveBeenCalled();
          expect(result).toBe(5);
        });

        it('should return 0 when no newer comments', async () => {
          mockDb.where.mockResolvedValue([{}]);

          const result = await repository().countNewerThan(99999);

          expect(result).toBe(0);
        });
      });
    });
  });

  describe('search', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should search comments with all filters', async () => {
          const mockComments = [{ comment_id: 1 }];
          mockDb.limit.mockResolvedValue(mockComments);

          const result = await repository().search(10, 'descending', 99999, 'v1', 'test');

          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.orderBy).toHaveBeenCalled();
          expect(mockDb.limit).toHaveBeenCalledWith(10);
          expect(result).toEqual(mockComments);
        });

        it('should search without videoId filter', async () => {
          mockDb.limit.mockResolvedValue([]);

          await repository().search(10, 'ascending', 99999, undefined, 'test');

          expect(mockDb.limit).toHaveBeenCalledWith(10);
        });

        it('should search without searchTerm filter', async () => {
          mockDb.limit.mockResolvedValue([]);

          await repository().search(10, 'descending', 99999, 'v1');

          expect(mockDb.limit).toHaveBeenCalledWith(10);
        });

        it('should search with ascending sort', async () => {
          mockDb.limit.mockResolvedValue([]);

          await repository().search(10, 'ascending', 99999);

          expect(mockDb.orderBy).toHaveBeenCalled();
        });

        it('should search with no conditions and use default sort', async () => {
          mockDb.limit.mockResolvedValue([]);

          // When no videoId or searchTerm, only timestamp condition is added
          await repository().search(10, 'other', 99999);

          expect(mockDb.orderBy).toHaveBeenCalled();
        });
      });
    });
  });

  describe('deleteAll', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should delete all comments and return count', async () => {
          mockDb.returning.mockResolvedValue([{}, {}, {}, {}, {}]);

          const result = await repository().deleteAll();

          expect(mockDb.delete).toHaveBeenCalledWith(table);
          expect(result).toBe(5);
        });

        it('should return 0 when no comments to delete', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().deleteAll();

          expect(result).toBe(0);
        });
      });
    });
  });

  describe('createMany', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteCommentsTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresCommentsTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should create multiple comments', async () => {
          const commentsData = [
            { video_id: 'v1', comment_plain_text_sanitized: 'C1' },
            { video_id: 'v1', comment_plain_text_sanitized: 'C2' },
          ];
          const createdComments = [
            { id: 1, ...commentsData[0] },
            { id: 2, ...commentsData[1] },
          ];
          mockDb.returning.mockResolvedValue(createdComments);

          const result = await repository().createMany(commentsData);

          expect(mockDb.insert).toHaveBeenCalledWith(table);
          expect(mockDb.values).toHaveBeenCalledWith(commentsData);
          expect(result).toEqual(createdComments);
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
