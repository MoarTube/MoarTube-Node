import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import {
  createDatabase,
  initializeDatabaseSchema,
  type DatabaseClient,
} from '@database/postgres-connection.js';

export { video, comment, message, report } from '../fixtures.js';

export const connectionString = 'postgres://postgres:postgres@localhost:5432/postgres';

/** Own a separate database so migrations, triggers, and deletes cannot touch application data. */
export async function openTestDatabase(): Promise<{
  db: DatabaseClient;
  client: postgres.Sql;
  url: string;
  ignoreInserts: (table: string) => Promise<void>;
  close: () => Promise<void>;
}> {
  const databaseName = `moartube_test_${randomUUID().replaceAll('-', '')}`;
  const admin = postgres(connectionString, { max: 1, connect_timeout: 5, onnotice: () => {} });
  let client: postgres.Sql | undefined;
  let created = false;
  async function close(): Promise<void> {
    try {
      await client?.end({ timeout: 5 });
    } finally {
      try {
        if (created) {
          // Drop only this fixture's generated database, never the supplied postgres database.
          if (!/^moartube_test_[a-f0-9]{32}$/.test(databaseName)) {
            throw new Error('Invalid integration database name');
          }
          await admin`DROP DATABASE ${admin(databaseName)}`;
          created = false;
        }
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
  }
  try {
    await admin`CREATE DATABASE ${admin(databaseName)} TEMPLATE template0`;
    created = true;
    const url = new URL(connectionString);
    url.pathname = `/${databaseName}`;
    url.searchParams.set('max', '1');
    url.searchParams.set('connect_timeout', '5');
    url.searchParams.set('client_min_messages', 'warning');
    const db = createDatabase({ connectionString: url.toString() });
    client = (db as DatabaseClient & { $client: postgres.Sql }).$client;
    await initializeDatabaseSchema();
    const sql = client;
    return {
      db,
      client: sql,
      url: url.toString(),
      async ignoreInserts(table) {
        await sql`CREATE FUNCTION ignore_insert() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'`;
        await sql`CREATE TRIGGER ignore_insert BEFORE INSERT ON ${sql(table)} FOR EACH ROW EXECUTE FUNCTION ignore_insert()`;
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
