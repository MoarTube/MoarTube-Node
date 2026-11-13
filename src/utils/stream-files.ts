import { createWriteStream, existsSync, renameSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { acquireFileLock } from './file-lock.js';

/** Publish only complete files; callers retain the previous version after failures. */
export async function writeUpload(
  upload: { file: Readable & { truncated?: boolean } },
  destination: string,
  maxBytes: number,
  signal?: AbortSignal,
  beforeReplace?: (destination: string) => Promise<void>
): Promise<boolean> {
  // A disk stream can fail before directory preparation completes. Its iterator/pipeline
  // still observes the error; this listener prevents an early unhandled event.
  upload.file.on('error', () => {});
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.part`;
  let bytes = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > maxBytes ? new Error('Upload exceeds byte limit') : null, chunk);
    },
  });
  try {
    await pipeline(
      upload.file,
      limit,
      createWriteStream(temporary, { flags: 'wx' }),
      signal ? { signal } : {}
    );
    if (upload.file.truncated) {
      throw new Error('Upload was truncated');
    }
    // Stage concurrently, but classify and publish under one short OS-backed
    // object lock. A second writer must see the first writer's publication.
    let release: (() => void) | undefined;
    for (let attempt = 0; release === undefined; attempt++) {
      signal?.throwIfAborted();
      try {
        release = acquireFileLock(destination);
      } catch (error) {
        // An owner can release its directory after our mkdir reports EEXIST but
        // before acquireFileLock inspects that directory. Retry that lost-owner
        // race only while the actual publication parent still exists.
        const releasedOwner =
          (error as NodeJS.ErrnoException).code === 'ENOENT' &&
          existsSync(path.dirname(destination));
        const busy = error instanceof Error && error.message.startsWith('Another settings change');
        if ((!releasedOwner && !busy) || attempt >= 999) {
          throw error;
        }
        await delay(10, undefined, signal ? { signal } : {});
      }
    }
    try {
      const replacing = existsSync(destination);
      // Inspect the previous representation under the same lock as publication.
      if (replacing) {
        await beforeReplace?.(destination);
      }
      renameSync(temporary, destination);
      return replacing;
    } finally {
      release();
    }
  } finally {
    await rm(temporary, { force: true });
  }
}
