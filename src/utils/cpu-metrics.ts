import { cpus } from 'node:os';
import { setTimeout } from 'node:timers/promises';
import { getProcessCpuSnapshot, processTreeCpuDelta } from './process-cpu.js';

export interface CpuMetrics {
  usedPercent: number;
  appPercent: number | null;
}

function snapshot(): { idle: number; total: number } {
  const cores = cpus();
  if (cores.length === 0) {
    throw new Error('CPU metrics are unavailable');
  }
  return cores.reduce(
    (sum, { times }) => ({
      idle: sum.idle + times.idle,
      total: sum.total + times.user + times.nice + times.sys + times.idle + times.irq,
    }),
    { idle: 0, total: 0 }
  );
}

const pending = new Map<number, Promise<CpuMetrics>>();

/** System and application utilization across all logical CPUs, sampled at least 250 ms apart. */
export function getCpuMetrics(rootPid: number = process.pid): Promise<CpuMetrics> {
  const existing = pending.get(rootPid);
  if (existing !== undefined) {
    return existing;
  }
  const sample = (async (): Promise<CpuMetrics> => {
    const processesBefore = await getProcessCpuSnapshot().catch(() => null);
    const before = snapshot();
    await setTimeout(250);
    const processesAfter = await getProcessCpuSnapshot().catch(() => null);
    const after = snapshot();
    const total = after.total - before.total;
    const idle = after.idle - before.idle;
    if (total <= 0 || idle < 0 || idle > total) {
      throw new Error('Invalid CPU sample');
    }
    const usedPercent = (1 - idle / total) * 100;
    let appPercent: number | null = null;
    if (processesBefore !== null && processesAfter !== null) {
      try {
        // Both process CPU time and OS counters are milliseconds, summed across all logical CPUs.
        appPercent = Math.min(
          usedPercent,
          (processTreeCpuDelta(processesBefore, processesAfter, rootPid) / total) * 100
        );
      } catch {
        // Preserve the system metric if process accounting is restricted or the root disappears.
      }
    }
    return { usedPercent, appPercent };
  })().finally(() => {
    pending.delete(rootPid);
  });
  pending.set(rootPid, sample);
  return sample;
}
