/**
 * Video reports archive table schema definition for Drizzle ORM
 *
 * Represents archived/resolved video reports.
 * This schema matches the existing Sequelize VideoReportsArchive model for backward compatibility.
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Video reports archive table for storing resolved/archived video reports
 */
export const videoReportsArchive = sqliteTable('videoreportsarchives', {
  // Primary key - auto-incrementing integer
  archiveId: integer('archive_id').primaryKey({ autoIncrement: true }),

  // Original report ID (from videoreports table)
  reportId: integer('report_id').notNull(),

  // Timestamp when the report was filed
  timestamp: integer('timestamp').notNull(),

  // Timestamp when the video was created
  videoTimestamp: integer('video_timestamp').notNull(),

  // Reference to the reported video
  videoId: text('video_id').notNull(),

  // Reporter's email address
  email: text('email').notNull(),

  // Type of report (spam, harassment, copyright, etc.)
  type: text('type').notNull(),

  // Detailed report message
  message: text('message').notNull(),
});

/**
 * Inferred types from the video reports archive table schema
 */
export type DrizzleVideoReportArchive = typeof videoReportsArchive.$inferSelect;
export type DrizzleNewVideoReportArchive = typeof videoReportsArchive.$inferInsert;
