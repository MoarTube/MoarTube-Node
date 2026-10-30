import { lstat, opendir, statfs } from 'node:fs/promises';
import path from 'node:path';

export interface StorageMetrics {
  storageMode: 'filesystem' | 's3provider';
  mediaBytes: number | null;
  availableBytes: number | null;
  totalBytes: number | null;
}

/** Count media file sizes without loading their contents or following links. */
export async function getDirectorySize(directory: string): Promise<number> {
  let bytes = 0;
  const directories = [directory];
  for (let current = directories.pop(); current !== undefined; current = directories.pop()) {
    try {
      const root = await lstat(current);
      if (!root.isDirectory() || root.isSymbolicLink()) {
        continue;
      }
      for await (const entry of await opendir(current)) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          directories.push(entryPath);
        } else if (entry.isFile()) {
          try {
            const stats = await lstat(entryPath);
            if (stats.isFile()) {
              bytes += stats.size;
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error;
            }
          }
        }
      }
    } catch (error) {
      // Videos may be finalized or deleted while scanning.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return bytes;
}

export async function getStorageMetrics(mediaDirectory: string): Promise<StorageMetrics> {
  const mediaBytes = await getDirectorySize(mediaDirectory);
  let directory = mediaDirectory;
  for (;;) {
    try {
      const disk = await statfs(directory);
      return {
        storageMode: 'filesystem',
        mediaBytes,
        availableBytes: disk.bavail * disk.bsize,
        totalBytes: disk.blocks * disk.bsize,
      };
    } catch (error) {
      const parent = path.dirname(directory);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === directory) {
        throw error;
      }
      directory = parent;
    }
  }
}
