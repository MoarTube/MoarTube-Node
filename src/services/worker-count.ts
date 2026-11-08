import { randomUUID } from 'node:crypto';
import type { WorkerCountRequest, WorkerCountSnapshot } from '@/types/ipc.js';

/** The primary owns both the saved preference and the running worker count. */
export function requestWorkerCount(
  operation: 'snapshot' | 'apply',
  workerCount?: number,
  confirmDecrease = false
): Promise<WorkerCountSnapshot> {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const cleanup = (): void => {
      clearTimeout(timer);
      process.off('message', listener);
    };
    const listener = (message: unknown): void => {
      if (typeof message !== 'object' || message === null) {
        return;
      }
      const response = message as {
        cmd?: string;
        requestId?: string;
        error?: string;
        snapshot?: WorkerCountSnapshot;
      };
      if (response.cmd !== 'worker_count_response' || response.requestId !== requestId) {
        return;
      }
      cleanup();
      if (response.error !== undefined) {
        reject(new Error(response.error));
      } else if (response.snapshot) {
        resolve(response.snapshot);
      } else {
        reject(new Error('Invalid worker count response.'));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error('Worker count request timed out. Refresh settings to check the current count.')
      );
    }, 30_000);
    process.on('message', listener);
    const request: WorkerCountRequest = {
      cmd: 'worker_count_request',
      requestId,
      operation,
      ...(workerCount === undefined ? {} : { workerCount }),
      confirmDecrease,
    };
    if (!process.send) {
      cleanup();
      reject(new Error('Primary process is unavailable.'));
      return;
    }
    try {
      process.send(request, (error: Error | null) => {
        if (error) {
          cleanup();
          reject(new Error('Primary process is unavailable.'));
        }
      });
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error('Primary process is unavailable.'));
    }
  });
}
