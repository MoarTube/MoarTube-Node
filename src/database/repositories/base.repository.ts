/**
 * Base Repository class providing common database operations
 *
 * All repository classes extend this base class to share common functionality.
 */
import type { DatabaseClient } from '../connection';
import type { PaginationOptions } from '../../types/models';

/**
 * Base repository with common operations
 */
export abstract class BaseRepository {
  constructor(protected readonly db: DatabaseClient) {}

  /**
   * Generates pagination SQL parameters
   *
   * @param options - Pagination options with limit and offset
   * @returns Object with limit and offset values
   */
  protected getPaginationParams(options?: PaginationOptions): { limit: number; offset: number } {
    return {
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
    };
  }

  /**
   * Gets the current Unix timestamp in seconds
   *
   * @returns Current Unix timestamp
   */
  protected getCurrentTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Gets the current Unix timestamp in milliseconds
   *
   * @returns Current Unix timestamp in milliseconds
   */
  protected getCurrentTimestampMs(): number {
    return Date.now();
  }
}
