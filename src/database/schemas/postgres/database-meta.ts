import { pgTable, text } from 'drizzle-orm/pg-core';
export const databaseMeta = pgTable('database_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
