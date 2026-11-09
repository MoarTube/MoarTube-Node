import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  workers: new Map<number, any>(),
  config: {} as any,
  videos: vi.fn(),
  fork: vi.fn(),
  events: {} as Record<string, Function>,
  handlers: new Map<string, Function>(),
  send: vi.fn(),
}));
vi.mock('node:cluster', () => ({
  default: {
    fork: state.fork,
    on: (event: string, handler: Function) => {
      state.events[event] = handler;
    },
  },
}));
vi.mock('@/config/index.js', () => ({ getConfig: () => state.config }));
vi.mock('@/core/container.js', () => ({
  getContainer: () => ({ resolve: () => ({ getAllVideosData: state.videos }) }),
}));
vi.mock('@/core/cluster/ipc-channel.js', () => ({
  IPCChannel: class {
    on(command: string, handler: Function) {
      state.handlers.set(command, handler);
    }
    sendToWorker(...args: unknown[]) {
      state.send(...args);
    }
    getWorkers() {
      return [...state.workers.values()];
    }
  },
}));

import { ClusterMaster } from '@/core/cluster/master.js';
import {
  withMediaWrite,
  beginRemoteWrite,
  finishRemoteWrite,
  withJobAdmission,
} from '@/utils/distribution-admission.js';

let directory: string;
let master: any;
let nextId: number;
function worker() {
  const value = Object.assign(new EventEmitter(), {
    id: nextId++,
    isDead: () => !state.workers.has(value.id),
    kill: vi.fn(() => {
      state.workers.delete(value.id);
      state.events.exit?.(value, 0, 'SIGKILL');
      value.emit('exit', 0, 'SIGKILL');
    }),
  });
  state.workers.set(value.id, value);
  return value;
}
const request = (workerCount: number, confirmDecrease = false) => ({
  cmd: 'worker_count_request',
  requestId: 'test',
  operation: 'apply',
  workerCount,
  confirmDecrease,
});
beforeEach(() => {
  nextId = 1;
  state.workers.clear();
  state.events = {};
  state.handlers.clear();
  state.send.mockClear();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-workers-'));
  state.config = {
    paths: { nodeSettingsPath: path.join(directory, 'settings.json') },
    nodeSettings: { workerCount: 3 },
    reloadNodeSettings: vi.fn(),
    updateNodeSettings: vi.fn((updates) => {
      Object.assign(state.config.nodeSettings, updates);
    }),
  };
  state.videos.mockReset().mockResolvedValue([]);
  state.fork.mockReset().mockImplementation(() => {
    const added = worker();
    queueMicrotask(() => added.emit('message', { cmd: 'worker_http_ready' }));
    return added;
  });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  master = new ClusterMaster(logger as never, {} as never);
  master.isRunning = true;
  master.desiredWorkers = 3;
  master.setupWorkerExitHandler();
  worker();
  worker();
  worker();
});
afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(directory, { recursive: true, force: true });
});

