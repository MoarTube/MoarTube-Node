/**
 * Unit tests for database/sqlite-connection.ts
 *
 * Tests the SQLite-specific database connection implementation using
 * better-sqlite3 and Drizzle ORM.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Track mock instances for verification
let mockExec = vi.fn();
let mockPragma = vi.fn();
let mockClose = vi.fn();
let constructorShouldThrow = false;
let constructorErrorMessage = '';

// Mock better-sqlite3 with a class-like constructor
vi.mock('better-sqlite3', () => {
  return {
    default: function(_filepath: string) {
      if (constructorShouldThrow) {
        throw new Error(constructorErrorMessage);
      }
      return {
        exec: mockExec,
        pragma: mockPragma,
        close: mockClose,
      };
    },
  };
});

// Mock drizzle-orm/better-sqlite3
vi.mock('drizzle-orm/better-sqlite3', () => ({
  drizzle: vi.fn(),
}));

// Mock drizzle-orm/better-sqlite3/migrator
vi.mock('drizzle-orm/better-sqlite3/migrator', () => ({
  migrate: vi.fn(),
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
vi.mock('@database/schemas/sqlite/index.js', () => ({
  videos: { id: 'videos' },
  comments: { id: 'comments' },
}));

// Import types
import type { DatabaseConfig } from '@database/sqlite-connection.js';

// Import mocked modules for assertions
import sqliteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('database/sqlite-connection.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExec = vi.fn();
    mockPragma = vi.fn();
    mockClose = vi.fn();
    constructorShouldThrow = false;
    constructorErrorMessage = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Type exports', () => {
    it('should export DatabaseConfig interface', async () => {
      vi.resetModules();
      const sqliteModule = await import('@database/sqlite-connection.js');

      expect(sqliteModule).toBeDefined();

      // Verify the interface shape
      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
      };

      expect(config.filepath).toBe('/path/to/db.sqlite');
    });
  });

  describe('createDatabase', () => {
    it('should create SQLite database with valid filepath', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-sqlite' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);

      const { createDatabase } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
      };

      const result = createDatabase(config);

      expect(mockExec).toHaveBeenCalledWith('VACUUM');
      expect(drizzle).toHaveBeenCalledWith(expect.any(Object), { schema: expect.any(Object) });
      expect(result).toBe(mockDrizzleDb);
    });

    it('should throw error when filepath is missing', async () => {
      vi.resetModules();

      const { createDatabase } = await import('@database/sqlite-connection.js');

      const config = {} as DatabaseConfig;

      expect(() => createDatabase(config)).toThrow('SQLite filepath is required');
    });

    it('should throw error when filepath is empty string', async () => {
      vi.resetModules();

      const { createDatabase } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: ''
      };

      expect(() => createDatabase(config)).toThrow('SQLite filepath is required');
    });

    it('should handle better-sqlite3 constructor errors', async () => {
      vi.resetModules();

      constructorShouldThrow = true;
      constructorErrorMessage = 'SQLite connection failed';

      const { createDatabase } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
      };

      expect(() => createDatabase(config)).toThrow('SQLite connection failed');
    });

    it('should handle VACUUM execution errors', async () => {
      vi.resetModules();

      mockExec.mockImplementation(() => {
        throw new Error('VACUUM failed');
      });

      const { createDatabase } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
      };

      expect(() => createDatabase(config)).toThrow('VACUUM failed');
    });
  });

  describe('initializeDatabaseSchema', () => {
    it('should throw error when database not initialized', async () => {
      vi.resetModules();

      const { initializeDatabaseSchema } = await import('@database/sqlite-connection.js');

      expect(() => initializeDatabaseSchema()).toThrow(
        'SQLite database not initialized. Call createDatabase() first.'
      );
    });

    it('should initialize schema successfully', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-sqlite' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      vi.mocked(fileURLToPath).mockReturnValue('/project/src/database/sqlite-connection.ts');
      vi.mocked(path.dirname).mockReturnValue('/project/src/database');
      // path.resolve is called with (__dirname, '..', '..', 'drizzle', 'sqlite')
      vi.mocked(path.resolve).mockReturnValue('/project/drizzle/sqlite');

      const { createDatabase, initializeDatabaseSchema } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
      };

      createDatabase(config);

      // Reset exec mock to clear VACUUM call count from createDatabase
      mockExec.mockClear();

      initializeDatabaseSchema();

      expect(migrate).toHaveBeenCalledWith(mockDrizzleDb, {
        migrationsFolder: '/project/drizzle/sqlite'
      });
      // VACUUM is called after migration
      expect(mockExec).toHaveBeenCalledWith('VACUUM');
    });

    it('should use bundled migrations path when running from dist folder', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-sqlite' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      // Simulate bundled build: __filename is in dist folder
      vi.mocked(fileURLToPath).mockReturnValue('/project/dist/moartube-node.js');
      vi.mocked(path.dirname).mockReturnValue('/project/dist');
      // path.join is called with (__dirname, 'drizzle', 'sqlite')
      vi.mocked(path.join).mockReturnValue('/project/dist/drizzle/sqlite');
      vi.mocked(migrate).mockImplementation(() => {});

      const { createDatabase, initializeDatabaseSchema } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
      };

      createDatabase(config);

      // Reset exec mock to clear VACUUM call count from createDatabase
      mockExec.mockClear();

      initializeDatabaseSchema();

      expect(path.join).toHaveBeenCalledWith('/project/dist', 'drizzle', 'sqlite');
      expect(migrate).toHaveBeenCalledWith(mockDrizzleDb, {
        migrationsFolder: '/project/dist/drizzle/sqlite'
      });
    });

    it('should handle migration errors', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-sqlite' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      vi.mocked(fileURLToPath).mockReturnValue('/project/src/database/sqlite-connection.ts');
      vi.mocked(path.dirname).mockReturnValue('/project/src/database');
      vi.mocked(path.resolve).mockReturnValue('/project');
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(migrate).mockImplementation(() => {
        throw new Error('Migration failed');
      });

      const { createDatabase, initializeDatabaseSchema } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
      };

      createDatabase(config);

      expect(() => initializeDatabaseSchema()).toThrow(
        'Failed to initialize SQLite database schema: Error: Migration failed'
      );
    });

    it('should handle VACUUM errors after migration', async () => {
      vi.resetModules();

      let vacuumCallCount = 0;
      mockExec.mockImplementation((sql: string) => {
        if (sql === 'VACUUM') {
          vacuumCallCount++;
          // First VACUUM call (in createDatabase) succeeds, second (after migrate) throws
          if (vacuumCallCount > 1) {
            throw new Error('VACUUM failed');
          }
        }
      });

      const mockDrizzleDb = { type: 'drizzle-sqlite' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      vi.mocked(fileURLToPath).mockReturnValue('/project/src/database/sqlite-connection.ts');
      vi.mocked(path.dirname).mockReturnValue('/project/src/database');
      vi.mocked(path.resolve).mockReturnValue('/project');
      vi.mocked(path.join).mockReturnValue('/project/drizzle/sqlite');
      // Reset migrate mock to not throw
      vi.mocked(migrate).mockImplementation(() => {});

      const { createDatabase, initializeDatabaseSchema } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
      };

      createDatabase(config);

      expect(() => initializeDatabaseSchema()).toThrow(
        'Failed to initialize SQLite database schema: Error: VACUUM failed'
      );
    });
  });

  describe('getDatabase', () => {
    it('should throw error when database not initialized', async () => {
      vi.resetModules();

      const { getDatabase } = await import('@database/sqlite-connection.js');

      expect(() => getDatabase()).toThrow(
        'SQLite database not initialized. Call createDatabase() first.'
      );
    });

    it('should return database instance when initialized', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-sqlite' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);

      const { createDatabase, getDatabase } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
      };

      createDatabase(config);
      const result = getDatabase();

      expect(result).toBe(mockDrizzleDb);
    });

    it('should return same instance across multiple calls', async () => {
      vi.resetModules();

      const mockDrizzleDb = { type: 'drizzle-sqlite' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);

      const { createDatabase, getDatabase } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
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

      const mockDrizzleDb = { type: 'drizzle-sqlite' };
      vi.mocked(drizzle).mockReturnValue(mockDrizzleDb as any);
      vi.mocked(fileURLToPath).mockReturnValue('/project/src/database/sqlite-connection.ts');
      vi.mocked(path.dirname).mockReturnValue('/project/src/database');
      vi.mocked(path.resolve).mockReturnValue('/project');
      vi.mocked(path.join).mockReturnValue('/project/drizzle/sqlite');
      // Reset migrate mock to not throw
      vi.mocked(migrate).mockImplementation(() => {});

      const { createDatabase, getDatabase, initializeDatabaseSchema } = await import('@database/sqlite-connection.js');

      const config: DatabaseConfig = {
        filepath: '/path/to/db.sqlite'
      };

      createDatabase(config);
      initializeDatabaseSchema();
      const result = getDatabase();

      expect(result).toBe(mockDrizzleDb);
    });
  });
});
