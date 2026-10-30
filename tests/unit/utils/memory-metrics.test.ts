import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { freemem, totalmem } from 'node:os';
import { getMemoryMetrics, parseProcessMemory, sumProcessTree } from '@/utils/memory-metrics.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('node:os', () => ({ freemem: vi.fn(), totalmem: vi.fn() }));

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
function platform(value: string): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

/** Deliver callbacks asynchronously, as execFile does, after the child handle exists. */
function snapshot(output: string, pid: number | undefined = 900): void {
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const callback = args.at(-1) as (error: Error | null, stdout: string) => void;
    queueMicrotask(() => callback(null, output));
    return { pid } as ReturnType<typeof execFile>;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(totalmem).mockReturnValue(16 * 1024 ** 3);
  vi.mocked(freemem).mockReturnValue(4 * 1024 ** 3);
});
afterEach(() => Object.defineProperty(process, 'platform', originalPlatform));

describe('process memory snapshots', () => {
  it('normalizes Unix KiB readings and rejects malformed or invalid process records', () => {
    expect(
      parseProcessMemory(
        [
          '10 1 128',
          '11 10 256',
          '',
          '12 1',
          'bad 1 10',
          '0 1 10',
          '13 bad 10',
          '14 1 NaN',
          '15 1 -1',
          '16 1 1 extra',
        ].join('\r\n'),
        1024
      )
    ).toEqual([
      { pid: 10, parentPid: 1, bytes: 128 * 1024 },
      { pid: 11, parentPid: 10, bytes: 256 * 1024 },
    ]);
    expect(parseProcessMemory('', 1)).toEqual([]);
  });

  it('counts workers and encoding grandchildren while excluding helpers and unrelated processes', () => {
    const records = parseProcessMemory(
      '10 1 100\n11 10 200\n12 10 300\n13 11 400\n90 10 999\n91 90 999\n20 1 999',
      1
    );
    expect(sumProcessTree(records, 10, 90)).toBe(1000);
    expect(sumProcessTree(records, 11, 90)).toBe(600);
  });

  it('rejects missing application roots and avoids double-counting a cyclic tree', () => {
    expect(() => sumProcessTree([], 10, 0)).toThrow('Application process is unavailable');
    expect(sumProcessTree(parseProcessMemory('10 11 100\n11 10 200', 1), 10, 0)).toBe(300);
  });

  it('queries Windows working sets in bytes and excludes the measurement helper', async () => {
    platform('win32');
    snapshot(`${process.pid} 1 100\n20 ${process.pid} 200\n900 ${process.pid} 999`);
    expect(await getMemoryMetrics()).toEqual({
      appBytes: 300,
      availableBytes: 4 * 1024 ** 3,
      totalBytes: 16 * 1024 ** 3,
    });
    expect(execFile).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive']),
      expect.objectContaining({ windowsHide: true, timeout: 15000 }),
      expect.any(Function)
    );
    expect(readFile).not.toHaveBeenCalled();
  });

  it('queries Unix RSS in KiB, handles a missing helper PID, and caps free RAM at total RAM', async () => {
    platform('darwin');
    snapshot('10 1 128\n11 10 256');
    // Some child-process implementations do not expose a helper PID.
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error | null, stdout: string) => void;
      queueMicrotask(() => callback(null, '10 1 128\n11 10 256'));
      return {} as ReturnType<typeof execFile>;
    });
    vi.mocked(freemem).mockReturnValue(32 * 1024 ** 3);
    expect(await getMemoryMetrics(10)).toEqual({
      appBytes: 384 * 1024,
      availableBytes: 16 * 1024 ** 3,
      totalBytes: 16 * 1024 ** 3,
    });
    expect(execFile).toHaveBeenCalledWith(
      'ps',
      ['-axo', 'pid=,ppid=,rss='],
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('uses Linux MemAvailable so reclaimable cache is not reported as occupied memory', async () => {
    platform('linux');
    snapshot('10 1 128');
    vi.mocked(readFile).mockResolvedValue('MemTotal: 10000 kB\nMemAvailable: 4096 kB\n');
    expect((await getMemoryMetrics(10)).availableBytes).toBe(4096 * 1024);
    expect(readFile).toHaveBeenCalledWith('/proc/meminfo', 'utf8');
  });

  it('falls back to OS free RAM when Linux does not expose MemAvailable', async () => {
    platform('linux');
    snapshot('10 1 128');
    vi.mocked(readFile).mockResolvedValue('MemTotal: 10000 kB\n');
    expect((await getMemoryMetrics(10)).availableBytes).toBe(4 * 1024 ** 3);
  });

  it('propagates process-query errors rather than reporting a misleading zero', async () => {
    const cause = new Error('Permission denied');
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error | null, stdout: string) => void;
      queueMicrotask(() => callback(cause, ''));
      return {} as ReturnType<typeof execFile>;
    });
    await expect(getMemoryMetrics(10)).rejects.toMatchObject({
      message: 'Unable to query process memory',
      cause,
    });
  });

  it('propagates failures to read Linux memory availability', async () => {
    platform('linux');
    snapshot('10 1 128');
    vi.mocked(readFile).mockRejectedValue(new Error('Cannot read meminfo'));
    await expect(getMemoryMetrics(10)).rejects.toThrow('Cannot read meminfo');
  });
});
