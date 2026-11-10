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
    /** GCRA token bucket, atomically shared by all workers and zones using this account. */
    async reserve(
      scope: string,
      cost: number,
      interval: number,
      capacity: number,
      now = Date.now()
    ): Promise<boolean> {
      const key = 'purge-budget:' + scope;
      const rows = await db.query(
        `INSERT INTO node_operational_meta (key,value) VALUES (?,?)
         ON CONFLICT(key) DO UPDATE SET value=CAST((CASE WHEN CAST(node_operational_meta.value AS DOUBLE PRECISION)>? THEN CAST(node_operational_meta.value AS DOUBLE PRECISION) ELSE ? END)+? AS TEXT)
         WHERE CAST(node_operational_meta.value AS DOUBLE PRECISION)<=? RETURNING key`,
        [
          key,
          String(now + cost * interval),
          now,
          now,
          cost * interval,
          now + (capacity - cost) * interval,
        ]
      );
      return rows.length > 0;
    },
    /** A crashed dispatch owner releases automatically after the bounded HTTP deadline. */
    async claim(
      scope: string,
      now = Date.now()
    ): Promise<
      | {
          renew: () => Promise<boolean>;
          release: () => Promise<void>;
        }
      | undefined
    > {
      const key = 'purge-dispatch:' + scope;
      let until = String(now + 120_000);
      const rows = await db.query(
        'INSERT INTO node_operational_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(node_operational_meta.value AS BIGINT)<=? RETURNING key',
        [key, until, now]
      );
      return rows.length
        ? {
            async renew() {
              const now = Date.now(),
                next = String(now + 120_000);
              const rows = await db.query(
                'UPDATE node_operational_meta SET value=? WHERE key=? AND value=? AND CAST(value AS BIGINT)>? RETURNING key',
                [next, key, until, now]
              );
              if (rows.length) {
                until = next;
              }
              return rows.length > 0;
            },
            async release() {
              await db.query('DELETE FROM node_operational_meta WHERE key=? AND value=?', [
                key,
                until,
              ]);
            },
          }
        : undefined;
    },
    close: () => db.close(),
  };
}
