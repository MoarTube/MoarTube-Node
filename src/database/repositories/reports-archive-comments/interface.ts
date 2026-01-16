/**
 * Reports Archive Comments Repository Interface
 *
 * Defines the contract for archived comment report data access operations.
 */
import type { PaginationOptions } from '@/types/index.js';

export interface IReportsArchiveCommentsRepository<ArchiveType, NewArchiveType> {
  /**
   * Finds an archived comment report by its archive_id
   *
   * @param archiveId - The archive primary key
   * @returns The archive record or null if not found
   */
  findById(archiveId: number): Promise<ArchiveType | null>;

  /**
   * Finds all archived comment reports with optional pagination
   *
   * @param options - Pagination options (optional limit)
   * @returns Array of archived comment reports
   */
  findAll(options?: PaginationOptions): Promise<ArchiveType[]>;

  /**
   * Finds all archived reports for comments on a specific video
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of archived reports for comments on the video
   */
  findByVideoId(videoId: string, options?: PaginationOptions): Promise<ArchiveType[]>;

  /**
   * Finds all archived reports for a specific comment
   *
   * @param commentId - The comment identifier
   * @param options - Pagination options
   * @returns Array of archived reports for the comment
   */
  findByCommentId(commentId: number, options?: PaginationOptions): Promise<ArchiveType[]>;

  /**
   * Finds an archived report by its original report_id
   *
   * @param reportId - The original report ID
   * @returns The archive record or null if not found
   */
  findByReportId(reportId: number): Promise<ArchiveType | null>;

  /**
   * Counts total archived comment reports
   *
   * @returns Total count of archived comment reports
   */
  getCount(): Promise<number>;

  /**
   * Creates a new archived comment report record
   *
   * @param data - Archive data for insertion
   * @returns The created archive record
   */
  create(data: NewArchiveType): Promise<ArchiveType>;

  /**
   * Deletes an archived comment report record
   *
   * @param archiveId - The archive primary key
   * @returns true if deleted, false if not found
   */
  delete(archiveId: number): Promise<boolean>;

  /**
   * Deletes all archived reports for a specific comment
   *
   * @param commentId - The comment identifier
   * @returns Number of deleted archive records
   */
  deleteByCommentId(commentId: number): Promise<number>;

  /**
   * Deletes all archived reports for comments on a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted archive records
   */
  deleteByVideoId(videoId: string): Promise<number>;

  /**
   * Deletes all archived comment report records
   *
   * @returns Number of deleted archive records
   */
  deleteAll(): Promise<number>;

  /**
   * Creates multiple archived comment report records in bulk
   *
   * @param data - Array of archive data for insertion
   * @returns Array of created archive records
   */
  createMany(data: NewArchiveType[]): Promise<ArchiveType[]>;
}
