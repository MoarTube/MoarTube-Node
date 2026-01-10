/**
 * Comment reports table schema definition for Drizzle ORM (PostgreSQL)
 *
 * Represents reports filed against comments.
 * This schema matches the existing Sequelize CommentReport model for backward compatibility.
 */
import { pgTable, serial, integer, text, bigint } from 'drizzle-orm/pg-core';

/**
 * Comment reports table for storing reports against comments
 */
export const commentReports = pgTable('commentreports', {
  // Primary key - auto-incrementing integer
  report_id: serial('report_id').primaryKey(),

  // Timestamp when the report was filed
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),

  // Timestamp when the comment was created
  comment_timestamp: bigint('comment_timestamp', { mode: 'number' }).notNull(),

  // Reference to the video containing the reported comment
  video_id: text('video_id').notNull(),

  // Reference to the reported comment
  comment_id: integer('comment_id').notNull(),

  // Reporter's email address
  email: text('email').notNull(),

  // Type of report (spam, harassment, etc.)
  type: text('type').notNull(),

  // Detailed report message
  message: text('message').notNull(),
});

/**
 * Inferred types from the comment reports table schema
 */
export type DrizzleCommentReport = typeof commentReports.$inferSelect;
export type DrizzleNewCommentReport = typeof commentReports.$inferInsert;
