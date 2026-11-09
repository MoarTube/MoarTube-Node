import SQLite from 'better-sqlite3';
import postgres from 'postgres';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { PostgresConfig } from '@/types/config.js';

export type OperationalConfig =
  | { dialect: 'sqlite'; filepath: string }
  | { dialect: 'postgres'; connectionString: string };
export function operationalConfig(config: {
  paths: { databaseFilePath?: string; nodeSettingsPath: string };
  nodeSettings: {
    databaseConfig?:
      | { databaseDialect: 'sqlite' | 'postgres'; postgresConfig?: PostgresConfig | undefined }
      | undefined;
  };
}): OperationalConfig {
  const selected = config.nodeSettings.databaseConfig;
  if (selected?.databaseDialect === 'postgres') {
    const pg = selected.postgresConfig;
    if (!pg) {
      throw new Error('Missing PostgreSQL configuration');
    }
    const url = new URL('postgres://localhost');
    url.hostname = pg.host;
    url.port = String(pg.port);
    url.username = pg.username;
    url.password = pg.password;
    url.pathname = '/' + encodeURIComponent(pg.databaseName);
    return { dialect: 'postgres', connectionString: url.toString() };
  }
  return {
    dialect: 'sqlite',
    filepath:
      config.paths.databaseFilePath ??
      path.join(path.dirname(config.paths.nodeSettingsPath), 'db/node_db.sqlite'),
  };
}

export const operationalSchema = [
  'CREATE TABLE IF NOT EXISTS node_purges (zone TEXT NOT NULL, target TEXT NOT NULL, token TEXT NOT NULL, PRIMARY KEY(zone,target))',
  'CREATE TABLE IF NOT EXISTS node_purge_backoff (zone TEXT PRIMARY KEY, until_ms BIGINT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS node_purge_credentials (zone TEXT PRIMARY KEY, email TEXT NOT NULL, key TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS node_remote_writes (id TEXT PRIMARY KEY, video TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, finished BIGINT)',
  'CREATE TABLE IF NOT EXISTS node_operational_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS node_recovery (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
];
export interface Statement {
  sql: string;
  parameters?: (string | number | null)[];
}

/** Each handle is bound to one database. No PostgreSQL operation opens SQLite. */
export class OperationalDatabase {
  private sqlite?: SQLite.Database;
  private pg?: postgres.Sql;
  private ready?: Promise<void>;
  constructor(readonly config: OperationalConfig) {
    if (!['sqlite', 'postgres'].includes(config.dialect)) {
      throw new Error('Invalid operational database selection');
    }
  }
  private initialize(): Promise<void> {
    this.ready ??= (async () => {
      if (this.config.dialect === 'sqlite') {
        mkdirSync(path.dirname(this.config.filepath), { recursive: true });
        this.sqlite = new SQLite(this.config.filepath, { timeout: 5000 });
        this.sqlite.pragma('secure_delete = ON');
        this.sqlite.exec(operationalSchema.join(';').replaceAll('BIGINT', 'INTEGER'));
      } else {
        this.pg = postgres(this.config.connectionString, {
          max: 1,
          connect_timeout: 10,
          onnotice: () => {},
        });
        for (const sql of operationalSchema) {
          await this.pg.unsafe(sql);
        }
      }
    })();
    return this.ready;
  }
  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters: (string | number | null)[] = []
  ): Promise<T[]> {
    await this.initialize();
    if (this.sqlite) {
      const statement = this.sqlite.prepare(sql);
      if (statement.reader) {
        return statement.all(...parameters) as T[];
      }
      statement.run(...parameters);
      return [];
    }
    let parameter = 0;
    return await this.postgresClient().unsafe<T[]>(
      sql.replaceAll('?', () => '$' + String(++parameter)),
      parameters
    );
  }
  async batch(statements: Statement[]): Promise<void> {
    await this.initialize();
    const sqlite = this.sqlite;
    if (sqlite) {
      sqlite.transaction(() => {
        for (const { sql, parameters = [] } of statements) {
          sqlite.prepare(sql).run(...parameters);
        }
      })();
    } else {
      await this.postgresClient().begin(async (sql) => {
        for (const statement of statements) {
          let parameter = 0;
          await sql.unsafe(
            statement.sql.replaceAll('?', () => '$' + String(++parameter)),
            statement.parameters ?? []
          );
        }
      });
    }
  }
  private postgresClient(): postgres.Sql {
    if (this.pg === undefined) {
      throw new Error('PostgreSQL operational database is not initialized');
    }
    return this.pg;
  }
  async close(): Promise<void> {
    try {
      await this.ready;
    } finally {
      this.sqlite?.close();
      await this.pg?.end({ timeout: 5 });
    }
  }
}
