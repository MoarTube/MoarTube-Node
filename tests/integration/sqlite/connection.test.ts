import { afterEach, describe, expect, it, vi } from 'vitest';
import SQLite from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { sql } from 'drizzle-orm';
import { openTestDatabase } from './helpers.js';
import * as sqliteConnection from '@database/sqlite-connection.js';

describe('SQLite connection and shipped migrations (real SQL)', () => {
  let database: ReturnType<typeof openTestDatabase> | undefined;
  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it('rejects access before initialization and invalid file paths', async () => {
    vi.resetModules();
    const connection = await import('@database/sqlite-connection.js');
    expect(() => connection.getDatabase()).toThrow('not initialized');
    expect(() => connection.initializeDatabaseSchema()).toThrow('not initialized');
    expect(() => connection.createDatabase({ filepath: '' })).toThrow('filepath is required');
    const directory = mkdtempSync(join(tmpdir(), 'moartube-invalid-'));
    try {
      expect(() => connection.createDatabase({ filepath: directory })).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('runs migrations idempotently and persists data across native connections', async () => {
    database = openTestDatabase();
    sqliteConnection.initializeDatabaseSchema();
    expect(sqliteConnection.getDatabase()).toBe(database.db);
    expect(
      database.db.all(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
      )
    ).toHaveLength(10);
    database.client.exec(
      "INSERT INTO links (url, svg_graphic, timestamp) VALUES ('persisted', '<svg/>', 100)"
    );
    const reopened = new SQLite(database.client.name, { readonly: true });
    try {
      expect(reopened.prepare('SELECT url FROM links').all()).toEqual([{ url: 'persisted' }]);
    } finally {
      reopened.close();
    }
  });

  it('wraps a real migration failure', async () => {
    vi.resetModules();
    const connection = await import('@database/sqlite-connection.js');
    const db = connection.createDatabase({ filepath: ':memory:' });
    const client = (db as typeof db & { $client: SQLite.Database }).$client;
    try {
      client.exec('CREATE TABLE comments (conflicting_column TEXT)');
      expect(() => connection.initializeDatabaseSchema()).toThrow(
        'Failed to initialize SQLite database schema'
      );
    } finally {
      client.close();
    }
  });

  it('routes SQLite connections and migrations through the application database factory', async () => {
    vi.resetModules();
    const connection = await import('@database/connection.js');
    expect(() => connection.getDatabase()).toThrow('not initialized');
    await expect(connection.initializeDatabaseSchema()).rejects.toThrow('dialect not set');
    const db = connection.createDatabase({ dialect: 'sqlite', filepath: ':memory:' });
    const client = (db as unknown as { $client: SQLite.Database }).$client;
    try {
      await connection.initializeDatabaseSchema();
      expect(connection.getDatabase()).toBe(db);
      expect(client.prepare('SELECT count(*) AS count FROM videos').get()).toEqual({ count: 0 });
    } finally {
      client.close();
    }
  });

  it.each([
    ['source', 'src/database/sqlite-connection.ts', 'drizzle/sqlite'],
    ['bundled', 'dist/moartube-node.js', 'dist/drizzle/sqlite'],
    ['standalone', 'release/moartube-node.js', 'release/drizzle/sqlite'],
  ])('migrates a real %s directory layout', (_name, modulePath, migrationsPath) => {
    const directory = mkdtempSync(join(tmpdir(), 'moartube-layout-'));
    try {
      const moduleFile = join(directory, modulePath);
      mkdirSync(dirname(moduleFile), { recursive: true });
      writeFileSync(moduleFile, '// Runtime module location');
      const migrationsFolder = join(directory, migrationsPath);
      cpSync(fileURLToPath(new URL('../../../drizzle/sqlite', import.meta.url)), migrationsFolder, {
        recursive: true,
      });
      const resolved = sqliteConnection.resolveMigrationsFolder(pathToFileURL(moduleFile).href);
      expect(resolved).toBe(migrationsFolder);
      // Apply the actual shipped SQL using the resolved folder on a fresh real connection.
      const db = sqliteConnection.createDatabase({ filepath: ':memory:' });
      const client = (db as typeof db & { $client: SQLite.Database }).$client;
      try {
        migrate(db, { migrationsFolder: resolved });
        client.exec(
          "INSERT INTO links (url, svg_graphic, timestamp) VALUES ('layout', '<svg/>', 1)"
        );
        expect(client.prepare('SELECT url FROM links').all()).toEqual([{ url: 'layout' }]);
      } finally {
        client.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
