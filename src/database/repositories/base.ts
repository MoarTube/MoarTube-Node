/**
 * Base Repository class providing common database operations
 *
 * All repository classes extend this base class to share common functionality.
 */
import type { DatabaseClient } from '../connection.js';
import type { PaginationOptions } from '../../types/models.js';

/**
 * Base repository with common operations
 */
export abstract class BaseRepository {
  constructor(protected readonly db: DatabaseClient) {}

  /**
   * Generates pagination SQL parameters for queries that should return all results by default.
   * Use this for findAll-style methods where no limit means "return everything".
   *
   * @param options - Pagination options with optional limit and offset
   * @returns Object with limit (undefined if not specified) and offset (defaults to 0)
   */
  protected getPaginationParams(options?: PaginationOptions): {
    limit: number | undefined;
    offset: number;
  } {
    return {
      limit: options?.limit,
      offset: options?.offset ?? 0,
    };
  }

  /**
   * Generates pagination SQL parameters with a default limit.
   * Use this for paginated queries where a limit is always expected.
   *
   * @param options - Pagination options with limit and offset
   * @param defaultLimit - Default limit when not specified (default: 20)
   * @returns Object with limit and offset values (limit is always a number)
   */
  protected getPaginationParamsWithDefault(
    options?: PaginationOptions,
    defaultLimit: number = 20
  ): { limit: number; offset: number } {
    return {
      limit: options?.limit ?? defaultLimit,
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
