import { afterEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as connection from '@database/postgres-connection.js';
import { createVideosRepository } from '@database/repositories/videos/index.js';
import { connectionString, openTestDatabase, video } from './helpers.js';

describe('PostgreSQL connections and shipped migrations (real SQL)', () => {
  let database: Awaited<ReturnType<typeof openTestDatabase>> | undefined;
  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  it('rejects access before initialization and missing connection strings', async () => {
    vi.resetModules();
    const fresh = await import('@database/postgres-connection.js');
    expect(() => fresh.getDatabase()).toThrow('not initialized');
    await expect(fresh.initializeDatabaseSchema()).rejects.toThrow('not initialized');
    expect(() => fresh.createDatabase({ connectionString: '' })).toThrow(
      'connection string is required'
    );
  });

  it('runs migrations idempotently and persists timestamp data across independent connections', async () => {
    database = await openTestDatabase();
    const migrations = await database.client`SELECT * FROM drizzle.__drizzle_migrations`;
    expect(migrations.length).toBeGreaterThan(0);
    await connection.initializeDatabaseSchema();
    expect(connection.getDatabase()).toBe(database.db);
    const tables =
      await database.client`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    expect(tables.map((row) => row['table_name']).sort()).toEqual([
      'commentreports',
      'commentreportsarchives',
      'comments',
      'cryptowalletaddresses',
      'links',
      'livechatmessages',
      'videoreports',
      'videoreportsarchives',
      'videos',
    ]);
    expect(await database.client`SELECT * FROM drizzle.__drizzle_migrations`).toEqual(migrations);
    const repository = createVideosRepository('postgres', database.db);
    const timestamp = 1_792_858_400_123;
    await repository.create({ ...video('persisted', timestamp), is_published: true });
    expect(await repository.findById('persisted')).toMatchObject({
      creation_timestamp: timestamp,
      is_published: true,
    });
    const reader = postgres(database.url, { max: 1 });
    try {
      expect(
        await reader`SELECT video_id, creation_timestamp::text, is_published FROM videos`
      ).toEqual([
        { video_id: 'persisted', creation_timestamp: String(timestamp), is_published: true },
      ]);
    } finally {
      await reader.end({ timeout: 5 });
    }
  });

  it('routes PostgreSQL initialization through the application database factory', async () => {
    database = await openTestDatabase();
    vi.resetModules();
    const factory = await import('@database/connection.js');
    const db = factory.createDatabase({ dialect: 'postgres', connectionString: database.url });
    const client = (db as unknown as { $client: postgres.Sql }).$client;
    try {
      await factory.initializeDatabaseSchema();
      expect(factory.getDatabase()).toBe(db);
      expect(await client`SELECT count(*)::int AS count FROM videos`).toEqual([{ count: 0 }]);
    } finally {
      await client.end({ timeout: 5 });
    }
  });

  it('wraps a real migration failure without recording a successful migration', async () => {
    database = await openTestDatabase();
    // This fixture owns the entire temporary database, including its migration journal.
    await database.client`DELETE FROM drizzle.__drizzle_migrations`;
    await database.client`DROP SCHEMA public CASCADE`;
    await database.client`CREATE SCHEMA public`;
    await database.client`CREATE FUNCTION drizzle.reject_migration() RETURNS trigger LANGUAGE plpgsql
      AS 'BEGIN RAISE EXCEPTION ''integration migration failure''; END'`;
    await database.client`CREATE TRIGGER reject_migration BEFORE INSERT ON drizzle.__drizzle_migrations
      FOR EACH ROW EXECUTE FUNCTION drizzle.reject_migration()`;
    await expect(connection.initializeDatabaseSchema()).rejects.toThrow(
      'Failed to initialize PostgreSQL database schema'
    );
    const [row] =
      await database.client`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
    expect(row?.['count']).toBe(0);
    expect(
      await database.client`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    ).toHaveLength(0);
  });

  it('preserves existing tables when the migration journal is missing', async () => {
    database = await openTestDatabase();
    await database.client`INSERT INTO links (url, svg_graphic, timestamp) VALUES ('existing', '<svg/>', 1)`;
    await database.client`DELETE FROM drizzle.__drizzle_migrations`;
    // The production initializer tolerates the real "relation already exists" error.
    await expect(connection.initializeDatabaseSchema()).resolves.toBeUndefined();
    expect(await database.client`SELECT url FROM links`).toEqual([{ url: 'existing' }]);
    expect(await database.client`SELECT * FROM drizzle.__drizzle_migrations`).toHaveLength(0);
  });

  it.each([
    ['source', 'src/database/postgres-connection.ts', 'drizzle/postgres'],
    ['bundled', 'dist/moartube-node.js', 'dist/drizzle/postgres'],
    ['standalone', 'release/moartube-node.js', 'release/drizzle/postgres'],
  ])('migrates a real %s directory layout', async (_name, modulePath, migrationsPath) => {
    const directory = mkdtempSync(join(tmpdir(), 'moartube-pg-layout-'));
    try {
      database = await openTestDatabase();
      await database.client`DROP SCHEMA public CASCADE`;
      await database.client`CREATE SCHEMA public`;
      await database.client`DELETE FROM drizzle.__drizzle_migrations`;
      const moduleFile = join(directory, modulePath);
      mkdirSync(dirname(moduleFile), { recursive: true });
      writeFileSync(moduleFile, '// Runtime module location');
      const migrationsFolder = join(directory, migrationsPath);
      cpSync(
        fileURLToPath(new URL('../../../drizzle/postgres', import.meta.url)),
        migrationsFolder,
        { recursive: true }
      );
      const resolved = connection.resolveMigrationsFolder(pathToFileURL(moduleFile).href);
      expect(resolved).toBe(migrationsFolder);
      await migrate(database.db, { migrationsFolder: resolved });
      await database.client`INSERT INTO links (url, svg_graphic, timestamp) VALUES ('layout', '<svg/>', 1)`;
      expect(await database.client`SELECT url FROM links`).toEqual([{ url: 'layout' }]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('wraps real driver errors after the connection is closed', async () => {
    database = await openTestDatabase();
    await database.client.end({ timeout: 5 });
    await expect(connection.initializeDatabaseSchema()).rejects.toThrow(
      'Failed to initialize PostgreSQL database schema'
    );
  });

  it('isolates simultaneous fixtures and drops their databases when closed', async () => {
    database = await openTestDatabase();
    const second = await openTestDatabase();
    const names = [database.url, second.url].map((url) => new URL(url).pathname.slice(1));
    const admin = postgres(connectionString, { max: 1, connect_timeout: 5 });
    try {
      await database.client`INSERT INTO links (url, svg_graphic, timestamp) VALUES ('first-only', '<svg/>', 1)`;
      expect(await second.client`SELECT count(*)::int AS count FROM links`).toEqual([{ count: 0 }]);
    } finally {
      try {
        await second.close();
        await database.close();
        database = undefined;
        expect(
          await admin`SELECT datname FROM pg_database WHERE datname IN ${admin(names)}`
        ).toHaveLength(0);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  });
});
