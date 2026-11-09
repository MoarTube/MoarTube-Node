import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StreamCleanupQueue, type StreamCleanupJob } from '@/utils/stream-cleanup.js';
import { operationalForPath, writeRecovery } from '@/database/recovery.js';

let root: string, settings: string;
let queue: StreamCleanupQueue;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'moartube-drain-'));
  settings = path.join(root, 'settings.json');
  await writeFile(settings, JSON.stringify({ databaseConfig: { databaseDialect: 'sqlite' } }));
});
afterEach(async () => {
  queue?.close();
  vi.useRealTimers();
  await rm(root, { recursive: true, force: true });
});
const job = (): StreamCleanupJob => ({
  videoId: 'video',
  generation: 'run',
  deadline: Date.now(),
  storageConfig: { storageMode: 'filesystem' },
  videosDirectory: root,
});
async function count(): Promise<number> {
  const db = operationalForPath(settings);
  try {
    return (await db.query("SELECT key FROM node_recovery WHERE key LIKE 'cleanup:%'")).length;
  } finally {
    await db.close();
  }
}
describe('database-backed stream cleanup journal', () => {
  it('retains failed work for a bounded retry and removes it only after success', async () => {
    vi.useFakeTimers();
    const perform = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue(undefined);
    const failed = vi.fn();
    queue = new StreamCleanupQueue(settings + '.stream-cleanup', perform, failed);
    await queue.enqueue(job());
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(await count()).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(async () => expect(await count()).toBe(0));
    expect(perform).toHaveBeenCalledTimes(2);
  });
  it('does not execute early across maximum timer intervals, repeated scheduling or shutdown', async () => {
    vi.useFakeTimers();
    const perform = vi.fn();
    queue = new StreamCleanupQueue(settings + '.stream-cleanup', perform, vi.fn());
    await queue.enqueue({ ...job(), deadline: Date.now() + 2_147_483_648 });
    await queue.recover();
    await vi.advanceTimersByTimeAsync(2_147_483_647);
    expect(perform).not.toHaveBeenCalled();
    queue.close();
    await vi.advanceTimersByTimeAsync(10);
    expect(perform).not.toHaveBeenCalled();
  });
  it('reports corrupt persisted jobs and rejects unsafe paths before writing', async () => {
    const failed = vi.fn();
    queue = new StreamCleanupQueue(settings + '.stream-cleanup', vi.fn(), failed);
    await queue.recover();
    await expect(queue.enqueue({ ...job(), videoId: '../bad' })).rejects.toThrow('Invalid');
    await writeRecovery(settings, 'cleanup:bad', '{}');
    await queue.recover();
    expect(failed).toHaveBeenCalledOnce();
    expect(await count()).toBe(1);
  });
});

it('does not schedule newly persisted work after the queue closes', async () => {
  vi.useFakeTimers();
  const perform = vi.fn();
  queue = new StreamCleanupQueue(settings + '.stream-cleanup', perform, vi.fn());
  queue.close();
  await queue.enqueue(job());
  await vi.advanceTimersByTimeAsync(1000);
  expect(perform).not.toHaveBeenCalled();
  expect(await count()).toBe(1);
});
