import { afterEach, expect, it, vi } from 'vitest';
import {
  parseLinuxProcessCpu,
  parseMacProcessCpu,
  processTreeCpuDelta,
  type ProcessCpu,
  type ProcessCpuSnapshot,
} from '@/utils/process-cpu.js';

const io = vi.hoisted(() => ({ run: vi.fn(), readFile: vi.fn(), readdir: vi.fn() }));
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
vi.mock('node:child_process', () => ({
  execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: io.run }),
}));
vi.mock('node:fs/promises', () => ({ readFile: io.readFile, readdir: io.readdir }));

afterEach(() => {
  Object.defineProperty(process, 'platform', platformDescriptor);
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.resetModules();
});

async function collector(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: platform });
  return (await import('@/utils/process-cpu.js')).getProcessCpuSnapshot;
}

function commandOutput(stdout: string, pid?: number) {
  return Object.assign(Promise.resolve({ stdout }), { child: { pid } });
}

function linuxStat(overrides: Record<number, string> = {}, pid = '101') {
  const fields = Array<string>(20).fill('0');
  Object.assign(fields, { 0: 'S', 1: '100', 11: '120', 12: '30', 19: '12345' }, overrides);
  return `${pid} (ffmpeg (worker)) ${fields.join(' ')}`;
}

it('reads Linux snapshots, caches clock ticks, and tolerates processes exiting or becoming inaccessible', async () => {
  const collect = await collector('linux');
  io.run.mockImplementation(() => commandOutput('100\n'));
  io.readdir.mockResolvedValue(['self', '101', '102', '103']);
  io.readFile.mockImplementation(async (path: string) => {
    if (path === '/proc/101/stat') return linuxStat();
    if (path === '/proc/102/stat') throw new Error('Process exited');
    return 'invalid counters';
  });
  const expected = snapshot([entry(101, 100, 1500, '12345')]);
  expect(await collect()).toEqual(expected);
  expect(await collect()).toEqual(expected);
  expect(io.run).toHaveBeenCalledExactlyOnceWith('getconf', ['CLK_TCK'], { timeout: 5000 });
  expect(io.readdir).toHaveBeenCalledWith('/proc');
  expect(io.readFile).toHaveBeenCalledWith('/proc/101/stat', 'utf8');
});

it.each(['NaN', '0', '-100'])(
  'retries Linux clock discovery after invalid rate %s',
  async (rate) => {
    const collect = await collector('linux');
    io.run
      .mockImplementationOnce(() => commandOutput(rate))
      .mockImplementationOnce(() => commandOutput('100'));
    io.readdir.mockResolvedValue([]);
    await expect(collect()).rejects.toThrow('Invalid system clock tick rate');
    expect(await collect()).toEqual(snapshot([]));
    expect(io.run).toHaveBeenCalledTimes(2);
  }
);

it('propagates command and proc enumeration errors and retries failed clock discovery', async () => {
  const collect = await collector('linux');
  io.run
    .mockRejectedValueOnce(new Error('getconf failed'))
    .mockImplementation(() => commandOutput('100'));
  await expect(collect()).rejects.toThrow('getconf failed');
  io.readdir.mockRejectedValueOnce(new Error('proc unavailable')).mockResolvedValue([]);
  await expect(collect()).rejects.toThrow('proc unavailable');
  expect(await collect()).toEqual(snapshot([]));
  expect(io.run).toHaveBeenCalledTimes(2);
});

it.each([900, undefined])('collects macOS counters and records helper PID %s', async (pid) => {
  const collect = await collector('darwin');
  io.run.mockReturnValue(commandOutput('101 100 1-02:03:04.5 Mon Nov 2 10:00:00 2026', pid));
  expect(await collect()).toEqual(
    snapshot([entry(101, 100, 93784500, 'Mon Nov 2 10:00:00 2026')], pid ?? 0)
  );
  expect(io.run).toHaveBeenCalledWith('ps', ['-axo', 'pid=,ppid=,time=,lstart='], {
    timeout: 10000,
    maxBuffer: 8 * 1024 ** 2,
  });
});

it.each([900, undefined])(
  'collects Windows counters, filters malformed records, and records helper PID %s',
  async (pid) => {
    const collect = await collector('win32');
    io.run.mockReturnValue(
      Object.assign(
        Promise.resolve({ stdout: '101 100 12345 1500.5\r\n0 1 123 10\r\ninvalid\r\n101 100' }),
        { child: { pid } }
      )
    );
    expect(await collect()).toEqual(snapshot([entry(101, 100, 1500.5, '12345')], pid ?? 0));
    expect(io.run).toHaveBeenCalledWith(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        expect.stringContaining('Get-CimInstance Win32_Process'),
      ],
      { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 ** 2 }
    );
  }
);

