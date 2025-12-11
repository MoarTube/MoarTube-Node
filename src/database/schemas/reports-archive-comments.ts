/**
 * Comment reports archive table schema definition for Drizzle ORM
 *
 * Represents archived/resolved comment reports.
 * This schema matches the existing Sequelize CommentReportsArchive model for backward compatibility.
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Comment reports archive table for storing resolved/archived comment reports
 */
export const commentReportsArchive = sqliteTable('commentreportsarchives', {
  // Primary key - auto-incrementing integer
  archive_id: integer('archive_id').primaryKey({ autoIncrement: true }),

  // Original report ID (from commentreports table)
  report_id: integer('report_id').notNull(),

  // Timestamp when the report was filed
  timestamp: integer('timestamp').notNull(),

  // Timestamp when the comment was created
  comment_timestamp: integer('comment_timestamp').notNull(),

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
 * Inferred types from the comment reports archive table schema
 */
export type DrizzleCommentReportArchive = typeof commentReportsArchive.$inferSelect;
export type DrizzleNewCommentReportArchive = typeof commentReportsArchive.$inferInsert;
