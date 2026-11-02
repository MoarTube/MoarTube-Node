import { mkdir, writeFile, rename, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageConfig } from '@/types/config.js';

export interface StreamCleanupJob {
  videoId: string;
  generation: string;
  deadline: number;
  storageConfig: StorageConfig;
  videosDirectory: string;
}

function validate(job: StreamCleanupJob): void {
  if (
    typeof job.videoId !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(job.videoId) ||
    typeof job.generation !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(job.generation) ||
    !Number.isSafeInteger(job.deadline) ||
    job.deadline < 0 ||
    typeof job.videosDirectory !== 'string' ||
    !path.isAbsolute(job.videosDirectory) ||
    !['filesystem', 's3provider'].includes(job.storageConfig.storageMode)
  ) {
    throw new Error('Invalid stream cleanup journal');
  }
}

/** Private stop journal: timers are an optimization; persisted jobs survive worker restarts. */
export class StreamCleanupQueue {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;
  constructor(
    private readonly directory: string,
    private readonly perform: (job: StreamCleanupJob) => Promise<void>,
    private readonly failed: (error: unknown) => void
  ) {}

  async enqueue(job: StreamCleanupJob): Promise<void> {
    validate(job);
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `${job.videoId}-${job.generation}.json`);
    const temporary = file + '.' + randomUUID() + '.part';
    try {
      await writeFile(temporary, JSON.stringify(job), { flag: 'wx', mode: 0o600 });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
    this.schedule(file, job);
  }

  async recover(): Promise<void> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
    for (const name of names.filter((name) => name.endsWith('.json'))) {
      const file = path.join(this.directory, name);
      try {
        const job = JSON.parse(await readFile(file, 'utf8')) as StreamCleanupJob;
        validate(job);
        this.schedule(file, job);
      } catch (error) {
        this.failed(error);
      }
    }
  }

  private schedule(file: string, job: StreamCleanupJob, retry = false): void {
    if (this.closed) {
      return;
    }
    clearTimeout(this.timers.get(file));
    const timer = setTimeout(
      () => {
        this.timers.delete(file);
        if (job.deadline > Date.now()) {
          this.schedule(file, job);
          return;
        }
        void this.perform(job)
          .then(() => rm(file, { force: true }))
          .catch((error: unknown) => {
            this.failed(error);
            this.schedule(file, job, true);
          });
      },
      retry ? 30_000 : Math.min(2_147_483_647, Math.max(0, job.deadline - Date.now()))
    );
    timer.unref();
    this.timers.set(file, timer);
  }

  close(): void {
    this.closed = true;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
