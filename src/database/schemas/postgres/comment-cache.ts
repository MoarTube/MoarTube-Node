// Maintained transactionally by the comment-cache migration triggers, including bulk imports.
import {
  pgTable,
  bigint,
  bigserial,
  integer,
  text,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const commentEdges = pgTable(
  'comment_edges',
  {
    video_id: text('video_id').notNull(),
    parent_id: bigint('parent_id', { mode: 'number' }).notNull(),
    reply_id: bigint('reply_id', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.video_id, t.parent_id, t.reply_id] }),
    index('comment_edges_source').on(t.video_id, t.reply_id, t.parent_id),
  ]
);

export const commentChanges = pgTable(
  'comment_changes',
  {
    version: bigserial('version', { mode: 'number' }).primaryKey(),
    video_id: text('video_id').notNull(),
    comment_id: bigint('comment_id', { mode: 'number' }).notNull(),
    deleted: integer('deleted').notNull().default(0),
  },
  (t) => [
    uniqueIndex('comment_changes_identity').on(t.video_id, t.comment_id),
    index('comment_changes_video').on(t.video_id, t.version),
  ]
);
