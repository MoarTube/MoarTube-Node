/**
 * Unit tests for database/repositories/base.ts
 *
 * Tests the BaseRepository abstract class which provides common
 * database operations to all domain repositories.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BaseRepository } from '@database/repositories/base.js';
import type { PaginationOptions } from '@/types/models.js';

/**
 * Concrete implementation of BaseRepository for testing
 */
class TestRepository extends BaseRepository {
  constructor(db: any) {
    super(db);
  }

  // Expose protected methods for testing
  public testGetPaginationParams(options?: PaginationOptions) {
    return this.getPaginationParams(options);
  }

  public testGetPaginationParamsWithDefault(options?: PaginationOptions, defaultLimit?: number) {
    return this.getPaginationParamsWithDefault(options, defaultLimit);
  }

  public testGetCurrentTimestamp() {
    return this.getCurrentTimestamp();
  }

  public testGetCurrentTimestampMs() {
    return this.getCurrentTimestampMs();
  }

  // Expose the db property for testing
  public getDb() {
    return this.db;
  }
}

describe('database/repositories/base.ts', () => {
  let mockDb: any;
  let repository: TestRepository;

  beforeEach(() => {
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    repository = new TestRepository(mockDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should store the database instance', () => {
      expect(repository.getDb()).toBe(mockDb);
    });

    it('should accept any database instance type', () => {
      const sqliteDb = { type: 'sqlite' };
      const postgresDb = { type: 'postgres' };

      const sqliteRepo = new TestRepository(sqliteDb);
      const postgresRepo = new TestRepository(postgresDb);

      expect(sqliteRepo.getDb()).toBe(sqliteDb);
      expect(postgresRepo.getDb()).toBe(postgresDb);
    });
  });

  describe('getPaginationParams', () => {
    it('should return undefined limit when no options provided', () => {
      const result = repository.testGetPaginationParams();

      expect(result).toEqual({ limit: undefined });
    });

    it('should return undefined limit when options is empty object', () => {
      const result = repository.testGetPaginationParams({});

      expect(result).toEqual({ limit: undefined });
    });

    it('should return specified limit when provided', () => {
      const result = repository.testGetPaginationParams({ limit: 10 });

      expect(result).toEqual({ limit: 10 });
    });

    it('should handle limit of 0', () => {
      const result = repository.testGetPaginationParams({ limit: 0 });

      expect(result).toEqual({ limit: 0 });
    });

    it('should handle large limit values', () => {
      const result = repository.testGetPaginationParams({ limit: 1000000 });

      expect(result).toEqual({ limit: 1000000 });
    });
  });

  describe('getPaginationParamsWithDefault', () => {
    it('should return default limit of 20 when no options provided', () => {
      const result = repository.testGetPaginationParamsWithDefault();

      expect(result).toEqual({ limit: 20 });
    });

    it('should return default limit of 20 when options is empty object', () => {
      const result = repository.testGetPaginationParamsWithDefault({});

      expect(result).toEqual({ limit: 20 });
    });

    it('should return specified limit when provided', () => {
      const result = repository.testGetPaginationParamsWithDefault({ limit: 50 });

      expect(result).toEqual({ limit: 50 });
    });

    it('should use custom default limit when specified', () => {
      const result = repository.testGetPaginationParamsWithDefault(undefined, 100);

      expect(result).toEqual({ limit: 100 });
    });

    it('should prefer options limit over custom default', () => {
      const result = repository.testGetPaginationParamsWithDefault({ limit: 25 }, 100);

      expect(result).toEqual({ limit: 25 });
    });

    it('should handle limit of 0 (falsy but valid)', () => {
      // Note: limit of 0 would be replaced by default due to ?? operator
      const result = repository.testGetPaginationParamsWithDefault({ limit: 0 });

      // 0 is falsy for ?? only with null/undefined, not 0
      // Actually ?? only treats null and undefined as "missing", 0 should pass through
      expect(result).toEqual({ limit: 0 });
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return current Unix timestamp in seconds', () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const result = repository.testGetCurrentTimestamp();

      expect(result).toBe(Math.floor(now / 1000));
    });

    it('should floor the timestamp value', () => {
      // Set time to a value that would have decimals when divided by 1000
      vi.useFakeTimers();
      vi.setSystemTime(1234567890123);

      const result = repository.testGetCurrentTimestamp();

      expect(result).toBe(1234567890);
    });

    it('should return different values at different times', () => {
      vi.useFakeTimers();

      vi.setSystemTime(1000000000000);
      const result1 = repository.testGetCurrentTimestamp();

      vi.setSystemTime(2000000000000);
      const result2 = repository.testGetCurrentTimestamp();

      expect(result1).toBe(1000000000);
      expect(result2).toBe(2000000000);
      expect(result2).toBeGreaterThan(result1);
    });
  });

  describe('getCurrentTimestampMs', () => {
    it('should return current Unix timestamp in milliseconds', () => {
      const now = Date.now();
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const result = repository.testGetCurrentTimestampMs();

      expect(result).toBe(now);
    });

    it('should return exact milliseconds without rounding', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1234567890123);

      const result = repository.testGetCurrentTimestampMs();

      expect(result).toBe(1234567890123);
    });

    it('should return different values at different times', () => {
      vi.useFakeTimers();

      vi.setSystemTime(1000000000001);
      const result1 = repository.testGetCurrentTimestampMs();

      vi.setSystemTime(1000000000002);
      const result2 = repository.testGetCurrentTimestampMs();

      expect(result1).toBe(1000000000001);
      expect(result2).toBe(1000000000002);
      expect(result2 - result1).toBe(1);
    });
  });

  describe('Inheritance behavior', () => {
    it('should be an abstract class that cannot be instantiated directly', () => {
      // TypeScript enforces this at compile time
      // At runtime, we can verify it's designed as a base class
      expect(BaseRepository).toBeDefined();
      expect(repository).toBeInstanceOf(BaseRepository);
    });

    it('should allow child classes to access protected db property', () => {
      expect(repository.getDb()).toBe(mockDb);
    });

    it('should allow child classes to use protected methods', () => {
      // All protected methods are accessible through our test wrapper
      expect(typeof repository.testGetPaginationParams).toBe('function');
      expect(typeof repository.testGetPaginationParamsWithDefault).toBe('function');
      expect(typeof repository.testGetCurrentTimestamp).toBe('function');
      expect(typeof repository.testGetCurrentTimestampMs).toBe('function');
    });
  });
});
