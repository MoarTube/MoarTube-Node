import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { openSync, closeSync } from 'node:fs';

export interface PurgeEntry {
  target: string;
  token: string;
}
export interface PurgeCredentials {
  zone: string;
  email: string;
  key: string;
}

/** Brief SQLite transactions coordinate workers; no lock is held during network I/O. */
export function purgeOutbox(file: string) {
  closeSync(openSync(file, 'a', 0o600));
  const db = new Database(file, { timeout: 5000 });
  db.pragma('secure_delete = ON');
  db.exec(
    'CREATE TABLE IF NOT EXISTS purges (zone TEXT, target TEXT, token TEXT, PRIMARY KEY(zone,target))'
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS purge_backoff (zone TEXT PRIMARY KEY, until_ms INTEGER NOT NULL)'
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS purge_credentials (zone TEXT PRIMARY KEY, email TEXT NOT NULL, key TEXT NOT NULL)'
  );
  return {
    enqueue(zone: string, targets: string[], credentials?: PurgeCredentials): void {
      const put = db.prepare(
        'INSERT INTO purges VALUES (?,?,?) ON CONFLICT(zone,target) DO UPDATE SET token=excluded.token'
      );
      db.transaction(() => {
        for (const target of targets) {
          put.run(zone, target, randomUUID());
        }
        if (
          credentials &&
          db.prepare('SELECT 1 FROM purges WHERE zone=? LIMIT 1').get(zone) !== undefined
        ) {
          db.prepare(
            'INSERT INTO purge_credentials VALUES (?,?,?) ON CONFLICT(zone) DO UPDATE SET email=excluded.email,key=excluded.key'
          ).run(zone, credentials.email, credentials.key);
        }
      })();
    },
    snapshot(zone: string): PurgeEntry[] {
      return db.prepare('SELECT target,token FROM purges WHERE zone=?').all(zone) as PurgeEntry[];
    },
    acknowledge(zone: string, entries: PurgeEntry[]): void {
      const remove = db.prepare('DELETE FROM purges WHERE zone=? AND target=? AND token=?');
      db.transaction(() => {
        for (const entry of entries) {
          remove.run(zone, entry.target, entry.token);
        }
      })();
      db.prepare(
        'DELETE FROM purge_credentials WHERE zone=? AND NOT EXISTS (SELECT 1 FROM purges WHERE zone=?)'
      ).run(zone, zone);
    },
    pendingCredentials(): PurgeCredentials[] {
      return db
        .prepare(
          'SELECT zone,email,key FROM purge_credentials WHERE zone IN (SELECT zone FROM purges)'
        )
        .all() as PurgeCredentials[];
    },
    notBefore(zone: string): number {
      return (
        (
          db.prepare('SELECT until_ms FROM purge_backoff WHERE zone=?').get(zone) as
            | { until_ms: number }
            | undefined
        )?.until_ms ?? 0
      );
    },
    defer(zone: string, until: number): void {
      db.prepare(
        'INSERT INTO purge_backoff VALUES (?,?) ON CONFLICT(zone) DO UPDATE SET until_ms=MAX(until_ms,excluded.until_ms)'
      ).run(zone, until);
    },
    close(): void {
      db.close();
    },
  };
}
