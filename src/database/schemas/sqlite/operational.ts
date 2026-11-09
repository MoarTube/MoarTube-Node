import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

export const nodePurges = sqliteTable(
  'node_purges',
  {
    zone: text('zone').notNull(),
    target: text('target').notNull(),
    token: text('token').notNull(),
  },
  (table) => [primaryKey({ columns: [table.zone, table.target] })]
);
export const nodePurgeBackoff = sqliteTable('node_purge_backoff', {
  zone: text('zone').primaryKey(),
  until_ms: integer('until_ms').notNull(),
});
export const nodePurgeCredentials = sqliteTable('node_purge_credentials', {
  zone: text('zone').primaryKey(),
  email: text('email').notNull(),
  key: text('key').notNull(),
});
export const nodeRemoteWrites = sqliteTable('node_remote_writes', {
  id: text('id').primaryKey(),
  video: text('video').notNull(),
  active: integer('active').notNull().default(1),
  finished: integer('finished'),
});
export const nodeOperationalMeta = sqliteTable('node_operational_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
export const nodeRecovery = sqliteTable('node_recovery', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
