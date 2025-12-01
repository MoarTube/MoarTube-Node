/**
 * Comment reports table schema definition for Drizzle ORM
 *
 * Represents reports filed against comments.
 * This schema matches the existing Sequelize CommentReport model for backward compatibility.
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Comment reports table for storing reports against comments
 */
export const commentReports = sqliteTable('commentreports', {
  // Primary key - auto-incrementing integer
  reportId: integer('report_id').primaryKey({ autoIncrement: true }),

  // Timestamp when the report was filed
  timestamp: integer('timestamp').notNull(),

  // Timestamp when the comment was created
  commentTimestamp: integer('comment_timestamp').notNull(),

  // Reference to the video containing the reported comment
  videoId: text('video_id').notNull(),

  // Reference to the reported comment
  commentId: text('comment_id').notNull(),

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
