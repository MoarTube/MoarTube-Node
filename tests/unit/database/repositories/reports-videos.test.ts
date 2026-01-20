/**
 * Unit tests for database/repositories/reports-videos.ts
 *
 * Tests the ReportsVideosRepository interface implementations for video report CRUD operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the schema imports first
vi.mock('@database/schemas/sqlite/reports-videos.js', () => ({
  videoReports: {
    name: 'videoreports',
    report_id: { name: 'report_id' },
    timestamp: { name: 'timestamp' },
    video_timestamp: { name: 'video_timestamp' },
    video_id: { name: 'video_id' },
    email: { name: 'email' },
    type: { name: 'type' },
    message: { name: 'message' },
  },
}));

vi.mock('@database/schemas/postgres/reports-videos.js', () => ({
  videoReports: {
    name: 'videoreports',
    report_id: { name: 'report_id' },
    timestamp: { name: 'timestamp' },
    video_timestamp: { name: 'video_timestamp' },
    video_id: { name: 'video_id' },
    email: { name: 'email' },
    type: { name: 'type' },
    message: { name: 'message' },
  },
}));

import { createReportsVideosRepository, type IReportsVideosRepository } from '@database/repositories/reports-videos/index.js';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
  count: vi.fn(() => ({ type: 'count' })),
  gt: vi.fn((field, value) => ({ type: 'gt', field, value })),
}));

describe('database/repositories/reports-videos.ts', () => {
  let mockDb: any;
  let sqliteRepository: IReportsVideosRepository<any, any>;
  let postgresRepository: IReportsVideosRepository<any, any>;

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
    sqliteRepository = createReportsVideosRepository('sqlite', mockDb);
    postgresRepository = createReportsVideosRepository('postgres', mockDb);
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
        it('should find report by id', async () => {
          const mockReport = { report_id: 1 };
          mockDb.limit.mockResolvedValue([mockReport]);

          const result = await repository().findById(1);

          expect(result).toEqual(mockReport);
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
        it('should return all reports without limit', async () => {
          const mockReports = [{ report_id: 1 }];
          mockDb.orderBy.mockResolvedValue(mockReports);

          const result = await repository().findAll();

          expect(result).toEqual(mockReports);
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
        it('should find reports by video id with default limit', async () => {
          const mockReports = [{ report_id: 1 }];
          mockDb.limit.mockResolvedValue(mockReports);

          const result = await repository().findByVideoId('v1');

          expect(mockDb.limit).toHaveBeenCalledWith(20);
          expect(result).toEqual(mockReports);
        });

        it('should apply custom limit', async () => {
          mockDb.limit.mockResolvedValue([]);

          await repository().findByVideoId('v1', { limit: 5 });

          expect(mockDb.limit).toHaveBeenCalledWith(5);
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
        it('should return count of reports', async () => {
          mockDb.from.mockResolvedValue([{ count: 15 }]);

          const result = await repository().getCount();

          expect(result).toBe(15);
        });

        it('should return 0 when no reports', async () => {
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
        it('should create a report record', async () => {
          const reportData = { video_id: 'v1', reason: 'spam', timestamp: 123, video_timestamp: 456, email: 'test@example.com', type: 'spam', message: 'test' };
          const created = { report_id: 1, ...reportData };
          mockDb.returning.mockResolvedValue([created]);

          const result = await repository().create(reportData);

          expect(result).toEqual(created);
        });

        it('should throw error when insert fails', async () => {
          mockDb.returning.mockResolvedValue([]);

          await expect(repository().create({ video_id: 'v1', timestamp: 123, video_timestamp: 456, email: 'test@example.com', type: 'spam', message: 'test' })).rejects.toThrow(
            'Failed to create video report record'
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
        it('should delete report by id', async () => {
          mockDb.returning.mockResolvedValue([{ report_id: 1 }]);

          const result = await repository().delete(1);

          expect(result).toBe(true);
        });

        it('should return false when report not found', async () => {
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
        it('should delete all reports for video', async () => {
          mockDb.returning.mockResolvedValue([{}, {}]);

          const result = await repository().deleteByVideoId('v1');

          expect(result).toBe(2);
        });
      });
    });
  });

  describe('countNewerThan', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should count reports newer than timestamp', async () => {
          mockDb.where.mockResolvedValue([{ count: 5 }]);

          const result = await repository().countNewerThan(12345);

          expect(result).toBe(5);
        });

        it('should return 0 when no newer reports', async () => {
          mockDb.where.mockResolvedValue([{}]);

          const result = await repository().countNewerThan(99999);

          expect(result).toBe(0);
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
        it('should delete all reports and return count', async () => {
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
        it('should create multiple reports', async () => {
          const reportsData = [
            { video_id: 'v1', timestamp: 123, video_timestamp: 456, email: 'test1@example.com', type: 'spam', message: 'test1' },
            { video_id: 'v2', timestamp: 124, video_timestamp: 457, email: 'test2@example.com', type: 'harassment', message: 'test2' }
          ];
          const created = [{ report_id: 1 }, { report_id: 2 }];
          mockDb.returning.mockResolvedValue(created);

          const result = await repository().createMany(reportsData);

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
