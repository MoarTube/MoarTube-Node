// Maintained transactionally by the comment-cache migration triggers, including bulk imports.
import {
  sqliteTable,
  integer,
  text,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

export const commentEdges = sqliteTable(
  'comment_edges',
  {
    video_id: text('video_id').notNull(),
    parent_id: integer('parent_id').notNull(),
    reply_id: integer('reply_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.video_id, t.parent_id, t.reply_id] }),
    index('comment_edges_source').on(t.video_id, t.reply_id, t.parent_id),
  ]
);

export const commentChanges = sqliteTable(
  'comment_changes',
  {
    version: integer('version').primaryKey({ autoIncrement: true }),
    video_id: text('video_id').notNull(),
    comment_id: integer('comment_id').notNull(),
    deleted: integer('deleted').notNull().default(0),
  },
  (t) => [
    uniqueIndex('comment_changes_identity').on(t.video_id, t.comment_id),
    index('comment_changes_video').on(t.video_id, t.version),
  ]
);