it('adds only the difference, waits for readiness, and ignores obsolete environment configuration', async () => {
  vi.stubEnv('MOARTUBE_WORKERS', '1');
  try {
    const original = [...state.workers.values()];
    const maximum = Math.max(1, os.cpus().length);
    if (maximum < 4) return;
    const result = await master.applyWorkerCount(request(4), original[0]);
    expect(result.runningWorkers).toBe(4);
    expect(state.fork).toHaveBeenCalledTimes(1);
    expect(original.every((w) => w.kill.mock.calls.length === 0)).toBe(true);
    expect(state.config.nodeSettings.workerCount).toBe(4);
    expect(state.videos).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});

it('requires confirmation and keeps both configuration and workers unchanged on rejection', async () => {
  await expect(master.applyWorkerCount(request(1), state.workers.get(1))).rejects.toThrow(
    /Confirm/
  );
  expect(state.workers.size).toBe(3);
  expect(state.config.updateNodeSettings).not.toHaveBeenCalled();
});

it.each(['isImporting', 'isPublishing', 'isStreaming'])(
  'refuses a confirmed decrease during %s, including beyond the first page',
  async (flag) => {
    state.videos
      .mockResolvedValueOnce(Array.from({ length: 100 }, () => ({})))
      .mockResolvedValueOnce([{ [flag]: true }]);
    await expect(master.applyWorkerCount(request(1, true), state.workers.get(1))).rejects.toThrow(
      /Stop active/
    );
    expect(state.workers.size).toBe(3);
    expect(state.config.updateNodeSettings).not.toHaveBeenCalled();
    await expect(withJobAdmission(async () => true)).resolves.toBe(true);
  }
);

it('refuses a decrease during an upload and releases admission after rejection', async () => {
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const upload = withMediaWrite(async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await ready;
  await expect(master.applyWorkerCount(request(1, true), state.workers.get(1))).rejects.toThrow(
    /uploads/
  );
  expect(state.config.updateNodeSettings).not.toHaveBeenCalled();
  release();
  await upload;
  await expect(
    master.applyWorkerCount(request(1, true), state.workers.get(1))
  ).resolves.toMatchObject({ runningWorkers: 1 });
});

it('refuses a decrease during direct storage writes', async () => {
  await beginRemoteWrite('video', 'write');
  await expect(master.applyWorkerCount(request(1, true), state.workers.get(1))).rejects.toThrow(
    /direct storage writes/
  );
  expect(state.config.updateNodeSettings).not.toHaveBeenCalled();
  await finishRemoteWrite('video', 'write');
});

it('retains the requesting worker, removes only the difference, and does not replace deliberate exits', async () => {
  const requester = state.workers.get(3);
  const result = await master.applyWorkerCount(request(1, true), requester);
  expect(result).toMatchObject({ workerCount: 1, runningWorkers: 1 });
  expect([...state.workers.keys()]).toEqual([3]);
  expect(requester.kill).not.toHaveBeenCalled();
  expect(state.fork).not.toHaveBeenCalled();
  requester.kill();
  expect(state.fork).toHaveBeenCalledTimes(1);
});

it('blocks job starts throughout the reduction', async () => {
  state.videos.mockImplementation(async () => {
    await expect(withJobAdmission(async () => true)).rejects.toThrow(/admission is in progress/);
    return [];
  });
  await master.applyWorkerCount(request(1, true), state.workers.get(1));
  await expect(withJobAdmission(async () => true)).resolves.toBe(true);
});

it('does not terminate workers when saving fails', async () => {
  state.config.updateNodeSettings.mockImplementation(() => {
    throw new Error('Disk full');
  });
  await expect(master.applyWorkerCount(request(1, true), state.workers.get(1))).rejects.toThrow(
    'Disk full'
  );
  expect(state.workers.size).toBe(3);
});

it('rolls back new workers if readiness times out and rejects overlapping changes', async () => {
  if (os.cpus().length < 4) return;
  vi.useFakeTimers();
  state.fork.mockImplementation(() => worker());
  const operation = master.applyWorkerCount(request(4), state.workers.get(1));
  const rejection = expect(operation).rejects.toThrow(/did not become ready/);
  await expect(master.applyWorkerCount(request(2, true), state.workers.get(1))).rejects.toThrow(
    /in progress/
  );
  expect(state.config.updateNodeSettings).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(20_000);
  await rejection;
  expect(state.workers.size).toBe(3);
  expect(state.config.nodeSettings.workerCount).toBe(3);
});

it.each([-1, 1.5, NaN, Infinity])('rejects invalid selection %s', async (count) => {
  await expect(master.applyWorkerCount(request(count), state.workers.get(1))).rejects.toThrow(
    /Select Automatic/
  );
  expect(state.config.updateNodeSettings).not.toHaveBeenCalled();
});

it.each([1, 2])(
  'caps a requested four workers to %i CPUs at startup and on live apply',
  async (maximum) => {
    const cpu = os.cpus()[0]!;
    const cpuCount = vi
      .spyOn(os, 'cpus')
      .mockReturnValue(Array.from({ length: maximum }, () => cpu));
    try {
      state.workers.clear();
      state.config.nodeSettings.workerCount = 4;
      master.forkWorkers();
      expect(state.workers.size).toBe(maximum);
      const requester = [...state.workers.values()][0];
      await expect(master.applyWorkerCount(request(4), requester)).resolves.toMatchObject({
        workerCount: 4,
        runningWorkers: maximum,
        maxWorkers: maximum,
      });
      expect(master.desiredWorkers).toBe(maximum);
    } finally {
      cpuCount.mockRestore();
    }
  }
);

it('restores the previous target if an existing worker crashes during an increase', async () => {
  if (os.cpus().length < 4) return;
  state.fork.mockImplementation(() => worker());
  const operation = master.applyWorkerCount(request(4), state.workers.get(1));
  const rejection = expect(operation).rejects.toThrow(/state changed/);
  state.workers.get(2).kill();
  state.workers.get(4).emit('message', { cmd: 'worker_http_ready' });
  await rejection;
  expect(state.config.nodeSettings.workerCount).toBe(3);
  expect(state.workers.size).toBe(3);
});

it('correlates IPC snapshots and applies, ignores missing workers, and reports invalid operations', async () => {
  master.setupIPCHandlers();
  const handler = state.handlers.get('worker_count_request')!;
  const requester = state.workers.get(1);
  await handler({ operation: 'snapshot' });
  expect(state.send).not.toHaveBeenCalled();
  await handler({ requestId: 'snapshot', operation: 'snapshot' }, requester);
  expect(state.send).toHaveBeenLastCalledWith(
    requester,
    expect.objectContaining({
      requestId: 'snapshot',
      snapshot: expect.objectContaining({ runningWorkers: 3 }),
    })
  );
  await handler(request(3), requester);
  expect(state.send).toHaveBeenLastCalledWith(
    requester,
    expect.objectContaining({
      requestId: 'test',
      snapshot: expect.objectContaining({ workerCount: 3 }),
    })
  );
  await handler({ requestId: 'invalid', operation: 'unknown' }, requester);
  expect(state.send).toHaveBeenLastCalledWith(
    requester,
    expect.objectContaining({ requestId: 'invalid', error: 'Invalid worker operation.' })
  );
  vi.spyOn(master, 'applyWorkerCount').mockRejectedValueOnce(null);
  await handler(request(1), requester);
  expect(state.send).toHaveBeenLastCalledWith(
    requester,
    expect.objectContaining({ error: 'Unable to change worker count.' })
  );
});

it('does not accept changes after shutdown begins or without a count', async () => {
  master.isRunning = false;
  await expect(master.applyWorkerCount(request(3), state.workers.get(1))).rejects.toThrow(
    /shutdown/
  );
  master.isRunning = true;
  await expect(
    master.applyWorkerCount({ operation: 'apply' }, state.workers.get(1))
  ).rejects.toThrow(/Select Automatic/);
});

it('rolls back when an additional worker exits before readiness and ignores unrelated messages', async () => {
  const requester = state.workers.get(1);
  state.fork.mockImplementation(() => worker());
  const operation = master.applyWorkerCount(request(4), requester);
  const rejection = expect(operation).rejects.toThrow(/failed to start/);
  const added = state.workers.get(4);
  added.emit('message', { cmd: 'unrelated' });
  expect(state.config.updateNodeSettings).not.toHaveBeenCalled();
  added.kill();
  await rejection;
  expect(state.workers.size).toBe(3);
  expect(added.listenerCount('message')).toBe(0);
});

it('rolls back an increase when shutdown starts before the worker becomes ready', async () => {
  state.fork.mockImplementation(() => worker());
  const operation = master.applyWorkerCount(request(4), state.workers.get(1));
  const rejection = expect(operation).rejects.toThrow(/shutting down/);
  master.stopping = Promise.resolve();
  state.workers.get(4).emit('message', { cmd: 'worker_http_ready' });
  await rejection;
  expect(state.config.updateNodeSettings).not.toHaveBeenCalled();
  expect(state.workers.size).toBe(3);
});

it('rejects a reduction when the requester leaves insufficient removable workers', async () => {
  const requester = state.workers.get(1);
  const spy = vi.spyOn(master.ipc, 'getWorkers').mockReturnValue([requester, requester, requester]);
  await expect(master.applyWorkerCount(request(1, true), requester)).rejects.toThrow(
    /state changed/
  );
  expect(state.config.updateNodeSettings).not.toHaveBeenCalled();
  spy.mockRestore();
});

it('skips workers that already exited and excludes retiring workers from snapshots', async () => {
  const removed = state.workers.get(2);
  removed.kill();
  await master.removeWorkers([removed]);
  expect(master.retiringWorkers.has(removed.id)).toBe(false);
  master.retiringWorkers.add(1);
  expect(master.workerSnapshot().runningWorkers).toBe(2);
});

it('reports unconfirmed removals instead of claiming a successful reduction', async () => {
  vi.useFakeTimers();
  const removed = state.workers.get(2);
  removed.kill.mockImplementation(() => {});
  const rejection = expect(master.removeWorkers([removed])).rejects.toThrow(
    /could not be confirmed/
  );
  await vi.advanceTimersByTimeAsync(5000);
  await rejection;
  expect(removed.listenerCount('exit')).toBe(0);
});

it('saves Automatic while applying the current CPU limit', async () => {
  const cpu = os.cpus()[0]!;
  const cpuCount = vi.spyOn(os, 'cpus').mockReturnValue([cpu, cpu, cpu]);
  try {
    await expect(master.applyWorkerCount(request(0), state.workers.get(1))).resolves.toMatchObject({
      workerCount: 0,
      runningWorkers: 3,
      maxWorkers: 3,
    });
    expect(state.config.updateNodeSettings).toHaveBeenCalledWith({ workerCount: 0 });
    expect(state.fork).not.toHaveBeenCalled();
  } finally {
    cpuCount.mockRestore();
  }
});
