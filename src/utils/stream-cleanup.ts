import { operationalForPath, writeRecovery } from '@/database/recovery.js';
import path from 'node:path';
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
    const file = 'cleanup:' + job.videoId + '-' + job.generation;
    await writeRecovery(this.settingsPath, file, JSON.stringify(job));
    this.schedule(file, job);
  }

  async recover(): Promise<void> {
    const db = operationalForPath(this.settingsPath);
    try {
      for (const row of await db.query<{ key: string; value: string }>(
        "SELECT key,value FROM node_recovery WHERE key LIKE 'cleanup:%'"
      )) {
        try {
          const job = JSON.parse(row.value) as StreamCleanupJob;
          validate(job);
          this.schedule(row.key, job);
        } catch (error) {
          this.failed(error);
        }
      }
    } finally {
      await db.close();
    }
  }

  private get settingsPath(): string {
    return this.directory.replace(/\.stream-cleanup$/, '');
  }
  private async acknowledge(key: string, job: StreamCleanupJob): Promise<void> {
    const db = operationalForPath(this.settingsPath);
    try {
      await db.query('DELETE FROM node_recovery WHERE key=? AND value=?', [
        key,
        JSON.stringify(job),
      ]);
    } finally {
      await db.close();
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
          .then(() => this.acknowledge(file, job))
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
