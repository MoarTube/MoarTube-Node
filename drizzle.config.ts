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

const dialect = (process.env['DATABASE_DIALECT'] ?? 'sqlite') as 'sqlite' | 'postgresql';
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
