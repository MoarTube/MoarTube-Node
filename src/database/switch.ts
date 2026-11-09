import { OperationalDatabase, type OperationalConfig } from './operational.js';

export const activeDatabaseMessage =
  'Stop or finish all imports, publishing jobs, uploads, and live streams before switching databases.';
/** A switch selects a database; it never transfers jobs or catalog data. */
export async function assertDatabaseIdle(config: OperationalConfig): Promise<void> {
  const db = new OperationalDatabase(config);
  try {
    const tables =
      config.dialect === 'sqlite'
        ? await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='videos'")
        : await db.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='videos'"
          );
    const active = tables.length
      ? await db.query(
          'SELECT 1 FROM videos WHERE is_importing OR is_publishing OR is_streaming LIMIT 1'
        )
      : [];
    if (active.length) {
      throw new Error(activeDatabaseMessage);
    }
    if ((await db.query('SELECT 1 FROM node_remote_writes WHERE active=1 LIMIT 1')).length) {
      throw new Error(activeDatabaseMessage);
    }
    if ((await db.query('SELECT 1 FROM node_purges LIMIT 1')).length) {
      throw new Error('Finish pending CDN invalidations before switching databases.');
    }
    for (const row of await db.query<{ key: string; value: string }>(
      'SELECT key,value FROM node_recovery'
    )) {
      if (row.key.startsWith('cleanup:')) {
        throw new Error('Finish pending stream cleanup before switching databases.');
      }
      if (row.key === 'cdn') {
        const journal = JSON.parse(row.value) as { current?: { stage?: string } | null };
        if (journal.current && journal.current.stage !== 'complete') {
          throw new Error('Finish the pending CDN transition before switching databases.');
        }
      }
    }
  } finally {
    await db.close();
  }
}
