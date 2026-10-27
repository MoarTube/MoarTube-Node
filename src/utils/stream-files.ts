import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/** Publish only complete files; callers retain the previous version after failures. */
export async function writeUpload(
  upload: { file: Readable & { truncated?: boolean } },
  destination: string,
  maxBytes: number
): Promise<void> {
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
    await pipeline(upload.file, limit, createWriteStream(temporary, { flags: 'wx' }));
    if (upload.file.truncated) {
      throw new Error('Upload was truncated');
    }
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
