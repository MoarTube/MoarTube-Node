/**
 * Unit tests for database/repositories/links.ts
 *
 * Tests the LinksRepository class which provides CRUD operations
 * for social link records.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LinksRepository } from '@database/repositories/links.js';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
  count: vi.fn(() => ({ type: 'count' })),
}));

describe('database/repositories/links.ts', () => {
  let mockDb: any;
  let mockLinksTable: any;
  let repository: LinksRepository;

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
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    };

    mockLinksTable = {
      link_id: { name: 'link_id' },
      url: { name: 'url' },
      timestamp: { name: 'timestamp' },
    };

    repository = new LinksRepository(mockDb, mockLinksTable);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('should find link by id', async () => {
      const mockLink = { link_id: 1, url: 'https://example.com' };
      mockDb.limit.mockResolvedValue([mockLink]);

      const result = await repository.findById(1);

      expect(result).toEqual(mockLink);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all links without limit', async () => {
      const mockLinks = [{ link_id: 1 }];
      mockDb.orderBy.mockResolvedValue(mockLinks);

      const result = await repository.findAll();

      expect(result).toEqual(mockLinks);
    });

    it('should apply limit when specified', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({ limit: 10 });

      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('findByUrl', () => {
    it('should find link by URL', async () => {
      const mockLink = { link_id: 1, url: 'https://test.com' };
      mockDb.limit.mockResolvedValue([mockLink]);

      const result = await repository.findByUrl('https://test.com');

      expect(result).toEqual(mockLink);
    });

    it('should return null when URL not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findByUrl('https://nonexistent.com');

      expect(result).toBeNull();
    });
  });

  describe('getCount', () => {
    it('should return count of links', async () => {
      mockDb.from.mockResolvedValue([{ count: 5 }]);

      const result = await repository.getCount();

      expect(result).toBe(5);
    });

    it('should return 0 when no links', async () => {
      mockDb.from.mockResolvedValue([{}]);

      const result = await repository.getCount();

      expect(result).toBe(0);
    });
  });

  describe('create', () => {
    it('should create a link record', async () => {
      const linkData = { url: 'https://new.com' };
      const createdLink = { link_id: 1, ...linkData };
      mockDb.returning.mockResolvedValue([createdLink]);

      const result = await repository.create(linkData);

      expect(result).toEqual(createdLink);
    });

    it('should throw error when insert fails', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(repository.create({ url: 'fail' })).rejects.toThrow(
        'Failed to create link record'
      );
    });
  });

  describe('update', () => {
    it('should update link by id', async () => {
      const updatedLink = { link_id: 1, url: 'https://updated.com' };
      mockDb.returning.mockResolvedValue([updatedLink]);

      const result = await repository.update(1, { url: 'https://updated.com' });

      expect(result).toEqual(updatedLink);
    });

    it('should return null when link not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.update(999, { url: 'new' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete link by id', async () => {
      mockDb.returning.mockResolvedValue([{ link_id: 1 }]);

      const result = await repository.delete(1);

      expect(result).toBe(true);
    });

    it('should return false when link not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('deleteAll', () => {
    it('should delete all links and return count', async () => {
      mockDb.returning.mockResolvedValue([{}, {}, {}]);

      const result = await repository.deleteAll();

      expect(result).toBe(3);
    });
  });

  describe('createMany', () => {
    it('should create multiple links', async () => {
      const linksData = [{ url: 'https://a.com' }, { url: 'https://b.com' }];
      const created = [{ link_id: 1, ...linksData[0] }, { link_id: 2, ...linksData[1] }];
      mockDb.returning.mockResolvedValue(created);

      const result = await repository.createMany(linksData);

      expect(result).toEqual(created);
    });

    it('should return empty array when data is empty', async () => {
      const result = await repository.createMany([]);

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('existsByUrl', () => {
    it('should return true when URL exists', async () => {
      mockDb.where.mockResolvedValue([{ count: 1 }]);

      const result = await repository.existsByUrl('https://exists.com');

      expect(result).toBe(true);
    });

    it('should return false when URL does not exist', async () => {
      mockDb.where.mockResolvedValue([{ count: 0 }]);

      const result = await repository.existsByUrl('https://missing.com');

      expect(result).toBe(false);
    });

    it('should return false when result is empty array', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await repository.existsByUrl('https://missing.com');

      expect(result).toBe(false);
    });
  });
});
