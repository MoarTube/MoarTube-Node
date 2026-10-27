import { createHash, randomUUID } from 'node:crypto';
import type SQLite from 'better-sqlite3';
import type postgres from 'postgres';
import {
  sqliteCommentTriggers,
  postgresCommentTriggers,
  sqliteCommentBackfill,
  postgresCommentBackfill,
} from './comment-sql.js';

const metadataDDL =
  'CREATE TABLE IF NOT EXISTS database_meta (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)';
const fingerprint = (sql: string, backfill: string): string =>
  createHash('sha256')
    .update('comment-provision-v1\0' + sql + '\0' + backfill)
    .digest('hex');

/** One atomic, versioned installation; healthy startups only read a small marker and catalog. */
export function provisionSQLiteComments(client: SQLite.Database): void {
  client
    .transaction(() => {
      client.exec(metadataDDL);
      const state = new Map(
        (
          client.prepare('SELECT key,value FROM database_meta').all() as {
            key: string;
            value: string;
          }[]
        ).map((row) => [row.key, row.value])
      );
      const version = fingerprint(sqliteCommentTriggers, sqliteCommentBackfill);
      const { count } = client
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('comment_cache_insert','comment_cache_update','comment_cache_delete')"
        )
        .get() as { count: number };
      if (
        state.get('comment_cache_provision') === version &&
        state.has('instance_id') &&
        count === 3
      ) {
        return;
      }
      client.exec(sqliteCommentTriggers);
      client.exec(sqliteCommentBackfill);
      const insert = client.prepare(
        'INSERT INTO database_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      );
      insert.run('instance_id', randomUUID());
      insert.run('comment_cache_provision', version);
    })
    .immediate();
}

export async function provisionPostgresComments(client: postgres.Sql): Promise<void> {
  await client.begin(async (tx) => {
    await tx.unsafe('SELECT pg_advisory_xact_lock(618265621)');
    await tx.unsafe(metadataDDL);
    const state = new Map(
      (
        await tx.unsafe<{ key: string; value: string }[]>('SELECT key,value FROM database_meta')
      ).map((row) => [row.key, row.value])
    );
    const version = fingerprint(postgresCommentTriggers, postgresCommentBackfill);
    const rows = await tx.unsafe<{ count: number }[]>(
      "SELECT count(*)::int AS count FROM pg_trigger WHERE tgrelid='comments'::regclass AND tgname='comment_cache_change' AND NOT tgisinternal"
    );
    if (
      state.get('comment_cache_provision') === version &&
      state.has('instance_id') &&
      (Array.from(rows) as [{ count: number }])[0].count === 1
    ) {
      return;
    }
    await tx.unsafe('LOCK TABLE comments IN SHARE ROW EXCLUSIVE MODE');
    await tx.unsafe(postgresCommentTriggers).simple();
    await tx.unsafe(postgresCommentBackfill).simple();
    await tx.unsafe(
      "INSERT INTO database_meta(key,value) VALUES('instance_id',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [randomUUID()]
    );
    await tx.unsafe(
      "INSERT INTO database_meta(key,value) VALUES('comment_cache_provision',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [version]
    );
  });
}
