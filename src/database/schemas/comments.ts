/**
 * Comments table schema definition for Drizzle ORM
 *
 * Represents user comments on videos.
 * This schema matches the existing Sequelize Comment model for backward compatibility.
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Comments table for storing video comments
 */
export const comments = sqliteTable('comments', {
  // Primary key - auto-incrementing integer
  id: integer('id').primaryKey({ autoIncrement: true }),

  // Reference to the video this comment belongs to
  videoId: text('video_id').notNull(),

  // Sanitized comment text (HTML stripped)
  commentPlainTextSanitized: text('comment_plain_text_sanitized').notNull(),

  // Unix timestamp of comment creation
  timestamp: integer('timestamp').notNull(),
});

/**
 * Inferred types from the comments table schema
 */
export type DrizzleComment = typeof comments.$inferSelect;
export type DrizzleNewComment = typeof comments.$inferInsert;
