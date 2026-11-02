import { afterEach, expect, it, vi } from 'vitest';
import { cpus } from 'node:os';
import { getCpuMetrics } from '@/utils/cpu-metrics.js';
import { getProcessCpuSnapshot } from '@/utils/process-cpu.js';

vi.mock('node:os', () => ({ cpus: vi.fn() }));
vi.mock('@/utils/process-cpu.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getProcessCpuSnapshot: vi.fn().mockRejectedValue(new Error('Unavailable')),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function cores(user: number, idle: number): ReturnType<typeof cpus> {
  return [
    { model: 'test', speed: 1000, times: { user, nice: 0, sys: 0, idle, irq: 0 } },
    { model: 'test', speed: 1000, times: { user: 0, nice: 0, sys: 0, idle: user + idle, irq: 0 } },
  ];
}

it('averages CPU time deltas across all cores and shares concurrent samples', async () => {
  vi.useFakeTimers();
  vi.mocked(cpus).mockReturnValueOnce(cores(100, 100)).mockReturnValueOnce(cores(200, 200));
  const sample = getCpuMetrics();
  expect(getCpuMetrics()).toBe(sample);
  await vi.advanceTimersByTimeAsync(250);
  expect(await sample).toEqual({ usedPercent: 25, appPercent: null });
  vi.mocked(cpus).mockReturnValueOnce(cores(200, 200)).mockReturnValueOnce(cores(200, 300));
  const next = getCpuMetrics();
  await vi.advanceTimersByTimeAsync(250);
  expect(await next).toEqual({ usedPercent: 0, appPercent: null });
});

it('rejects missing CPUs and recovers on the next sample', async () => {
  vi.mocked(cpus).mockReturnValueOnce([]);
  await expect(getCpuMetrics()).rejects.toThrow('CPU metrics are unavailable');
  vi.useFakeTimers();
  vi.mocked(cpus).mockReturnValueOnce(cores(0, 0)).mockReturnValueOnce(cores(100, 0));
  const next = getCpuMetrics();
  await vi.advanceTimersByTimeAsync(250);
  expect(await next).toEqual({ usedPercent: 50, appPercent: null });
});

it('normalizes application CPU time against all cores and includes encoding children', async () => {
  vi.useFakeTimers();
  vi.mocked(cpus).mockReturnValueOnce(cores(100, 100)).mockReturnValueOnce(cores(200, 200));
  vi.mocked(getProcessCpuSnapshot)
    .mockResolvedValueOnce({
      helperPid: 0,
      processes: [
        { pid: 100, parentPid: 1, started: 'root', milliseconds: 20 },
        { pid: 101, parentPid: 100, started: 'ffmpeg', milliseconds: 100 },
      ],
    })
    .mockResolvedValueOnce({
      helperPid: 0,
      processes: [
        { pid: 100, parentPid: 1, started: 'root', milliseconds: 30 },
        { pid: 101, parentPid: 100, started: 'ffmpeg', milliseconds: 130 },
      ],
    });
  const sample = getCpuMetrics(100);
  await vi.advanceTimersByTimeAsync(250);
  expect(await sample).toEqual({ usedPercent: 25, appPercent: 10 });
});

it('reports one busy application thread as 3.125 percent on a 32-thread CPU', async () => {
  vi.useFakeTimers();
  const core = (user: number, idle: number): ReturnType<typeof cpus>[number] => ({
    model: 'test',
    speed: 1000,
    times: { user, nice: 0, sys: 0, idle, irq: 0 },
  });
  vi.mocked(cpus)
    .mockReturnValueOnce(Array.from({ length: 32 }, () => core(0, 0)))
    .mockReturnValueOnce(
      Array.from({ length: 32 }, (_, index) => core(index === 0 ? 250 : 0, index === 0 ? 0 : 250))
    );
  vi.mocked(getProcessCpuSnapshot)
    .mockResolvedValueOnce({
      helperPid: 0,
      processes: [{ pid: 100, parentPid: 1, started: 'root', milliseconds: 0 }],
    })
    .mockResolvedValueOnce({
      helperPid: 0,
      processes: [{ pid: 100, parentPid: 1, started: 'root', milliseconds: 250 }],
    });
  const sample = getCpuMetrics(100);
  await vi.advanceTimersByTimeAsync(250);
  expect(await sample).toEqual({ usedPercent: 3.125, appPercent: 3.125 });
});

it('rejects a sample when CPU counters do not advance', async () => {
  vi.useFakeTimers();
  vi.mocked(cpus).mockReturnValue(cores(100, 100));
  const result = expect(getCpuMetrics()).rejects.toThrow('Invalid CPU sample');
  await vi.advanceTimersByTimeAsync(250);
  await result;
});
