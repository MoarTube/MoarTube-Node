/**
 * Reports Archive Videos Repository Interface
 *
 * Defines the contract for archived video report data access operations.
 */
import type { PaginationOptions } from '@/types/index.js';

export interface IReportsArchiveVideosRepository<ArchiveType, NewArchiveType> {
  /**
   * Finds an archived video report by its archive_id
   *
   * @param archiveId - The archive primary key
   * @returns The archive record or null if not found
   */
  findById(archiveId: number): Promise<ArchiveType | null>;

  /**
   * Finds all archived video reports with optional pagination
   *
   * @param options - Pagination options (optional limit)
   * @returns Array of archived video reports
   */
  findAll(options?: PaginationOptions): Promise<ArchiveType[]>;

  /**
   * Finds all archived reports for a specific video
   *
   * @param videoId - The video identifier
   * @param options - Pagination options
   * @returns Array of archived reports for the video
   */
  findByVideoId(videoId: string, options?: PaginationOptions): Promise<ArchiveType[]>;

  /**
   * Finds an archived report by its original report_id
   *
   * @param reportId - The original report ID
   * @returns The archive record or null if not found
   */
  findByReportId(reportId: number): Promise<ArchiveType | null>;

  /**
   * Counts total archived video reports
   *
   * @returns Total count of archived video reports
   */
  getCount(): Promise<number>;

  /**
   * Creates a new archived video report record
   *
   * @param data - Archive data for insertion
   * @returns The created archive record
   */
  create(data: NewArchiveType): Promise<ArchiveType>;

  /**
   * Deletes an archived video report record
   *
   * @param archiveId - The archive primary key
   * @returns true if deleted, false if not found
   */
  delete(archiveId: number): Promise<boolean>;

  /**
   * Deletes all archived reports for a video
   *
   * @param videoId - The video identifier
   * @returns Number of deleted archive records
   */
  deleteByVideoId(videoId: string): Promise<number>;

  /**
   * Deletes all archived video report records
   *
   * @returns Number of deleted archive records
   */
  deleteAll(): Promise<number>;

  /**
   * Creates multiple archived video report records in bulk
   *
   * @param data - Array of archive data for insertion
   * @returns Array of created archive records
   */
  createMany(data: NewArchiveType[]): Promise<ArchiveType[]>;
}
