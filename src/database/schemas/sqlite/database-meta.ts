import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const databaseMeta = sqliteTable('database_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
