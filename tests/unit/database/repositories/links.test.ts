/**
 * Unit tests for database/repositories/links.ts
 *
 * Tests the LinksRepository interface implementations which provide CRUD operations
 * for social link records.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the schema imports first
vi.mock('@database/schemas/sqlite/links.js', () => ({
  links: {
    name: 'links',
    link_id: { name: 'link_id' },
    url: { name: 'url' },
    svg_graphic: { name: 'svg_graphic' },
    timestamp: { name: 'timestamp' },
  },
}));

vi.mock('@database/schemas/postgres/links.js', () => ({
  links: {
    name: 'links',
    link_id: { name: 'link_id' },
    url: { name: 'url' },
    svg_graphic: { name: 'svg_graphic' },
    timestamp: { name: 'timestamp' },
  },
}));

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
  count: vi.fn(() => ({ type: 'count' })),
  limit: vi.fn((query, value) => ({ ...query, limit: value })),
}));

import { createLinksRepository, type ILinksRepository } from '@database/repositories/links/index.js';
import { links as mockSQLiteLinksTable } from '@database/schemas/sqlite/links.js';
import { links as mockPostgresLinksTable } from '@database/schemas/postgres/links.js';

describe('database/repositories/links.ts', () => {
  let mockDb: any;
  let sqliteRepository: ILinksRepository<any, any>;
  let postgresRepository: ILinksRepository<any, any>;

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
    sqliteRepository = createLinksRepository('sqlite', mockDb);
    postgresRepository = createLinksRepository('postgres', mockDb);
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
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteLinksTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresLinksTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should find link by id', async () => {
          const mockLink = { link_id: 1, url: 'https://example.com' };
          mockDb.limit.mockResolvedValue([mockLink]);

          const result = await repository().findById(1);

          expect(result).toEqual(mockLink);
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.limit).toHaveBeenCalledWith(1);
        });

        it('should return null when not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findById(999);

          expect(result).toBeNull();
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.limit).toHaveBeenCalledWith(1);
        });
      });
    });
  });

  describe('findAll', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteLinksTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresLinksTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should return all links without limit', async () => {
          const mockLinks = [{ link_id: 1, url: 'https://example.com' }];
          mockDb.orderBy.mockResolvedValue(mockLinks);

          const result = await repository().findAll();

          expect(result).toEqual(mockLinks);
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.orderBy).toHaveBeenCalled();
        });

        it('should apply limit when specified', async () => {
          const mockLinks = [{ link_id: 1, url: 'https://example.com' }];
          mockDb.limit.mockResolvedValue(mockLinks);

          const result = await repository().findAll({ limit: 10 });

          expect(result).toEqual(mockLinks);
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.orderBy).toHaveBeenCalled();
          expect(mockDb.limit).toHaveBeenCalledWith(10);
        });
      });
    });
  });

  describe('findByUrl', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteLinksTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresLinksTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should find link by URL', async () => {
          const mockLink = { link_id: 1, url: 'https://test.com' };
          mockDb.limit.mockResolvedValue([mockLink]);

          const result = await repository().findByUrl('https://test.com');

          expect(result).toEqual(mockLink);
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.limit).toHaveBeenCalledWith(1);
        });

        it('should return null when URL not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findByUrl('https://nonexistent.com');

          expect(result).toBeNull();
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.limit).toHaveBeenCalledWith(1);
        });
      });
    });
  });

  describe('getCount', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteLinksTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresLinksTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should return count of links', async () => {
          mockDb.from.mockResolvedValue([{ count: 5 }]);

          const result = await repository().getCount();

          expect(result).toBe(5);
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
        });

        it('should return 0 when no links', async () => {
          mockDb.from.mockResolvedValue([{}]);

          const result = await repository().getCount();

          expect(result).toBe(0);
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
        });
      });
    });
  });

  describe('create', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteLinksTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresLinksTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should create a link record', async () => {
          const linkData = { url: 'https://new.com' };
          const createdLink = { link_id: 1, ...linkData };
          mockDb.returning.mockResolvedValue([createdLink]);

          const result = await repository().create(linkData);

          expect(result).toEqual(createdLink);
          expect(mockDb.insert).toHaveBeenCalledWith(table);
          expect(mockDb.values).toHaveBeenCalledWith(linkData);
          expect(mockDb.returning).toHaveBeenCalled();
        });

        it('should throw error when insert fails', async () => {
          mockDb.returning.mockResolvedValue([]);

          await expect(repository().create({ url: 'fail' })).rejects.toThrow(
            'Failed to create link record'
          );
          expect(mockDb.insert).toHaveBeenCalledWith(table);
          expect(mockDb.values).toHaveBeenCalled();
          expect(mockDb.returning).toHaveBeenCalled();
        });
      });
    });
  });

  describe('update', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteLinksTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresLinksTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should update link by id', async () => {
          const updatedLink = { link_id: 1, url: 'https://updated.com' };
          mockDb.returning.mockResolvedValue([updatedLink]);

          const result = await repository().update(1, { url: 'https://updated.com' });

          expect(result).toEqual(updatedLink);
          expect(mockDb.update).toHaveBeenCalledWith(table);
          expect(mockDb.set).toHaveBeenCalledWith({ url: 'https://updated.com' });
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.returning).toHaveBeenCalled();
        });

        it('should return null when link not found', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().update(999, { url: 'new' });

          expect(result).toBeNull();
          expect(mockDb.update).toHaveBeenCalledWith(table);
          expect(mockDb.set).toHaveBeenCalled();
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.returning).toHaveBeenCalled();
        });
      });
    });
  });

  describe('delete', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteLinksTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresLinksTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should delete link by id', async () => {
          mockDb.returning.mockResolvedValue([{ link_id: 1 }]);

          const result = await repository().delete(1);

          expect(result).toBe(true);
          expect(mockDb.delete).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.returning).toHaveBeenCalled();
        });

        it('should return false when link not found', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().delete(999);

          expect(result).toBe(false);
          expect(mockDb.delete).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
          expect(mockDb.returning).toHaveBeenCalled();
        });
      });
    });
  });

  describe('deleteAll', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteLinksTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresLinksTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should delete all links and return count', async () => {
          mockDb.returning.mockResolvedValue([{}, {}, {}]);

          const result = await repository().deleteAll();

          expect(result).toBe(3);
          expect(mockDb.delete).toHaveBeenCalledWith(table);
          expect(mockDb.returning).toHaveBeenCalled();
        });
      });
    });
  });

  describe('createMany', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteLinksTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresLinksTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should create multiple links', async () => {
          const linksData = [{ url: 'https://a.com' }, { url: 'https://b.com' }];
          const created = [{ link_id: 1, ...linksData[0] }, { link_id: 2, ...linksData[1] }];
          mockDb.returning.mockResolvedValue(created);

          const result = await repository().createMany(linksData);

          expect(result).toEqual(created);
          expect(mockDb.insert).toHaveBeenCalledWith(table);
          expect(mockDb.values).toHaveBeenCalledWith(linksData);
          expect(mockDb.returning).toHaveBeenCalled();
        });

        it('should return empty array when data is empty', async () => {
          const result = await repository().createMany([]);

          expect(mockDb.insert).not.toHaveBeenCalled();
          expect(result).toEqual([]);
        });
      });
    });
  });

  describe('existsByUrl', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository, table: mockSQLiteLinksTable },
      { name: 'Postgres', repository: () => postgresRepository, table: mockPostgresLinksTable },
    ];

    testCases.forEach(({ name, repository, table }) => {
      describe(`${name} implementation`, () => {
        it('should return true when URL exists', async () => {
          mockDb.where.mockResolvedValue([{ count: 1 }]);

          const result = await repository().existsByUrl('https://exists.com');

          expect(result).toBe(true);
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
        });

        it('should return false when URL does not exist', async () => {
          mockDb.where.mockResolvedValue([{ count: 0 }]);

          const result = await repository().existsByUrl('https://missing.com');

          expect(result).toBe(false);
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
        });

        it('should return false when result is empty array', async () => {
          mockDb.where.mockResolvedValue([]);

          const result = await repository().existsByUrl('https://missing.com');

          expect(result).toBe(false);
          expect(mockDb.select).toHaveBeenCalled();
          expect(mockDb.from).toHaveBeenCalledWith(table);
          expect(mockDb.where).toHaveBeenCalled();
        });
      });
    });
  });
});
