/**
 * Unit tests for database/connection.ts
 *
 * Tests the database connection factory that orchestrates between
 * SQLite and PostgreSQL connections based on configuration.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the SQLite connection module
vi.mock('@database/sqlite-connection.js', () => ({
  createDatabase: vi.fn(),
  initializeDatabaseSchema: vi.fn(),
  getDatabase: vi.fn(),
}));

// Mock the PostgreSQL connection module
vi.mock('@database/postgres-connection.js', () => ({
  createDatabase: vi.fn(),
  initializeDatabaseSchema: vi.fn(),
  getDatabase: vi.fn(),
}));

// Import types
import type { DatabaseConfig, DatabaseClient } from '@database/connection.js';

describe('database/connection.ts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Type exports', () => {
    it('should export DatabaseConfig interface', async () => {
      const connectionModule = await import('@database/connection.js');

      // Verify the module exports the expected interface shape
      expect(connectionModule).toBeDefined();

      // Create a typed config to verify the interface is usable
      const sqliteConfig: DatabaseConfig = {
        dialect: 'sqlite',
        filepath: '/path/to/db.sqlite'
      };

      const postgresConfig: DatabaseConfig = {
        dialect: 'postgres',
        connectionString: 'postgres://localhost/test'
      };

      expect(sqliteConfig.dialect).toBe('sqlite');
      expect(postgresConfig.dialect).toBe('postgres');
    });

    it('should export DatabaseClient type', async () => {
      const connectionModule = await import('@database/connection.js');

      expect(connectionModule).toBeDefined();
      // The DatabaseClient is a union type, so we just verify the module exports properly
    });
  });

  describe('createDatabase', () => {
    it('should create SQLite database when dialect is sqlite', async () => {
      vi.resetModules();

      const { createDatabase: mockSqliteCreate } = await import('@database/sqlite-connection.js');
      const { createDatabase } = await import('@database/connection.js');

      const mockDb = { type: 'sqlite-drizzle' };
      vi.mocked(mockSqliteCreate).mockReturnValue(mockDb as any);

      const config: DatabaseConfig = {
        dialect: 'sqlite',
        filepath: '/path/to/db.sqlite'
      };

      const result = createDatabase(config);

      expect(mockSqliteCreate).toHaveBeenCalledWith(config);
      expect(result).toBe(mockDb);
    });

    it('should create PostgreSQL database when dialect is postgres', async () => {
      vi.resetModules();

      const { createDatabase: mockPostgresCreate } = await import('@database/postgres-connection.js');
      const { createDatabase } = await import('@database/connection.js');

      const mockDb = { type: 'postgres-drizzle' };
      vi.mocked(mockPostgresCreate).mockReturnValue(mockDb as any);

      const config: DatabaseConfig = {
        dialect: 'postgres',
        connectionString: 'postgres://localhost:5432/test'
      };

      const result = createDatabase(config);

      expect(mockPostgresCreate).toHaveBeenCalledWith(config);
      expect(result).toBe(mockDb);
    });

    it('should pass through SQLite creation errors', async () => {
      vi.resetModules();

      const { createDatabase: mockSqliteCreate } = await import('@database/sqlite-connection.js');
      const { createDatabase } = await import('@database/connection.js');

      vi.mocked(mockSqliteCreate).mockImplementation(() => {
        throw new Error('SQLite connection failed');
      });

      const config: DatabaseConfig = {
        dialect: 'sqlite',
        filepath: '/path/to/db.sqlite'
      };

      expect(() => createDatabase(config)).toThrow('SQLite connection failed');
    });

    it('should pass through PostgreSQL creation errors', async () => {
      vi.resetModules();

      const { createDatabase: mockPostgresCreate } = await import('@database/postgres-connection.js');
      const { createDatabase } = await import('@database/connection.js');

      vi.mocked(mockPostgresCreate).mockImplementation(() => {
        throw new Error('PostgreSQL connection failed');
      });

      const config: DatabaseConfig = {
        dialect: 'postgres',
        connectionString: 'postgres://localhost:5432/test'
      };

      expect(() => createDatabase(config)).toThrow('PostgreSQL connection failed');
    });

    it('should set current dialect to sqlite after creating SQLite database', async () => {
      vi.resetModules();

      const { createDatabase: mockSqliteCreate, getDatabase: mockSqliteGet } = await import('@database/sqlite-connection.js');
      const { createDatabase, getDatabase } = await import('@database/connection.js');

      const mockDb = { type: 'sqlite-drizzle' };
      vi.mocked(mockSqliteCreate).mockReturnValue(mockDb as any);
      vi.mocked(mockSqliteGet).mockReturnValue(mockDb as any);

      const config: DatabaseConfig = {
        dialect: 'sqlite',
        filepath: '/path/to/db.sqlite'
      };

      createDatabase(config);

      // Calling getDatabase should now use SQLite
      getDatabase();
      expect(mockSqliteGet).toHaveBeenCalled();
    });

    it('should set current dialect to postgres after creating PostgreSQL database', async () => {
      vi.resetModules();

      const { createDatabase: mockPostgresCreate, getDatabase: mockPostgresGet } = await import('@database/postgres-connection.js');
      const { createDatabase, getDatabase } = await import('@database/connection.js');

      const mockDb = { type: 'postgres-drizzle' };
      vi.mocked(mockPostgresCreate).mockReturnValue(mockDb as any);
      vi.mocked(mockPostgresGet).mockReturnValue(mockDb as any);

      const config: DatabaseConfig = {
        dialect: 'postgres',
        connectionString: 'postgres://localhost:5432/test'
      };

      createDatabase(config);

      // Calling getDatabase should now use PostgreSQL
      getDatabase();
      expect(mockPostgresGet).toHaveBeenCalled();
    });
  });

  describe('initializeDatabaseSchema', () => {
    it('should throw error when database not initialized', async () => {
      vi.resetModules();

      const { initializeDatabaseSchema } = await import('@database/connection.js');

      await expect(initializeDatabaseSchema()).rejects.toThrow(
        'Database dialect not set. Call createDatabase() first.'
      );
    });

    it('should call SQLite schema initialization for SQLite dialect', async () => {
      vi.resetModules();

      const { createDatabase: mockSqliteCreate, initializeDatabaseSchema: mockSqliteInit } = await import('@database/sqlite-connection.js');
      const { createDatabase, initializeDatabaseSchema } = await import('@database/connection.js');

      const mockDb = { type: 'sqlite-drizzle' };
      vi.mocked(mockSqliteCreate).mockReturnValue(mockDb as any);

      createDatabase({ dialect: 'sqlite', filepath: '/path/to/db.sqlite' });

      await initializeDatabaseSchema();

      expect(mockSqliteInit).toHaveBeenCalled();
    });

    it('should call PostgreSQL schema initialization for PostgreSQL dialect', async () => {
      vi.resetModules();

      const { createDatabase: mockPostgresCreate, initializeDatabaseSchema: mockPostgresInit } = await import('@database/postgres-connection.js');
      const { createDatabase, initializeDatabaseSchema } = await import('@database/connection.js');

      const mockDb = { type: 'postgres-drizzle' };
      vi.mocked(mockPostgresCreate).mockReturnValue(mockDb as any);

      createDatabase({ dialect: 'postgres', connectionString: 'postgres://localhost:5432/test' });

      await initializeDatabaseSchema();

      expect(mockPostgresInit).toHaveBeenCalled();
    });

    it('should pass through SQLite initialization errors', async () => {
      vi.resetModules();

      const { createDatabase: mockSqliteCreate, initializeDatabaseSchema: mockSqliteInit } = await import('@database/sqlite-connection.js');
      const { createDatabase, initializeDatabaseSchema } = await import('@database/connection.js');

      const mockDb = { type: 'sqlite-drizzle' };
      vi.mocked(mockSqliteCreate).mockReturnValue(mockDb as any);
      vi.mocked(mockSqliteInit).mockImplementation(() => {
        throw new Error('SQLite migration failed');
      });

      createDatabase({ dialect: 'sqlite', filepath: '/path/to/db.sqlite' });

      await expect(initializeDatabaseSchema()).rejects.toThrow('SQLite migration failed');
    });

    it('should pass through PostgreSQL initialization errors', async () => {
      vi.resetModules();

      const { createDatabase: mockPostgresCreate, initializeDatabaseSchema: mockPostgresInit } = await import('@database/postgres-connection.js');
      const { createDatabase, initializeDatabaseSchema } = await import('@database/connection.js');

      const mockDb = { type: 'postgres-drizzle' };
      vi.mocked(mockPostgresCreate).mockReturnValue(mockDb as any);
      vi.mocked(mockPostgresInit).mockRejectedValue(new Error('PostgreSQL migration failed'));

      createDatabase({ dialect: 'postgres', connectionString: 'postgres://localhost:5432/test' });

      await expect(initializeDatabaseSchema()).rejects.toThrow('PostgreSQL migration failed');
    });
  });

  describe('getDatabase', () => {
    it('should throw error when database not initialized', async () => {
      vi.resetModules();

      const { getDatabase } = await import('@database/connection.js');

      expect(() => getDatabase()).toThrow('Database not initialized. Call createDatabase() first.');
    });

    it('should return SQLite database for SQLite dialect', async () => {
      vi.resetModules();

      const { createDatabase: mockSqliteCreate, getDatabase: mockSqliteGet } = await import('@database/sqlite-connection.js');
      const { createDatabase, getDatabase } = await import('@database/connection.js');

      const mockDb = { type: 'sqlite-drizzle' };
      vi.mocked(mockSqliteCreate).mockReturnValue(mockDb as any);
      vi.mocked(mockSqliteGet).mockReturnValue(mockDb as any);

      createDatabase({ dialect: 'sqlite', filepath: '/path/to/db.sqlite' });

      const result = getDatabase();

      expect(mockSqliteGet).toHaveBeenCalled();
      expect(result).toBe(mockDb);
    });

    it('should return PostgreSQL database for PostgreSQL dialect', async () => {
      vi.resetModules();

      const { createDatabase: mockPostgresCreate, getDatabase: mockPostgresGet } = await import('@database/postgres-connection.js');
      const { createDatabase, getDatabase } = await import('@database/connection.js');

      const mockDb = { type: 'postgres-drizzle' };
      vi.mocked(mockPostgresCreate).mockReturnValue(mockDb as any);
      vi.mocked(mockPostgresGet).mockReturnValue(mockDb as any);

      createDatabase({ dialect: 'postgres', connectionString: 'postgres://localhost:5432/test' });

      const result = getDatabase();

      expect(mockPostgresGet).toHaveBeenCalled();
      expect(result).toBe(mockDb);
    });

    it('should return consistent database instance across multiple calls', async () => {
      vi.resetModules();

      const { createDatabase: mockSqliteCreate, getDatabase: mockSqliteGet } = await import('@database/sqlite-connection.js');
      const { createDatabase, getDatabase } = await import('@database/connection.js');

      const mockDb = { type: 'sqlite-drizzle' };
      vi.mocked(mockSqliteCreate).mockReturnValue(mockDb as any);
      vi.mocked(mockSqliteGet).mockReturnValue(mockDb as any);

      createDatabase({ dialect: 'sqlite', filepath: '/path/to/db.sqlite' });

      const result1 = getDatabase();
      const result2 = getDatabase();

      expect(result1).toBe(result2);
    });
  });

  describe('Dialect switching', () => {
    it('should allow switching from SQLite to PostgreSQL', async () => {
      vi.resetModules();

      const { createDatabase: mockSqliteCreate, getDatabase: mockSqliteGet } = await import('@database/sqlite-connection.js');
      const { createDatabase: mockPostgresCreate, getDatabase: mockPostgresGet } = await import('@database/postgres-connection.js');
      const { createDatabase, getDatabase } = await import('@database/connection.js');

      const mockSqliteDb = { type: 'sqlite-drizzle' };
      const mockPostgresDb = { type: 'postgres-drizzle' };

      vi.mocked(mockSqliteCreate).mockReturnValue(mockSqliteDb as any);
      vi.mocked(mockSqliteGet).mockReturnValue(mockSqliteDb as any);
      vi.mocked(mockPostgresCreate).mockReturnValue(mockPostgresDb as any);
      vi.mocked(mockPostgresGet).mockReturnValue(mockPostgresDb as any);

      // Create SQLite first
      createDatabase({ dialect: 'sqlite', filepath: '/path/to/db.sqlite' });
      expect(getDatabase()).toBe(mockSqliteDb);

      // Switch to PostgreSQL
      createDatabase({ dialect: 'postgres', connectionString: 'postgres://localhost:5432/test' });
      expect(getDatabase()).toBe(mockPostgresDb);
    });

    it('should allow switching from PostgreSQL to SQLite', async () => {
      vi.resetModules();

      const { createDatabase: mockSqliteCreate, getDatabase: mockSqliteGet } = await import('@database/sqlite-connection.js');
      const { createDatabase: mockPostgresCreate, getDatabase: mockPostgresGet } = await import('@database/postgres-connection.js');
      const { createDatabase, getDatabase } = await import('@database/connection.js');

      const mockSqliteDb = { type: 'sqlite-drizzle' };
      const mockPostgresDb = { type: 'postgres-drizzle' };

      vi.mocked(mockSqliteCreate).mockReturnValue(mockSqliteDb as any);
      vi.mocked(mockSqliteGet).mockReturnValue(mockSqliteDb as any);
      vi.mocked(mockPostgresCreate).mockReturnValue(mockPostgresDb as any);
      vi.mocked(mockPostgresGet).mockReturnValue(mockPostgresDb as any);

      // Create PostgreSQL first
      createDatabase({ dialect: 'postgres', connectionString: 'postgres://localhost:5432/test' });
      expect(getDatabase()).toBe(mockPostgresDb);

      // Switch to SQLite
      createDatabase({ dialect: 'sqlite', filepath: '/path/to/db.sqlite' });
      expect(getDatabase()).toBe(mockSqliteDb);
    });
  });
});
