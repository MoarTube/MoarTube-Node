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
  archiveId: integer('archive_id').primaryKey({ autoIncrement: true }),

  // Original report ID (from commentreports table)
  reportId: integer('report_id').notNull(),

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
 * Inferred types from the comment reports archive table schema
 */
export type DrizzleCommentReportArchive = typeof commentReportsArchive.$inferSelect;
export type DrizzleNewCommentReportArchive = typeof commentReportsArchive.$inferInsert;
