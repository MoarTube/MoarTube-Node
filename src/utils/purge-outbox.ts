import { randomUUID } from 'node:crypto';
import {
  OperationalDatabase,
  type OperationalConfig,
  type Statement,
} from '@/database/operational.js';

export interface PurgeEntry {
  target: string;
  token: string;
}
export interface PurgeCredentials {
  zone: string;
  email: string;
  key: string;
}

/** Pending invalidations belong to the authoritative database, including old-zone credentials. */
export function purgeOutbox(config: OperationalConfig) {
  const db = new OperationalDatabase(config);
  return {
    async enqueue(zone: string, targets: string[], credentials?: PurgeCredentials): Promise<void> {
      const statements: Statement[] = targets.map((target) => ({
        sql: 'INSERT INTO node_purges VALUES (?,?,?) ON CONFLICT(zone,target) DO UPDATE SET token=excluded.token',
        parameters: [zone, target, randomUUID()],
      }));
      if (credentials) {
        statements.push({
          sql: 'INSERT INTO node_purge_credentials SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM node_purges WHERE zone=?) ON CONFLICT(zone) DO UPDATE SET email=excluded.email,key=excluded.key',
          parameters: [zone, credentials.email, credentials.key, zone],
        });
      }
      await db.batch(statements);
    },
    async snapshot(zone: string): Promise<PurgeEntry[]> {
      return db.query<PurgeEntry & Record<string, unknown>>(
        'SELECT target,token FROM node_purges WHERE zone=?',
        [zone]
      );
    },
    async acknowledge(zone: string, entries: PurgeEntry[]): Promise<void> {
      await db.batch([
        ...entries.map((entry) => ({
          sql: 'DELETE FROM node_purges WHERE zone=? AND target=? AND token=?',
          parameters: [zone, entry.target, entry.token],
        })),
        {
          sql: 'DELETE FROM node_purge_credentials WHERE zone=? AND NOT EXISTS (SELECT 1 FROM node_purges WHERE zone=?)',
          parameters: [zone, zone],
        },
      ]);
    },
    async pendingCredentials(): Promise<PurgeCredentials[]> {
      return db.query<PurgeCredentials & Record<string, unknown>>(
        'SELECT zone,email,key FROM node_purge_credentials WHERE zone IN (SELECT zone FROM node_purges)'
      );
    },
    async notBefore(zone: string): Promise<number> {
      const rows = await db.query('SELECT until_ms FROM node_purge_backoff WHERE zone=?', [zone]);
      return Number(rows[0]?.['until_ms'] ?? 0);
    },
    async defer(zone: string, until: number): Promise<void> {
      await db.query(
        'INSERT INTO node_purge_backoff VALUES (?,?) ON CONFLICT(zone) DO UPDATE SET until_ms=CASE WHEN node_purge_backoff.until_ms>excluded.until_ms THEN node_purge_backoff.until_ms ELSE excluded.until_ms END',
        [zone, until]
      );
    },
    close: () => db.close(),
  };
}
