import { expect, it } from 'vitest';
import {
  parseLinuxProcessCpu,
  parseMacProcessCpu,
  processTreeCpuDelta,
  type ProcessCpu,
  type ProcessCpuSnapshot,
} from '@/utils/process-cpu.js';

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
