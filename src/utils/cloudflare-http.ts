import { AsyncLocalStorage } from 'node:async_hooks';

const deadline = new AsyncLocalStorage<AbortSignal>();
export function distributionSignal(): AbortSignal | undefined {
  return deadline.getStore();
}

export function cloudflareOptions(headers: Record<string, string>): {
  headers: Record<string, string>;
  timeout: number;
  signal?: AbortSignal;
} {
  const signal = deadline.getStore();
  return { headers, timeout: 10_000, ...(signal ? { signal } : {}) };
}

/** Nested configuration stages share one deadline; recovery gets its own bounded window. */
export function withCloudflareDeadline<T>(
  operation: () => Promise<T>,
  milliseconds = 120_000
): Promise<T> {
  return deadline.run(deadline.getStore() ?? AbortSignal.timeout(milliseconds), operation);
}

export function withCloudflareRecovery<T>(operation: () => Promise<T>): Promise<T> {
  return deadline.run(AbortSignal.timeout(60_000), operation);
}
