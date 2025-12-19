/**
 * Base Repository class providing common database operations
 *
 * All repository classes extend this base class to share common functionality.
 */
import type { PaginationOptions } from '../../types/models.js';

/**
 * Base repository with common operations
 */
export abstract class BaseRepository {
  constructor(protected readonly db: any) {}

  /**
   * Generates pagination SQL parameters for queries that should return all results by default.
   * Use this for findAll-style methods where no limit means "return everything".
   *
   * @param options - Pagination options with optional limit
   * @returns Object with limit (undefined if not specified)
   */
  protected getPaginationParams(options?: PaginationOptions): {
    limit: number | undefined;
  } {
    return {
      limit: options?.limit,
    };
  }

  /**
   * Generates pagination SQL parameters with a default limit.
   * Use this for paginated queries where a limit is always expected.
   *
   * @param options - Pagination options with limit
   * @param defaultLimit - Default limit when not specified (default: 20)
   * @returns Object with limit value (always a number)
   */
  protected getPaginationParamsWithDefault(
    options?: PaginationOptions,
    defaultLimit: number = 20
  ): { limit: number } {
    return {
      limit: options?.limit ?? defaultLimit,
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