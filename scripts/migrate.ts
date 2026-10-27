import { mkdirSync } from 'node:fs';
import path from 'node:path';
import * as sqlite from '../src/database/sqlite-connection.js';
import * as postgres from '../src/database/postgres-connection.js';
const dialect = process.env['DATABASE_DIALECT'] ?? 'sqlite';
if (dialect === 'sqlite') {
  const filepath = process.env['DATABASE_URL'] ?? './data/db/node_db.sqlite';
  mkdirSync(path.dirname(path.resolve(filepath)), { recursive: true });
  const db = sqlite.createDatabase({ filepath });
  try {
    sqlite.initializeDatabaseSchema();
  } finally {
    db.$client.close();
  }
} else if (dialect === 'postgres' || dialect === 'postgresql') {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL migrations');
  const db = postgres.createDatabase({ connectionString });
  try {
    await postgres.initializeDatabaseSchema();
  } finally {
    await db.$client.end({ timeout: 5 });
  }
} else throw new Error('Unsupported DATABASE_DIALECT: ' + dialect);
