import { DeleteObjectsCommand, type S3Client } from '@aws-sdk/client-s3';
import { setTimeout as delay } from 'node:timers/promises';

/** A successful HTTP response can contain failed keys. Retry those keys at most three times. */
export async function deleteS3Objects(
  client: S3Client,
  bucket: string,
  keys: string[]
): Promise<number> {
  let pending = keys;
  let failures: Array<{ Key?: string | undefined; Code?: string | undefined }> = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: pending.map((Key) => ({ Key })), Quiet: true },
      })
    );
    failures = result.Errors ?? [];
    if (failures.length === 0) {
      return keys.length;
    }
    const retryable = failures.every(
      (error) =>
        error.Key !== undefined &&
        [
          'InternalError',
          'ServiceUnavailable',
          'SlowDown',
          'RequestTimeout',
          'Throttling',
        ].includes(error.Code ?? '')
    );
    if (!retryable) {
      break;
    }
    pending = failures.map((error) => error.Key as string);
    if (attempt < 2) {
      await delay(100 * 2 ** attempt);
    }
  }
  throw new AggregateError(
    failures.map(
      (error) =>
        new Error(
          `S3 delete failed for ${error.Key ?? '(unknown key)'}: ${error.Code ?? 'UnknownError'}`
        )
    ),
    'S3 deletion incomplete; retry cleanup before removing metadata.'
  );
}
