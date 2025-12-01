/**
 * API request/response type definitions
 * These types will be fully implemented in Phase 1
 */

export interface ApiResponse<T = unknown> {
  isError: boolean;
  message?: string;
  data?: T;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  totalCount: number;
  page: number;
  limit: number;
}
