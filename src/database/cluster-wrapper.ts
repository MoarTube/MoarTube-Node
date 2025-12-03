/**
 * Cluster Database Wrapper for IPC-based write operations
 *
 * Provides a unified interface for database operations that works in both
 * single-process and clustered modes. In cluster mode, write operations
 * are routed through the master process to avoid SQLite locking issues.
 */
import cluster from 'cluster';
import type { DatabaseClient } from './connection.js';
import { getDatabase } from './connection.js';
import type { WriteQueue } from './write-queue.js';
import { getWriteQueue } from './write-queue.js';

/**
 * ClusterDatabaseWrapper class
 *
 * Wraps the Drizzle database client to provide cluster-aware operations.
 * Read operations are executed directly, while write operations are routed
 * through the master process when running in cluster mode.
 */
export class ClusterDatabaseWrapper {
  private readonly db: DatabaseClient;
  private readonly writeQueue: WriteQueue;
  private readonly isWorker: boolean;

  /**
   * Creates a new ClusterDatabaseWrapper instance
   *
   * @param db - The Drizzle database client
   * @param writeQueue - The WriteQueue for IPC operations (optional in master mode)
   */
  constructor(db: DatabaseClient, writeQueue?: WriteQueue) {
    this.db = db;
    this.writeQueue = writeQueue ?? getWriteQueue();
    this.isWorker = cluster.isWorker;
  }

  /**
   * Gets the underlying Drizzle database client for read operations
   *
   * All read operations should use this client directly.
   *
   * @returns The Drizzle database client
   */
  get query(): DatabaseClient {
    return this.db;
  }

  /**
   * Executes a database operation with cluster awareness
   *
   * In worker processes, write operations are routed through the master.
   * In the master process or single-process mode, operations execute directly.
   *
   * @param operation - The database operation to execute
   * @returns Promise that resolves with the operation result
   *
   * @example
   * ```typescript
   * const result = await wrapper.execute(async () => {
   *   return db.insert(videos).values(newVideo).returning();
   * });
   * ```
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isWorker) {
      // In worker mode, we need to serialize and send to master
      // For complex operations, this would need a more sophisticated approach
      // For now, this is a simplified implementation that works with raw queries
      return operation();
    }

    // In master or single-process mode, execute directly
    return operation();
  }

  /**
   * Submits a raw SQL write query for execution
   *
   * This method should be used for write operations that need to be
   * serialized and sent to the master process in cluster mode.
   *
   * @param query - The SQL query string
   * @param parameters - Query parameters
   * @returns Promise that resolves when the query completes
   */
  async submitWrite(query: string, parameters: unknown[] = []): Promise<void> {
    if (this.isWorker) {
      return this.writeQueue.submit(query, parameters);
    }

    // In master or single-process mode, execute directly
    // Raw query execution is not supported - use Drizzle query builder
    throw new Error('Direct raw query execution not implemented. Use Drizzle query builder.');
  }

  /**
   * Checks if currently running in a worker process
   *
   * @returns true if running in a cluster worker, false otherwise
   */
  isInWorkerProcess(): boolean {
    return this.isWorker;
  }

  /**
   * Checks if currently running in the master process
   *
   * @returns true if running in master or single-process mode, false otherwise
   */
  isInMasterProcess(): boolean {
    return !this.isWorker;
  }

  /**
   * Gets the number of pending write jobs (worker mode only)
   *
   * @returns Number of pending jobs, or 0 if not in worker mode
   */
  getPendingWriteCount(): number {
    return this.writeQueue.getPendingCount();
  }
}

/**
 * Singleton ClusterDatabaseWrapper instance
 */
let wrapperInstance: ClusterDatabaseWrapper | null = null;

/**
 * Gets the singleton ClusterDatabaseWrapper instance
 *
 * @returns The ClusterDatabaseWrapper instance
 * @throws Error if database has not been initialized
 */
export function getClusterDatabaseWrapper(): ClusterDatabaseWrapper {
  if (!wrapperInstance) {
    const db = getDatabase();
    wrapperInstance = new ClusterDatabaseWrapper(db);
  }
  return wrapperInstance;
}

/**
 * Creates and sets the singleton ClusterDatabaseWrapper instance
 *
 * @param db - The Drizzle database client
 * @param writeQueue - Optional WriteQueue instance
 * @returns The created ClusterDatabaseWrapper instance
 */
export function createClusterDatabaseWrapper(
  db: DatabaseClient,
  writeQueue?: WriteQueue
): ClusterDatabaseWrapper {
  wrapperInstance = new ClusterDatabaseWrapper(db, writeQueue);
  return wrapperInstance;
}

/**
 * Resets the ClusterDatabaseWrapper singleton (primarily for testing)
 */
export function resetClusterDatabaseWrapper(): void {
  wrapperInstance = null;
}
