import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for database migrations
 *
 * This configuration supports both SQLite and PostgreSQL databases.
 * The dialect is determined by the DATABASE_DIALECT environment variable.
 *
 * Usage:
 *   - Generate migrations: npm run db:generate
 *   - Apply migrations: npm run db:migrate
 *   - Open Drizzle Studio: npm run db:studio
 */

const requestedDialect = process.env['DATABASE_DIALECT'] ?? 'sqlite';
if (!['sqlite', 'postgres', 'postgresql'].includes(requestedDialect))
  throw new Error('Unsupported DATABASE_DIALECT: ' + requestedDialect);
const dialect = (requestedDialect === 'postgres' ? 'postgresql' : requestedDialect) as
  | 'sqlite'
  | 'postgresql';
const schemaDialect = dialect === 'postgresql' ? 'postgres' : 'sqlite';
const outDir = dialect === 'postgresql' ? './drizzle/postgres' : './drizzle/sqlite';

export default {
  schema: `./src/database/schemas/${schemaDialect}/index.ts`,
  out: outDir,
  dialect: dialect,
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? './data/db/node_db.sqlite',
  },
} satisfies Config;
