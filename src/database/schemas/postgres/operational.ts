import { pgTable, text, integer, bigint, primaryKey } from 'drizzle-orm/pg-core';

export const nodePurges = pgTable(
  'node_purges',
  {
    zone: text('zone').notNull(),
    target: text('target').notNull(),
    token: text('token').notNull(),
  },
  (table) => [primaryKey({ columns: [table.zone, table.target] })]
);
export const nodePurgeBackoff = pgTable('node_purge_backoff', {
  zone: text('zone').primaryKey(),
  until_ms: bigint('until_ms', { mode: 'number' }).notNull(),
});
export const nodePurgeCredentials = pgTable('node_purge_credentials', {
  zone: text('zone').primaryKey(),
  email: text('email').notNull(),
  key: text('key').notNull(),
});
export const nodeRemoteWrites = pgTable('node_remote_writes', {
  id: text('id').primaryKey(),
  video: text('video').notNull(),
  active: integer('active').notNull().default(1),
  finished: bigint('finished', { mode: 'number' }),
});
export const nodeOperationalMeta = pgTable('node_operational_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
export const nodeRecovery = pgTable('node_recovery', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
