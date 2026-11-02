import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StreamCleanupQueue, type StreamCleanupJob } from '@/utils/stream-cleanup.js';

let root: string;
let queue: StreamCleanupQueue;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'moartube-drain-'));
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
describe('durable stream cleanup journal', () => {
  it('retains failed work for a bounded retry and removes it only after success', async () => {
    vi.useFakeTimers();
    const perform = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue(undefined);
    const failed = vi.fn();
    queue = new StreamCleanupQueue(root, perform, failed);
    await queue.enqueue(job());
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(await readdir(root)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(async () => expect(await readdir(root)).toHaveLength(0));
    expect(perform).toHaveBeenCalledTimes(2);
  });
  it('does not execute early across maximum timer intervals, repeated scheduling or shutdown', async () => {
    vi.useFakeTimers();
    const perform = vi.fn();
    queue = new StreamCleanupQueue(root, perform, vi.fn());
    await queue.enqueue({ ...job(), deadline: Date.now() + 2_147_483_648 });
    await queue.recover();
    await vi.advanceTimersByTimeAsync(2_147_483_647);
    expect(perform).not.toHaveBeenCalled();
    queue.close();
    await vi.advanceTimersByTimeAsync(10);
    expect(perform).not.toHaveBeenCalled();
    await queue.enqueue(job());
    expect(perform).not.toHaveBeenCalled();
  });
  it('ignores unfinished writes, reports corrupt jobs and rejects unsafe paths before writing', async () => {
    const failed = vi.fn();
    queue = new StreamCleanupQueue(path.join(root, 'missing'), vi.fn(), failed);
    await queue.recover();
    await expect(queue.enqueue({ ...job(), videoId: '../bad' })).rejects.toThrow('Invalid');
    await mkdir(path.join(root, 'missing'));
    await writeFile(path.join(root, 'missing', 'bad.json'), '{}');
    await writeFile(path.join(root, 'missing', 'unfinished.part'), '{');
    await queue.recover();
    expect(failed).toHaveBeenCalledOnce();
    queue.close();
    queue = new StreamCleanupQueue(path.join(root, 'file'), vi.fn(), failed);
    await writeFile(path.join(root, 'file'), 'not a directory');
    await expect(queue.recover()).rejects.toThrow();
  });
});
