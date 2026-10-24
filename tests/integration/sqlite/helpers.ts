import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type SQLite from 'better-sqlite3';
import {
  createDatabase,
  initializeDatabaseSchema,
  type DatabaseClient,
} from '@database/sqlite-connection.js';

/** Each test owns a migrated file database, including its native handle and directory. */
export function openTestDatabase(): {
  db: DatabaseClient;
  client: SQLite.Database;
  close: () => void;
} {
  const directory = mkdtempSync(join(tmpdir(), 'moartube-sqlite-'));
  let client: SQLite.Database | undefined;
  try {
    const db = createDatabase({ filepath: join(directory, 'test.sqlite') });
    client = (db as DatabaseClient & { $client: SQLite.Database }).$client;
    initializeDatabaseSchema();
    return {
      db,
      client,
      close() {
        client?.close();
        rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    client?.close();
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export { video, comment, message, report } from '../fixtures.js';
