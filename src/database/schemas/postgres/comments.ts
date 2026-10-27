/**
 * Comments table schema definition for Drizzle ORM (PostgreSQL)
 *
 * Represents user comments on videos.
 * This schema matches the existing Sequelize Comment model for backward compatibility.
 */
import { pgTable, serial, text, bigint, index } from 'drizzle-orm/pg-core';

/**
 * Comments table for storing video comments
 */
export const comments = pgTable(
  'comments',
  {
    // Primary key - auto-incrementing integer
    comment_id: serial('comment_id').primaryKey(),

    // Reference to the video this comment belongs to
    video_id: text('video_id').notNull(),

    // Sanitized comment text (HTML stripped)
    comment_plain_text_sanitized: text('comment_plain_text_sanitized').notNull(),

    // Unix timestamp of comment creation
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  },
  (t) => [index('comments_history').on(t.video_id, t.timestamp, t.comment_id)]
);

/**
 * Inferred types from the comments table schema
 */
export type DrizzleComment = typeof comments.$inferSelect;
export type DrizzleNewComment = typeof comments.$inferInsert;
