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
export default {
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? './data/db/node_db.sqlite',
  },
} satisfies Config;
