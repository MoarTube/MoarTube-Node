import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestWorkerCount } from '@/services/worker-count.js';

const originalSend = process.send;
let send: ReturnType<typeof vi.fn>;
let existingListeners: Set<Function>;
beforeEach(() => {
  vi.useFakeTimers();
  send = vi.fn();
  process.send = send as typeof process.send;
  existingListeners = new Set(process.listeners('message'));
});
afterEach(() => {
  process.send = originalSend;
  vi.useRealTimers();
});
const respond = (message: unknown): void => {
  for (const listener of process.listeners('message')) {
    if (!existingListeners.has(listener)) listener(message as never, undefined);
  }
};

it('correlates primary replies, ignores unrelated messages, and cleans up listeners', async () => {
  const baseline = process.listenerCount('message');
  const snapshot = { workerCount: 4, runningWorkers: 4, maxWorkers: 8 };
  const result = requestWorkerCount('snapshot');
  const request = send.mock.calls[0]![0];
  expect(request).toMatchObject({ operation: 'snapshot', confirmDecrease: false });
  expect(request).not.toHaveProperty('workerCount');
  for (const message of [
    null,
    1,
    {},
    { cmd: 'other' },
    { cmd: 'worker_count_response', requestId: 'other' },
  ])
    respond(message);
  expect(process.listenerCount('message')).toBe(baseline + 1);
  respond({ cmd: 'worker_count_response', requestId: request.requestId, snapshot });
  await expect(result).resolves.toEqual(snapshot);
  expect(process.listenerCount('message')).toBe(baseline);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  [{ error: 'Stop active uploads' }, 'Stop active uploads'],
  [{}, 'Invalid worker count response.'],
] as const)('rejects a correlated error or incomplete reply', async (response, message) => {
  const result = requestWorkerCount('apply', 1, true);
  const request = send.mock.calls[0]![0];
  expect(request).toMatchObject({ operation: 'apply', workerCount: 1, confirmDecrease: true });
  respond({ cmd: 'worker_count_response', requestId: request.requestId, ...response });
  await expect(result).rejects.toThrow(message);
  expect(vi.getTimerCount()).toBe(0);
});

it('times out and removes its listener when the primary never responds', async () => {
  const baseline = process.listenerCount('message');
  const rejection = expect(requestWorkerCount('snapshot')).rejects.toThrow(/timed out/);
  await vi.advanceTimersByTimeAsync(30_000);
  await rejection;
  expect(process.listenerCount('message')).toBe(baseline);
});

it.each(['missing', 'callback', 'throw-error', 'throw-value', 'callback-ok'] as const)(
  'handles unavailable IPC (%s) without leaking listeners',
  async (mode) => {
    const baseline = process.listenerCount('message');
    if (mode === 'missing') process.send = undefined;
    else if (mode === 'callback' || mode === 'callback-ok')
      send.mockImplementation((_message, callback) => {
        callback(mode === 'callback' ? new Error('closed') : null);
      });
    else
      send.mockImplementation(() => {
        throw mode === 'throw-error' ? new Error('closed') : 'closed';
      });
    const result = requestWorkerCount('snapshot');
    if (mode === 'callback-ok') {
      const request = send.mock.calls[0]![0];
      respond({
        cmd: 'worker_count_response',
        requestId: request.requestId,
        snapshot: { workerCount: 1, runningWorkers: 1, maxWorkers: 1 },
      });
      await expect(result).resolves.toMatchObject({ runningWorkers: 1 });
    } else
      await expect(result).rejects.toThrow(
        mode === 'throw-error' ? 'closed' : 'Primary process is unavailable.'
      );
    expect(process.listenerCount('message')).toBe(baseline);
    expect(vi.getTimerCount()).toBe(0);
  }
);
