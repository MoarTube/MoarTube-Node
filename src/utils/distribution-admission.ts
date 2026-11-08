import Database from 'better-sqlite3';
import { getConfig } from '@/config/index.js';
import { withSettingsChange } from './settings-change.js';
import { hasPendingCdn } from './cdn-journal.js';

function remoteWrites(): Database.Database {
  const db = new Database(getConfig().paths.nodeSettingsPath + '.remote-writes.sqlite', {
    timeout: 0,
  });
  db.exec(
    'CREATE TABLE IF NOT EXISTS writes (id TEXT PRIMARY KEY, video TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, finished INTEGER)'
  );
  db.prepare('DELETE FROM writes WHERE active=0 AND finished<?').run(Date.now() - 86400000);
  return db;
}

/** Serialize transitions with job starts, exclude live HTTP writes, and retain remote-write intent across restart. */
export function withDistributionTransition<T>(
  operation: () => Promise<T>,
  action = 'changing distribution settings'
): Promise<T> {
  const file = getConfig().paths.nodeSettingsPath;
  return withSettingsChange(file + '.distribution', async () => {
    const media = new Database(file + '.media-lock.sqlite', { timeout: 0 });
    try {
      try {
        media.exec('BEGIN EXCLUSIVE');
      } catch {
        throw new Error(`Wait for active uploads to finish before ${action}.`);
      }
      const remote = remoteWrites();
      try {
        if (remote.prepare('SELECT 1 FROM writes WHERE active=1 LIMIT 1').get() !== undefined) {
          throw new Error(
            `Wait for direct storage writes to finish or recover interrupted Client writes before ${action}.`
          );
        }
      } finally {
        remote.close();
      }
      return await operation();
    } finally {
      media.close();
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
        hasPendingCdn(config.paths.nodeSettingsPath)
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
  const lease = await withJobAdmission(() => {
    const db = new Database(getConfig().paths.nodeSettingsPath + '.media-lock.sqlite', {
      timeout: 0,
    });
    try {
      db.exec('BEGIN');
      db.prepare('SELECT count(*) FROM sqlite_master').get();
      return Promise.resolve(db);
    } catch (error) {
      db.close();
      throw error;
    }
  });
  try {
    return await operation();
  } finally {
    lease.close();
  }
}

export function beginRemoteWrite(video: string, id: string): Promise<void> {
  return withJobAdmission(() => {
    const db = remoteWrites();
    try {
      const previous = db.prepare('SELECT video, active FROM writes WHERE id=?').get(id) as
        | { video: string; active: number }
        | undefined;
      if (previous && previous.video !== video) {
        throw new Error('Storage activity belongs to another video.');
      }
      if (previous?.active === 0) {
        throw new Error('Storage activity already finished.');
      }
      db.prepare('INSERT OR IGNORE INTO writes (id,video) VALUES (?,?)').run(id, video);
      return Promise.resolve();
    } finally {
      db.close();
    }
  });
}
export function finishRemoteWrite(video: string, id: string): void {
  const db = remoteWrites();
  try {
    db.prepare(
      'INSERT INTO writes (id,video,active,finished) VALUES (?,?,0,?) ON CONFLICT(id) DO UPDATE SET active=0,finished=excluded.finished WHERE writes.video=excluded.video'
    ).run(id, video, Date.now());
  } finally {
    db.close();
  }
}
