import { OperationalDatabase, operationalConfig } from '@/database/operational.js';
import { acquirePostgresLock } from '@/database/coordination.js';
import Database from 'better-sqlite3';
import { getConfig } from '@/config/index.js';
import { withSettingsChange } from './settings-change.js';
import { hasPendingCdn } from './cdn-journal.js';

async function remoteWrites(): Promise<OperationalDatabase> {
  const db = new OperationalDatabase(operationalConfig(getConfig()));
  try {
    await db.query('DELETE FROM node_remote_writes WHERE active=0 AND finished<?', [
      Date.now() - 86400000,
    ]);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

/** Serialize transitions with job starts, exclude live HTTP writes, and retain remote-write intent across restart. */
export function withDistributionTransition<T>(
  operation: () => Promise<T>,
  action = 'changing distribution settings'
): Promise<T> {
  const file = getConfig().paths.nodeSettingsPath;
  return withSettingsChange(file + '.distribution', async () => {
    const selected = operationalConfig(getConfig());
    const release =
      selected.dialect === 'postgres' ? await acquirePostgresLock(selected, 'media') : undefined;
    const media =
      selected.dialect === 'sqlite'
        ? new Database(file + '.media-lock.sqlite', { timeout: 0 })
        : undefined;
    try {
      try {
        media?.exec('BEGIN EXCLUSIVE');
      } catch {
        throw new Error(`Wait for active uploads to finish before ${action}.`);
      }
      const remote = await remoteWrites();
      try {
        if (
          (await remote.query('SELECT 1 FROM node_remote_writes WHERE active=1 LIMIT 1')).length > 0
        ) {
          throw new Error(
            `Wait for direct storage writes to finish or recover interrupted Client writes before ${action}.`
          );
        }
      } finally {
        await remote.close();
      }
      return await operation();
    } finally {
      media?.close();
      await release?.();
    }
  });
}

export function withJobAdmission<T>(operation: () => Promise<T>): Promise<T> {
  const config = getConfig();
  return withSettingsChange(config.paths.nodeSettingsPath + '.distribution', () =>
    withSettingsChange(config.paths.nodeSettingsPath, async () => {
      config.reloadNodeSettings(true);
      if (
        config.nodeSettings.cloudflareAddressMigrationPending ||
        (await hasPendingCdn(config.paths.nodeSettingsPath))
      ) {
        throw new Error(
          'Finish or retry the CDN address migration before starting imports, publishing, or streams.'
        );
      }
      return operation();
    })
  );
}

/** Shared OS lock covers the entire write, including completion/invalidation; death releases it. */
export async function withMediaWrite<T>(operation: () => Promise<T>): Promise<T> {
  const lease = await withJobAdmission(async () => {
    const selected = operationalConfig(getConfig());
    if (selected.dialect === 'postgres') {
      return acquirePostgresLock(selected, 'media', true);
    }
    const db = new Database(getConfig().paths.nodeSettingsPath + '.media-lock.sqlite', {
      timeout: 0,
    });
    try {
      db.exec('BEGIN');
      db.prepare('SELECT count(*) FROM sqlite_master').get();
      return () => Promise.resolve(db.close());
    } catch (error) {
      db.close();
      throw error;
    }
  });
  try {
    return await operation();
  } finally {
    await lease();
  }
}

export function beginRemoteWrite(video: string, id: string): Promise<void> {
  return withJobAdmission(async () => {
    const db = await remoteWrites();
    try {
      // Conflict checks and insertion are one statement, so multiple workers cannot steal an id.
      const rows = await db.query(
        'INSERT INTO node_remote_writes (id,video) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET video=node_remote_writes.video WHERE node_remote_writes.video=excluded.video AND node_remote_writes.active=1 RETURNING id',
        [id, video]
      );
      if (!rows.length) {
        throw new Error('Storage activity belongs to another video or already finished.');
      }
    } finally {
      await db.close();
    }
  });
}
export async function finishRemoteWrite(video: string, id: string): Promise<void> {
  const db = await remoteWrites();
  try {
    await db.query(
      'INSERT INTO node_remote_writes (id,video,active,finished) VALUES (?,?,0,?) ON CONFLICT(id) DO UPDATE SET active=0,finished=excluded.finished WHERE node_remote_writes.video=excluded.video',
      [id, video, Date.now()]
    );
  } finally {
    await db.close();
  }
}
