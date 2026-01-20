/**
 * Unit tests for database/repositories/reports-archive-comments.ts
 *
 * Tests the ReportsArchiveCommentsRepository interface implementations for archived comment report CRUD operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the schema imports first
vi.mock('@database/schemas/sqlite/reports-archive-comments.js', () => ({
  commentReportsArchive: {
    name: 'commentreportsarchives',
    archive_id: { name: 'archive_id' },
    report_id: { name: 'report_id' },
    timestamp: { name: 'timestamp' },
    comment_timestamp: { name: 'comment_timestamp' },
    video_id: { name: 'video_id' },
    comment_id: { name: 'comment_id' },
    email: { name: 'email' },
    type: { name: 'type' },
    message: { name: 'message' },
  },
}));

vi.mock('@database/schemas/postgres/reports-archive-comments.js', () => ({
  commentReportsArchive: {
    name: 'commentreportsarchives',
    archive_id: { name: 'archive_id' },
    report_id: { name: 'report_id' },
    timestamp: { name: 'timestamp' },
    comment_timestamp: { name: 'comment_timestamp' },
    video_id: { name: 'video_id' },
    comment_id: { name: 'comment_id' },
    email: { name: 'email' },
    type: { name: 'type' },
    message: { name: 'message' },
  },
}));

import { createReportsArchiveCommentsRepository, type IReportsArchiveCommentsRepository } from '@database/repositories/reports-archive-comments/index.js';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
  count: vi.fn(() => ({ type: 'count' })),
}));

describe('database/repositories/reports-archive-comments.ts', () => {
  let mockDb: any;
  let sqliteRepository: IReportsArchiveCommentsRepository<any, any>;
  let postgresRepository: IReportsArchiveCommentsRepository<any, any>;

  beforeEach(() => {
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockReturnThis(),
    };

    // Create repositories using factory function
    sqliteRepository = createReportsArchiveCommentsRepository('sqlite', mockDb);
    postgresRepository = createReportsArchiveCommentsRepository('postgres', mockDb);
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
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find archive by id', async () => {
          const mockArchive = { archive_id: 1 };
          mockDb.limit.mockResolvedValue([mockArchive]);

          const result = await repository().findById(1);

          expect(result).toEqual(mockArchive);
        });

        it('should return null when not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findById(999);

          expect(result).toBeNull();
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
        it('should return all archives without limit', async () => {
          const mockArchives = [{ archive_id: 1 }];
          mockDb.orderBy.mockResolvedValue(mockArchives);

          const result = await repository().findAll();

          expect(result).toEqual(mockArchives);
        });

        it('should apply limit when specified', async () => {
          mockDb.limit.mockResolvedValue([]);

          await repository().findAll({ limit: 10 });

          expect(mockDb.limit).toHaveBeenCalledWith(10);
        });
      });
    });
  });

  describe('findByVideoId', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find archives by video id', async () => {
          const mockArchives = [{ archive_id: 1 }];
          mockDb.limit.mockResolvedValue(mockArchives);

          const result = await repository().findByVideoId('v1');

          expect(mockDb.limit).toHaveBeenCalledWith(20); // default limit
          expect(result).toEqual(mockArchives);
        });
      });
    });
  });

  describe('findByCommentId', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find archives by comment id', async () => {
          const mockArchives = [{ archive_id: 1 }];
          mockDb.limit.mockResolvedValue(mockArchives);

          const result = await repository().findByCommentId(1);

          expect(mockDb.limit).toHaveBeenCalledWith(20); // default limit
          expect(result).toEqual(mockArchives);
        });
      });
    });
  });

  describe('findByReportId', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find archive by report id', async () => {
          const mockArchive = { archive_id: 1, report_id: 5 };
          mockDb.limit.mockResolvedValue([mockArchive]);

          const result = await repository().findByReportId(5);

          expect(result).toEqual(mockArchive);
        });

        it('should return null when report id not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findByReportId(999);

          expect(result).toBeNull();
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
        it('should return count of archives', async () => {
          mockDb.from.mockResolvedValue([{ count: 25 }]);

          const result = await repository().getCount();

          expect(result).toBe(25);
        });

        it('should return 0 when no archives', async () => {
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
        it('should create an archive record', async () => {
          const archiveData = { report_id: 1, timestamp: 1234567890, comment_timestamp: 1234567800, video_id: 'v1', comment_id: 1, email: 'test@example.com', type: 'spam', message: 'Test message' };
          const created = { archive_id: 1, ...archiveData };
          mockDb.returning.mockResolvedValue([created]);

          const result = await repository().create(archiveData);

          expect(result).toEqual(created);
        });

        it('should throw error when insert fails', async () => {
          mockDb.returning.mockResolvedValue([]);

          await expect(repository().create({ report_id: 1, timestamp: 1234567890, comment_timestamp: 1234567800, video_id: 'v1', comment_id: 1, email: 'test@example.com', type: 'spam', message: 'Test message' })).rejects.toThrow(
            'Failed to create comment report archive record'
          );
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
        it('should delete archive by id', async () => {
          mockDb.returning.mockResolvedValue([{ archive_id: 1 }]);

          const result = await repository().delete(1);

          expect(result).toBe(true);
        });

        it('should return false when archive not found', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().delete(999);

          expect(result).toBe(false);
        });
      });
    });
  });

  describe('deleteByVideoId', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should delete all archives for video', async () => {
          mockDb.returning.mockResolvedValue([{}, {}]);

          const result = await repository().deleteByVideoId('v1');

          expect(result).toBe(2);
        });
      });
    });
  });

  describe('deleteByCommentId', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should delete all archives for comment', async () => {
          mockDb.returning.mockResolvedValue([{}, {}, {}]);

          const result = await repository().deleteByCommentId(1);

          expect(result).toBe(3);
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
        it('should delete all archives and return count', async () => {
          mockDb.returning.mockResolvedValue([{}, {}, {}, {}]);

          const result = await repository().deleteAll();

          expect(result).toBe(4);
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
        it('should create multiple archives', async () => {
          const archivesData = [
            { report_id: 1, timestamp: 1234567890, comment_timestamp: 1234567800, video_id: 'v1', comment_id: 1, email: 'test1@example.com', type: 'spam', message: 'Test message 1' },
            { report_id: 2, timestamp: 1234567891, comment_timestamp: 1234567801, video_id: 'v2', comment_id: 2, email: 'test2@example.com', type: 'harassment', message: 'Test message 2' }
          ];
          const created = [
            { archive_id: 1, ...archivesData[0] },
            { archive_id: 2, ...archivesData[1] },
          ];
          mockDb.returning.mockResolvedValue(created);

          const result = await repository().createMany(archivesData);

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