it.each(['darwin', 'win32'] as const)('propagates %s collector failures', async (platform) => {
  const collect = await collector(platform);
  io.run.mockRejectedValue(new Error('measurement failed'));
  await expect(collect()).rejects.toThrow('measurement failed');
});

it('rejects unsupported operating systems', async () => {
  await expect((await collector('freebsd'))()).rejects.toThrow('unsupported');
  expect(io.run).not.toHaveBeenCalled();
});

it.each([
  ['missing closing parenthesis', '101 (invalid', 100],
  ['missing fields', '101 (worker) S 100', 100],
  ['noninteger PID', linuxStat({}, '1.5'), 100],
  ['zero PID', linuxStat({}, '0'), 100],
  ['noninteger parent', linuxStat({ 1: '1.5' }), 100],
  ['negative parent', linuxStat({ 1: '-1' }), 100],
  ['negative counters', linuxStat({ 11: '-500' }), 100],
  ['nonfinite counters', linuxStat({ 11: 'NaN' }), 100],
  ['zero clock rate', linuxStat(), 0],
  ['negative clock rate', linuxStat({ 11: '0', 12: '0' }), -100],
] as const)('rejects Linux records with %s', (_reason, stat, ticks) => {
  expect(() => parseLinuxProcessCpu(stat, ticks)).toThrow('Invalid process CPU counters');
});

it('filters invalid macOS counters', () => {
  expect(parseMacProcessCpu('0 100 1:00 started\n101 100 1..2 started')).toEqual([]);
});

it('rejects a replaced or previously missing root and clamps reset counters to zero', () => {
  expect(() =>
    processTreeCpuDelta(
      snapshot([entry(100, 1, 100, 'old')]),
      snapshot([entry(100, 1, 110, 'new')]),
      100
    )
  ).toThrow('unavailable');
  expect(() => processTreeCpuDelta(snapshot([]), snapshot([entry(100, 1, 110)]), 100)).toThrow(
    'unavailable'
  );
  expect(
    processTreeCpuDelta(snapshot([entry(100, 1, 100)]), snapshot([entry(100, 1, 10)]), 100)
  ).toBe(0);
});

const entry = (
  pid: number,
  parentPid: number,
  milliseconds: number,
  started = String(pid)
): ProcessCpu => ({ pid, parentPid, milliseconds, started });
const snapshot = (processes: ProcessCpu[], helperPid = 0): ProcessCpuSnapshot => ({
  processes,
  helperPid,
});

it('counts the application, siblings and FFmpeg grandchildren while excluding unrelated processes and measurement helpers', () => {
  const before = snapshot([
    entry(100, 1, 1000),
    entry(101, 100, 2000),
    entry(102, 100, 3000),
    entry(103, 101, 4000),
  ]);
  const after = snapshot(
    [
      entry(100, 1, 1010),
      entry(101, 100, 2020),
      entry(102, 100, 3030),
      entry(103, 101, 4040),
      entry(104, 103, 50),
      entry(105, 101, 9000),
      entry(106, 105, 8000),
      entry(200, 1, 99999),
    ],
    105
  );
  expect(processTreeCpuDelta(before, after, 100)).toBe(150);
  expect(processTreeCpuDelta(before, after, 101)).toBe(110);
});

it('handles exited children, reused PIDs, and cycles without negative or duplicate CPU time', () => {
  const before = snapshot([
    entry(100, 101, 100),
    entry(101, 100, 9000, 'old'),
    entry(102, 100, 1000),
  ]);
  const after = snapshot([entry(100, 101, 110), entry(101, 100, 20, 'new')]);
  expect(processTreeCpuDelta(before, after, 100)).toBe(30);
  expect(() => processTreeCpuDelta(before, snapshot([]), 100)).toThrow('unavailable');
});

it('parses Linux CPU ticks with tricky command names without including child CPU a second time', () => {
  const fields = Array<string>(20).fill('0');
  fields[0] = 'S';
  fields[1] = '100';
  fields[11] = '120';
  fields[12] = '30';
  fields[13] = '999';
  fields[14] = '999';
  fields[19] = '12345';
  expect(parseLinuxProcessCpu(`101 (ffmpeg (worker)) ${fields.join(' ')}`, 100)).toEqual(
    entry(101, 100, 1500, '12345')
  );
});

it('parses macOS cumulative CPU time with centisecond precision and long-running processes', () => {
  expect(
    parseMacProcessCpu(
      '101 100 2:03.45 Mon Nov 2 10:00:00 2026\n102 100 01:02:03.00 Mon Nov 2 10:00:01 2026\ninvalid'
    )
  ).toEqual([
    entry(101, 100, 123450, 'Mon Nov 2 10:00:00 2026'),
    entry(102, 100, 3723000, 'Mon Nov 2 10:00:01 2026'),
  ]);
});
