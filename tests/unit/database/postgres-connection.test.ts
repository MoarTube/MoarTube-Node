/**
 * Unit tests for database/postgres-connection.ts
 *
 * Tests the PostgreSQL-specific database connection implementation using
 * postgres.js and Drizzle ORM.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Track mock SQL template function
let mockSql: any;
let constructorShouldThrow = false;
let constructorErrorMessage = '';

// Mock postgres
vi.mock('postgres', () => {
  return {
    default: (connectionString: string) => {
      if (constructorShouldThrow) {
        throw new Error(constructorErrorMessage);
      }
      mockSql = vi.fn().mockImplementation(() => Promise.resolve());
      // Add tagged template literal support
      mockSql.TEMPLATE = connectionString;
      return mockSql;
    },
  };
});

// Mock drizzle-orm/postgres-js
vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(),
}));

// Mock drizzle-orm/postgres-js/migrator
vi.mock('drizzle-orm/postgres-js/migrator', () => ({
  migrate: vi.fn(),
}));

// Mock drizzle-orm/errors
vi.mock('drizzle-orm/errors', () => ({
  DrizzleQueryError: class DrizzleQueryError extends Error {
    cause: any;
    constructor(message: string, cause?: any) {
      super(message);
      this.name = 'DrizzleQueryError';
      this.cause = cause;
    }
  },
}));

// Mock path and url modules
vi.mock('node:path', () => ({
  default: {
    dirname: vi.fn(),
    resolve: vi.fn(),
    join: vi.fn(),
  },
}));

vi.mock('node:url', () => ({
  fileURLToPath: vi.fn(),
}));

// Mock the schema
vi.mock('@database/schemas/postgres/index.js', () => ({
  videos: { id: 'videos' },
  comments: { id: 'comments' },
}));

// Import types
import type { DatabaseConfig } from '@database/postgres-connection.js';

// Import mocked modules for assertions
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('database/postgres-connection.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    constructorShouldThrow = false;
    constructorErrorMessage = '';
    mockSql = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Type exports', () => {
    it('should export DatabaseConfig interface', async () => {
      vi.resetModules();
      const postgresModule = await import('@database/postgres-connection.js');

      expect(postgresModule).toBeDefined();

      // Verify the interface shape
      const config: DatabaseConfig = {
        connectionString: 'postgres://localhost:5432/test'
      };

      expect(config.connectionString).toBe('postgres://localhost:5432/test');
    });
  });

  describe('createDatabase', () => {
    it('should create PostgreSQL database with valid connection string', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-postgres' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);

      const { createDatabase } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: 'postgres://user:pass@localhost:5432/testdb'
      };

      const result = createDatabase(config);

      expect(drizzle).toHaveBeenCalledWith(expect.any(Function), { schema: expect.any(Object) });
      expect(result).toBe(mockDrizzleDb);
    });

    it('should throw error when connection string is missing', async () => {
      vi.resetModules();

      const { createDatabase } = await import('@database/postgres-connection.js');

      const config = {} as DatabaseConfig;

      expect(() => createDatabase(config)).toThrow('PostgreSQL connection string is required');
    });

    it('should throw error when connection string is empty', async () => {
      vi.resetModules();

      const { createDatabase } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: ''
      };

      expect(() => createDatabase(config)).toThrow('PostgreSQL connection string is required');
    });

    it('should handle postgres constructor errors', async () => {
      vi.resetModules();

      constructorShouldThrow = true;
      constructorErrorMessage = 'PostgreSQL connection failed';

      const { createDatabase } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: 'postgres://localhost:5432/test'
      };

      expect(() => createDatabase(config)).toThrow('PostgreSQL connection failed');
    });
  });

  describe('initializeDatabaseSchema', () => {
    it('should throw error when database not initialized', async () => {
      vi.resetModules();

      const { initializeDatabaseSchema } = await import('@database/postgres-connection.js');

      await expect(initializeDatabaseSchema()).rejects.toThrow(
        'PostgreSQL database not initialized. Call createDatabase() first.'
      );
    });

    it('should initialize schema successfully', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-postgres' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      vi.mocked(fileURLToPath).mockReturnValue('/project/src/database/postgres-connection.ts');
      vi.mocked(path.dirname).mockReturnValue('/project/src/database');
      // path.resolve is called with (__dirname, '..', '..', 'drizzle', 'postgres')
      vi.mocked(path.resolve).mockReturnValue('/project/drizzle/postgres');
      vi.mocked(migrate).mockResolvedValue(undefined);

      const { createDatabase, initializeDatabaseSchema } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: 'postgres://localhost:5432/test'
      };

      createDatabase(config);

      await initializeDatabaseSchema();

      expect(migrate).toHaveBeenCalledWith(mockDrizzleDb, {
        migrationsFolder: '/project/drizzle/postgres'
      });
    });

    it('should use bundled migrations path when running from dist folder', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-postgres' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      // Simulate bundled build: __filename is in dist folder
      vi.mocked(fileURLToPath).mockReturnValue('/project/dist/moartube-node.js');
      vi.mocked(path.dirname).mockReturnValue('/project/dist');
      // path.join is called with (__dirname, 'drizzle', 'postgres')
      vi.mocked(path.join).mockReturnValue('/project/dist/drizzle/postgres');
      vi.mocked(migrate).mockResolvedValue(undefined);

      const { createDatabase, initializeDatabaseSchema } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: 'postgres://localhost:5432/test'
      };

      createDatabase(config);

      await initializeDatabaseSchema();

      expect(path.join).toHaveBeenCalledWith('/project/dist', 'drizzle', 'postgres');
      expect(migrate).toHaveBeenCalledWith(mockDrizzleDb, {
        migrationsFolder: '/project/dist/drizzle/postgres'
      });
    });

    it('should handle schema creation failure gracefully', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-postgres' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      vi.mocked(fileURLToPath).mockReturnValue('/project/src/database/postgres-connection.ts');
      vi.mocked(path.dirname).mockReturnValue('/project/src/database');
      // path.resolve is called with (__dirname, '..', '..', 'drizzle', 'postgres')
      vi.mocked(path.resolve).mockReturnValue('/project/drizzle/postgres');
      vi.mocked(migrate).mockResolvedValue(undefined);

      const { createDatabase, initializeDatabaseSchema } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: 'postgres://localhost:5432/test'
      };

      createDatabase(config);

      // Mock SQL to reject for schema creation but migration should still work
      mockSql.mockRejectedValueOnce(new Error('CREATE SCHEMA failed'));

      await initializeDatabaseSchema();

      // Should not throw - schema creation failure is handled
      expect(migrate).toHaveBeenCalled();
    });

    it('should handle migration errors', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-postgres' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      vi.mocked(fileURLToPath).mockReturnValue('/project/src/database/postgres-connection.ts');
      vi.mocked(path.dirname).mockReturnValue('/project/src/database');
      vi.mocked(path.resolve).mockReturnValue('/project');
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(migrate).mockRejectedValue(new Error('Migration failed'));

      const { createDatabase, initializeDatabaseSchema } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: 'postgres://localhost:5432/test'
      };

      createDatabase(config);

      await expect(initializeDatabaseSchema()).rejects.toThrow(
        'Failed to initialize PostgreSQL database schema: Error: Migration failed'
      );
    });

    it('should ignore DrizzleQueryError when table already exists', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-postgres' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      vi.mocked(fileURLToPath).mockReturnValue('/project/src/database/postgres-connection.ts');
      vi.mocked(path.dirname).mockReturnValue('/project/src/database');
      vi.mocked(path.resolve).mockReturnValue('/project');
      vi.mocked(path.join).mockReturnValue('/project/drizzle/postgres');

      // Create a DrizzleQueryError with 'already exists' in the cause message
      const alreadyExistsError = new DrizzleQueryError('Query failed', { message: 'relation already exists' });
      vi.mocked(migrate).mockRejectedValue(alreadyExistsError);

      const { createDatabase, initializeDatabaseSchema } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: 'postgres://localhost:5432/test'
      };

      createDatabase(config);

      // Should not throw - 'already exists' errors are ignored
      await initializeDatabaseSchema();
    });
  });

  describe('getDatabase', () => {
    it('should throw error when database not initialized', async () => {
      vi.resetModules();

      const { getDatabase } = await import('@database/postgres-connection.js');

      expect(() => getDatabase()).toThrow(
        'PostgreSQL database not initialized. Call createDatabase() first.'
      );
    });

    it('should return database instance when initialized', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-postgres' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);

      const { createDatabase, getDatabase } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: 'postgres://localhost:5432/test'
      };

      createDatabase(config);
      const result = getDatabase();

      expect(result).toBe(mockDrizzleDb);
    });

    it('should return same instance across multiple calls', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-postgres' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);

      const { createDatabase, getDatabase } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: 'postgres://localhost:5432/test'
      };

      createDatabase(config);

      const result1 = getDatabase();
      const result2 = getDatabase();

      expect(result1).toBe(result2);
      expect(result1).toBe(mockDrizzleDb);
    });
  });

  describe('State management', () => {
    it('should maintain database instance across operations', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-postgres' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      vi.mocked(fileURLToPath).mockReturnValue('/project/src/database/postgres-connection.ts');
      vi.mocked(path.dirname).mockReturnValue('/project/src/database');
      vi.mocked(path.resolve).mockReturnValue('/project');
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(migrate).mockResolvedValue(undefined);

      const { createDatabase, getDatabase, initializeDatabaseSchema } = await import('@database/postgres-connection.js');

      const config: DatabaseConfig = {
        connectionString: 'postgres://localhost:5432/test'
      };

      createDatabase(config);
      await initializeDatabaseSchema();
      const result = getDatabase();

      expect(result).toBe(mockDrizzleDb);
    });
  });
});
