/**
 * Database model type definitions
 * Only the types that are actually used in the codebase
 */

// ============================================
// Query Result Types
// ============================================

/**
 * Generic pagination options for database queries
 */
export interface PaginationOptions {
  limit?: number;
}

/**
 * Sort options for database queries
 */
export interface SortOptions {
  field: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Paginated result wrapper for list queries
 */
export interface PaginatedResult<T> {
  /** Array of result items */
  data: T[];
  /** Total count of matching items (before pagination) */
  total: number;
  /** Number of items in current page */
  count: number;
  /** Current limit */
  limit: number;
  /** Whether there are more results */
  hasMore: boolean;
}
