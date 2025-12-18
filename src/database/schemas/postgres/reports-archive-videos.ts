/**
 * Video reports archive table schema definition for Drizzle ORM (PostgreSQL)
 *
 * Represents archived/resolved video reports.
 * This schema matches the existing Sequelize VideoReportsArchive model for backward compatibility.
 */
import { pgTable, serial, integer, text, bigint } from 'drizzle-orm/pg-core';

/**
 * Video reports archive table for storing resolved/archived video reports
 */
export const videoReportsArchive = pgTable('videoreportsarchives', {
  // Primary key - auto-incrementing integer
  archive_id: serial('archive_id').primaryKey(),

  // Original report ID (from videoreports table)
  report_id: integer('report_id').notNull(),

  // Timestamp when the report was filed
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),

  // Timestamp when the video was created
  video_timestamp: bigint('video_timestamp', { mode: 'number' }).notNull(),

  // Reference to the reported video
  video_id: text('video_id').notNull(),

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