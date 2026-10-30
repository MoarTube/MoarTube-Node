import { execFile } from 'node:child_process';
import { freemem, totalmem } from 'node:os';
import { readFile } from 'node:fs/promises';

export interface MemoryMetrics {
  appBytes: number;
  availableBytes: number;
  totalBytes: number;
}

interface ProcessMemory {
  pid: number;
  parentPid: number;
  bytes: number;
}

export function parseProcessMemory(output: string, unitBytes: number): ProcessMemory[] {
  return output
    .trim()
    .split(/\r?\n/)
    .flatMap((line) => {
      const fields = line.trim().split(/\s+/);
      if (fields.length !== 3) {
        return [];
      }
      const pid = Number(fields[0]);
      const parentPid = Number(fields[1]);
      const memory = Number(fields[2]);
      if (
        !Number.isInteger(pid) ||
        pid <= 0 ||
        !Number.isInteger(parentPid) ||
        !Number.isFinite(memory) ||
        memory < 0
      ) {
        return [];
      }
      return [{ pid, parentPid, bytes: memory * unitBytes }];
    });
}

export function sumProcessTree(
  processes: ProcessMemory[],
  rootPid: number,
  excludedPid: number
): number {
  const children = new Map<number, ProcessMemory[]>();
  const byPid = new Map(processes.map((entry) => [entry.pid, entry]));
  const root = byPid.get(rootPid);
  if (root === undefined) {
    throw new Error('Application process is unavailable');
  }
  for (const entry of processes) {
    const siblings = children.get(entry.parentPid) ?? [];
    siblings.push(entry);
    children.set(entry.parentPid, siblings);
  }
  const pending = [root];
  const visited = new Set<number>();
  let bytes = 0;
  for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
    if (entry.pid === excludedPid || visited.has(entry.pid)) {
      continue;
    }
    visited.add(entry.pid);
    bytes += entry.bytes;
    for (const child of children.get(entry.pid) ?? []) {
      pending.push(child);
    }
  }
  return bytes;
}

/** Resident memory of the application process tree, excluding this measurement's helper. */
export async function getMemoryMetrics(rootPid: number = process.pid): Promise<MemoryMetrics> {
  const windows = process.platform === 'win32';
  const snapshot = await new Promise<{ output: string; helperPid: number }>((resolve, reject) => {
    const child = execFile(
      windows ? 'powershell.exe' : 'ps',
      windows
        ? [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            'Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize)" }',
          ]
        : ['-axo', 'pid=,ppid=,rss='],
      { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error('Unable to query process memory', { cause: error }));
        } else {
          resolve({ output: stdout, helperPid: child.pid ?? 0 });
        }
      }
    );
  });
  const processes = parseProcessMemory(snapshot.output, windows ? 1 : 1024);
  const appBytes = sumProcessTree(processes, rootPid, snapshot.helperPid);
  const totalBytes = totalmem();
  let availableBytes = freemem();
  if (process.platform === 'linux') {
    // Linux's reclaimable cache is available to applications, not occupied RAM.
    const info = await readFile('/proc/meminfo', 'utf8');
    const available = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(info)?.[1];
    if (available !== undefined) {
      availableBytes = Number(available) * 1024;
    }
  }
  return { appBytes, availableBytes: Math.min(totalBytes, availableBytes), totalBytes };
}
