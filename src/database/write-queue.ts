/**
 * Write Queue for cluster IPC-based database operations
 *
 * In a clustered Node.js application, SQLite requires that all write operations
 * are performed by the master process to avoid database locking issues.
 * This queue handles sending write operations from worker processes to the master.
 */
import { randomUUID } from 'crypto';

/**
 * Pending job interface for tracking submitted write operations
 */
interface PendingJob<T = void> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Database write job message sent via IPC
 */
export interface DatabaseWriteJobMessage {
  cmd: 'database_write_job';
  query: string;
  parameters: unknown[];
  databaseWriteJobId: string;
}

/**
 * Database write job result message received via IPC
 */
export interface DatabaseWriteJobResultMessage {
  cmd: 'database_write_job_result';
  databaseWriteJobId: string;
  error?: string;
  result?: unknown;
}

/**
 * WriteQueue class for managing database write operations in clustered mode
 *
 * Workers submit write operations to this queue, which sends them to the master
 * process via IPC. The master executes the query and sends back the result.
 */
export class WriteQueue {
  private pendingJobs = new Map<string, PendingJob<unknown>>();
  private readonly jobTimeout: number;

  /**
   * Creates a new WriteQueue instance
   *
   * @param jobTimeout - Maximum time in milliseconds to wait for a job to complete (default: 30000)
   */
  constructor(jobTimeout = 30000) {
    this.jobTimeout = jobTimeout;
    this.setupMessageHandler();
    this.startTimeoutChecker();
  }

  /**
   * Submits a database write operation to be executed by the master process
   *
   * @param query - The SQL query string to execute
   * @param parameters - Query parameters
   * @returns Promise that resolves when the write operation completes
   * @throws Error if the operation fails or times out
   */
  submit(query: string, parameters: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      const jobId = randomUUID();

      this.pendingJobs.set(jobId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now(),
      });

      const message: DatabaseWriteJobMessage = {
        cmd: 'database_write_job',
        query,
        parameters,
        databaseWriteJobId: jobId,
      };

      // Send to master process
      if (typeof process.send === 'function') {
        process.send(message);
      } else {
        // Not in cluster mode - execute directly would require different handling
        this.pendingJobs.delete(jobId);
        reject(new Error('WriteQueue: Not running in cluster worker mode'));
      }
    });
  }

  /**
   * Submits a database write operation that returns a result
   *
   * @param query - The SQL query string to execute
   * @param parameters - Query parameters
   * @returns Promise that resolves with the query result
   * @throws Error if the operation fails or times out
   */
  submitWithResult<T>(query: string, parameters: unknown[] = []): Promise<T> {
    return new Promise((resolve, reject) => {
      const jobId = randomUUID();

      this.pendingJobs.set(jobId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now(),
      });

      const message: DatabaseWriteJobMessage = {
        cmd: 'database_write_job',
        query,
        parameters,
        databaseWriteJobId: jobId,
      };

      if (typeof process.send === 'function') {
        process.send(message);
      } else {
        this.pendingJobs.delete(jobId);
        reject(new Error('WriteQueue: Not running in cluster worker mode'));
      }
    });
  }

  /**
   * Completes a pending job with optional result or error
   *
   * Called by the message handler when a result is received from the master.
   *
   * @param jobId - The unique job identifier
   * @param error - Optional error if the operation failed
   * @param result - Optional result data from the operation
   */
  complete(jobId: string, error?: Error, result?: unknown): void {
    const job = this.pendingJobs.get(jobId);

    if (job) {
      this.pendingJobs.delete(jobId);

      if (error) {
        job.reject(error);
      } else {
        job.resolve(result);
      }
    }
  }

  /**
   * Gets the number of pending jobs
   *
   * @returns Number of jobs awaiting completion
   */
  getPendingCount(): number {
    return this.pendingJobs.size;
  }

  /**
   * Clears all pending jobs with an error
   *
   * Used during shutdown or when the connection to master is lost.
   *
   * @param error - Error to reject all pending jobs with
   */
  clearAllPending(error: Error): void {
    for (const [jobId, job] of this.pendingJobs) {
      job.reject(error);
      this.pendingJobs.delete(jobId);
    }
  }

  /**
   * Sets up the IPC message handler for receiving results from master
   */
  private setupMessageHandler(): void {
    process.on('message', (message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'cmd' in message &&
        (message as { cmd: string }).cmd === 'database_write_job_result'
      ) {
        const resultMessage = message as DatabaseWriteJobResultMessage;
        const error = resultMessage.error ? new Error(resultMessage.error) : undefined;
        this.complete(resultMessage.databaseWriteJobId, error, resultMessage.result);
      }
    });
  }

  /**
   * Starts a periodic checker to timeout stale jobs
   */
  private startTimeoutChecker(): void {
    setInterval(() => {
      const now = Date.now();

      for (const [jobId, job] of this.pendingJobs) {
        if (now - job.timestamp > this.jobTimeout) {
          this.pendingJobs.delete(jobId);
          job.reject(new Error(`WriteQueue: Job ${jobId} timed out after ${this.jobTimeout}ms`));
        }
      }
    }, 5000); // Check every 5 seconds
  }
}

/**
 * Singleton WriteQueue instance for the application
 */
let writeQueueInstance: WriteQueue | null = null;

/**
 * Gets the singleton WriteQueue instance, creating it if necessary
 *
 * @param jobTimeout - Optional timeout for new instance creation
 * @returns The WriteQueue singleton instance
 */
export function getWriteQueue(jobTimeout?: number): WriteQueue {
  if (!writeQueueInstance) {
    writeQueueInstance = new WriteQueue(jobTimeout);
  }
  return writeQueueInstance;
}

/**
 * Resets the WriteQueue singleton (primarily for testing)
 */
export function resetWriteQueue(): void {
  if (writeQueueInstance) {
    writeQueueInstance.clearAllPending(new Error('WriteQueue reset'));
    writeQueueInstance = null;
  }
}
