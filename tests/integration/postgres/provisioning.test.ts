import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTestDatabase, comment } from './helpers.js';
import * as connection from '@/database/postgres-connection.js';
import { createCommentsRepository } from '@/database/repositories/comments/index.js';

describe('reproducible comment provisioning (postgres)', () => {
  let directory: string;
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'moartube-fresh-'));
    const result = spawnSync(
      process.execPath,
      ['scripts/ensure-migrations.mjs', '--out-root', directory],
      { cwd: resolve('.'), encoding: 'utf8' }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const folder = join(directory, 'postgres');
    const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'));
    const sql = readFileSync(join(folder, journal.entries[0].tag + '.sql'), 'utf8');
    expect(sql).not.toMatch(/CREATE (?:OR REPLACE )?(?:TRIGGER|FUNCTION)/i);
  }, 30000);
  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('provisions triggers and cache metadata from newly generated schema-only migrations', async () => {
    const database = await openTestDatabase();
    try {
      await database.client`DROP SCHEMA public CASCADE`;
      await database.client`CREATE SCHEMA public`;
      await database.client`DELETE FROM drizzle.__drizzle_migrations`;
      await connection.initializeDatabaseSchema({ migrationsFolder: join(directory, 'postgres') });
      const repository = createCommentsRepository('postgres', database.db);
      const parent = await repository.create(comment('a', 100));
      const child = await repository.create({
        ...comment('a', 200),
        comment_plain_text_sanitized: `&gt;&gt;00${parent.comment_id}`,
      });
      expect(await repository.getBacklinksForComments('a', [parent.comment_id])).toEqual([
        { parent_id: parent.comment_id, reply_id: child.comment_id },
      ]);
      const epoch = await repository.getCacheEpoch();
      expect(epoch).toMatch(/^[a-f0-9-]{36}$/);
      const version = await repository.getCacheVersion('a');
      await repository.delete('a', child.comment_id, 200);
      expect(await repository.getCacheChanges('a', version)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ comment_id: child.comment_id, deleted: 1 }),
        ])
      );
      await connection.initializeDatabaseSchema({ migrationsFolder: join(directory, 'postgres') });
      expect(await repository.getCacheEpoch()).toBe(epoch);
    } finally {
      await database.close();
    }
  });

  it('repairs missing triggers and backfills changes without changing healthy database identities', async () => {
    const database = await openTestDatabase();
    try {
      const repository = createCommentsRepository('postgres', database.db);
      const parent = await repository.create(comment('a', 100));
      const removed = await repository.create(comment('a', 150));
      const epoch = await repository.getCacheEpoch();
      await database.client`DROP TRIGGER comment_cache_change ON comments`;
      const child = await repository.create({
        ...comment('a', 200),
        comment_plain_text_sanitized: `&gt;&gt;${parent.comment_id}`,
      });
      await repository.delete('a', removed.comment_id, 150);
      await connection.initializeDatabaseSchema();
      expect(await repository.getBacklinksForComments('a', [parent.comment_id])).toEqual([
        { parent_id: parent.comment_id, reply_id: child.comment_id },
      ]);
      expect(await repository.getCacheChanges('a', 0)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ comment_id: removed.comment_id, deleted: 1 }),
        ])
      );
      const repaired = await repository.getCacheEpoch();
      expect(repaired).not.toBe(epoch);
      const version = await repository.getCacheVersion('a');
      await connection.initializeDatabaseSchema();
      expect(await repository.getCacheEpoch()).toBe(repaired);
      expect(await repository.getCacheVersion('a')).toBe(version);
    } finally {
      await database.close();
    }
  });
  it('rolls back a failed operational repair instead of starting with partial triggers', async () => {
    const database = await openTestDatabase();
    try {
      const repository = createCommentsRepository('postgres', database.db);
      await repository.create(comment('a', 100));
      const epoch = await repository.getCacheEpoch();
      await database.client`DROP TRIGGER comment_cache_change ON comments`;
      await database.client`CREATE FUNCTION reject_backfill() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''Backfill failed''; END'`;
      await database.client`CREATE TRIGGER reject_backfill BEFORE INSERT ON comment_changes FOR EACH ROW EXECUTE FUNCTION reject_backfill()`;
      await expect(connection.initializeDatabaseSchema()).rejects.toThrow('Backfill failed');
      expect(
        await database.client`SELECT tgname FROM pg_trigger WHERE tgname='comment_cache_change'`
      ).toHaveLength(0);
      await database.client`DROP TRIGGER reject_backfill ON comment_changes`;
      expect(await repository.getCacheEpoch()).toBe(epoch);
      expect(await repository.countByVideoId('a')).toBe(1);
      await connection.initializeDatabaseSchema();
      expect(await repository.getCacheEpoch()).not.toBe(epoch);
    } finally {
      await database.close();
    }
  });
  it('the migration CLI accepts both PostgreSQL dialect names and preserves healthy state', async () => {
    const database = await openTestDatabase();
    try {
      const repository = createCommentsRepository('postgres', database.db),
        epoch = await repository.getCacheEpoch();
      for (const dialect of ['postgres', 'postgresql']) {
        const result = spawnSync(
          process.execPath,
          ['node_modules/tsx/dist/cli.mjs', 'scripts/migrate.ts'],
          {
            cwd: resolve('.'),
            env: { ...process.env, DATABASE_DIALECT: dialect, DATABASE_URL: database.url },
            encoding: 'utf8',
          }
        );
        expect(result.status, result.stdout + result.stderr).toBe(0);
        expect(await repository.getCacheEpoch()).toBe(epoch);
      }
    } finally {
      await database.close();
    }
  });
});
