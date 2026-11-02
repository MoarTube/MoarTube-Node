import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface ProcessCpu {
  pid: number;
  parentPid: number;
  started: string;
  milliseconds: number;
}

export interface ProcessCpuSnapshot {
  processes: ProcessCpu[];
  helperPid: number;
}

/** /proc CPU time uses clock ticks; the command name may contain spaces and parentheses. */
export function parseLinuxProcessCpu(stat: string, ticksPerSecond: number): ProcessCpu {
  const end = stat.lastIndexOf(')');
  const fields = stat
    .slice(end + 2)
    .trim()
    .split(/\s+/);
  const entry = {
    pid: Number(stat.slice(0, stat.indexOf(' '))),
    parentPid: Number(fields[1]),
    started: fields[19] ?? '',
    milliseconds: ((Number(fields[11]) + Number(fields[12])) * 1000) / ticksPerSecond,
  };
  if (end < 0 || !valid(entry) || ticksPerSecond <= 0) {
    throw new Error('Invalid process CPU counters');
  }
  return entry;
}

function valid(entry: ProcessCpu): boolean {
  return (
    Number.isInteger(entry.pid) &&
    entry.pid > 0 &&
    Number.isInteger(entry.parentPid) &&
    entry.parentPid >= 0 &&
    entry.started !== '' &&
    Number.isFinite(entry.milliseconds) &&
    entry.milliseconds >= 0
  );
}

export function parseMacProcessCpu(output: string): ProcessCpu[] {
  return output
    .trim()
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+([\d:.-]+)\s+(.+)$/.exec(line);
      if (match === null) {
        return [];
      }
      // A successful match always contains all four required capture groups.
      const clock = match[3] as string;
      const [days, time] = clock.includes('-')
        ? (clock.split('-') as [string, string])
        : ['0', clock];
      const parts = time.split(':').map(Number);
      const seconds = parts.reduce((sum, part) => sum * 60 + part, 0) + Number(days) * 86400;
      const entry = {
        pid: Number(match[1]),
        parentPid: Number(match[2]),
        started: match[4] as string,
        milliseconds: seconds * 1000,
      };
      return valid(entry) ? [entry] : [];
    });
}

let clockTicks: Promise<number> | undefined;

export async function getProcessCpuSnapshot(): Promise<ProcessCpuSnapshot> {
  if (process.platform === 'linux') {
    clockTicks ??= run('getconf', ['CLK_TCK'], { timeout: 5000 })
      .then(({ stdout }) => {
        const ticks = Number(stdout.trim());
        if (!Number.isFinite(ticks) || ticks <= 0) {
          throw new Error('Invalid system clock tick rate');
        }
        return ticks;
      })
      .catch((error: unknown) => {
        clockTicks = undefined;
        throw error;
      });
    const ticks = await clockTicks;
    const names = await readdir('/proc');
    const entries = await Promise.all(
      names
        .filter((name) => /^\d+$/.test(name))
        .map(async (name) => {
          try {
            return parseLinuxProcessCpu(await readFile(`/proc/${name}/stat`, 'utf8'), ticks);
          } catch {
            // Processes can exit during enumeration, and other users' counters may be restricted.
            return undefined;
          }
        })
    );
    return {
      processes: entries.filter((entry): entry is ProcessCpu => entry !== undefined),
      helperPid: 0,
    };
  }

  if (process.platform === 'darwin') {
    const pending = run('ps', ['-axo', 'pid=,ppid=,time=,lstart='], {
      timeout: 10000,
      maxBuffer: 8 * 1024 ** 2,
    });
    const { stdout } = await pending;
    return { processes: parseMacProcessCpu(stdout), helperPid: pending.child.pid ?? 0 };
  }

  if (process.platform !== 'win32') {
    throw new Error('Process CPU accounting is unsupported');
  }
  const pending = run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$ErrorActionPreference = "Stop"; Get-CimInstance Win32_Process | ForEach-Object { if ($null -ne $_.CreationDate) { $cpu = ([double]$_.KernelModeTime + [double]$_.UserModeTime) / 10000; "$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.Ticks) $($cpu.ToString([Globalization.CultureInfo]::InvariantCulture))" } }',
    ],
    { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 ** 2 }
  );
  const { stdout } = await pending;
  const processes = stdout
    .trim()
    .split(/\r?\n/)
    .flatMap((line) => {
      const [pid, parentPid, started, cpu] = line.trim().split(/\s+/);
      const entry = {
        pid: Number(pid),
        parentPid: Number(parentPid),
        started: started ?? '',
        milliseconds: Number(cpu),
      };
      return valid(entry) ? [entry] : [];
    });
  return { processes, helperPid: pending.child.pid ?? 0 };
}

/** CPU consumed by the live application tree, excluding the measurement helper. */
export function processTreeCpuDelta(
  before: ProcessCpuSnapshot,
  after: ProcessCpuSnapshot,
  rootPid: number
): number {
  const previous = new Map(before.processes.map((entry) => [entry.pid, entry]));
  const current = new Map(after.processes.map((entry) => [entry.pid, entry]));
  if (!current.has(rootPid) || previous.get(rootPid)?.started !== current.get(rootPid)?.started) {
    throw new Error('Application process is unavailable');
  }
  const children = new Map<number, number[]>();
  for (const entry of after.processes) {
    const siblings = children.get(entry.parentPid) ?? [];
    siblings.push(entry.pid);
    children.set(entry.parentPid, siblings);
  }
  const pending = [rootPid];
  const visited = new Set<number>();
  let milliseconds = 0;
  while (pending.length > 0) {
    // The queue is nonempty, and only contains PIDs from the current snapshot.
    const pid = pending.pop() as number;
    if (visited.has(pid) || pid === after.helperPid) {
      continue;
    }
    visited.add(pid);
    const entry = current.get(pid) as ProcessCpu;
    const old = previous.get(pid);
    // A new process or reused PID must not subtract the previous process's CPU time.
    const baseline = old?.started === entry.started ? old.milliseconds : 0;
    milliseconds += Math.max(0, entry.milliseconds - baseline);
    pending.push(...(children.get(pid) ?? []));
  }
  return milliseconds;
}
