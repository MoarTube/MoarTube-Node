import { mediaObjectCacheControl } from '@/utils/media-cache.js';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import type { StorageMigration } from '@/validators/storage-migration.js';

const prefix = 'external/videos/';

interface Remote {
  client: S3Client;
  bucket: string;
}

function remote(config: Extract<StorageMigration, { direction: 's3-to-s3' }>['source']): Remote {
  return {
    client: new S3Client({
      ...config.s3ProviderClientConfig,
      region: config.s3ProviderClientConfig.region,
      forcePathStyle: config.s3ProviderClientConfig.forcePathStyle,
      requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
    }),
    bucket: config.bucketName,
  };
}

function contentType(key: string): string {
  const types: Record<string, string> = {
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.ts': 'video/mp2t',
    '.mp4': 'video/mp4',
    '.m4s': 'video/iso.segment',
    '.mpd': 'application/dash+xml',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.vtt': 'text/vtt',
  };
  return types[path.extname(key).toLowerCase()] ?? 'application/octet-stream';
}

// Use bounded buffers and multipart uploads so videos larger than 5 GiB also work.
// Failed uploads are deliberately left in place; migration never deletes or aborts data.
async function upload(
  target: Remote,
  key: string,
  input: Readable,
  size: number,
  type: string
): Promise<void> {
  const partSize = Math.max(16 * 1024 ** 2, Math.ceil(size / 10_000));
  let uploadId: string | undefined;
  const parts: { ETag: string; PartNumber: number }[] = [];
  let buffer = Buffer.allocUnsafe(partSize);
  let used = 0;
  const sendPart = async (body: Buffer): Promise<void> => {
    if (uploadId === undefined || uploadId === '') {
      const result = await target.client.send(
        new CreateMultipartUploadCommand({
          Bucket: target.bucket,
          Key: key,
          ContentType: type,
          CacheControl: mediaObjectCacheControl(key),
        })
      );
      uploadId = result.UploadId;
      if (uploadId === undefined || uploadId === '') {
        throw new Error('Missing multipart upload ID');
      }
    }
    const partNumber = parts.length + 1;
    const result = await target.client.send(
      new UploadPartCommand({
        Bucket: target.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
      })
    );
    if (result.ETag === undefined || result.ETag === '') {
      throw new Error('Missing multipart ETag');
    }
    parts.push({ ETag: result.ETag, PartNumber: partNumber });
  };
  try {
    for await (const value of input) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
      let offset = 0;
      while (offset < chunk.length) {
        const length = Math.min(partSize - used, chunk.length - offset);
        chunk.copy(buffer, used, offset, offset + length);
        used += length;
        offset += length;
        if (used === partSize) {
          await sendPart(buffer);
          buffer = Buffer.allocUnsafe(partSize);
          used = 0;
        }
      }
    }
    if (uploadId === undefined || uploadId === '') {
      await target.client.send(
        new PutObjectCommand({
          Bucket: target.bucket,
          Key: key,
          Body: buffer.subarray(0, used),
          ContentType: type,
          CacheControl: mediaObjectCacheControl(key),
        })
      );
    } else {
      if (used > 0) {
        await sendPart(buffer.subarray(0, used));
      }
      await target.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: target.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        })
      );
    }
  } finally {
    input.destroy();
  }
}

// Local encoder files are flat; public HLS paths include manifest and segment directories.
// Only translate paths here. Relative playlist contents are copied unchanged.
function publicKey(localKey: string): string {
  return localKey
    .replace(
      /^(external\/videos\/[^/]+\/adaptive\/m3u8\/)(manifest-[^/]+\.m3u8)$/,
      '$1static/manifests/$2'
    )
    .replace(/^(external\/videos\/[^/]+\/adaptive\/m3u8\/)([0-9]+p)\/([^/]+)$/, '$1$2/segments/$3');
}

function localKey(key: string): string {
  return key
    .replace(
      /^(external\/videos\/[^/]+\/adaptive\/m3u8\/)static\/manifests\/(manifest-[^/]+\.m3u8)$/,
      '$1$2'
    )
    .replace(/^(external\/videos\/[^/]+\/adaptive\/m3u8\/[0-9]+p\/)segments\/([^/]+)$/, '$1$2');
}

async function* localFiles(
  root: string,
  relative = ''
): AsyncGenerator<{ key: string; file: string }> {
  for (const entry of await fs.promises.readdir(path.join(root, relative), {
    withFileTypes: true,
  })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      yield* localFiles(root, name);
    } else if (entry.isFile()) {
      yield {
        key: publicKey(prefix + name.split(path.sep).join('/')),
        file: path.join(root, name),
      };
    }
  }
}

async function downloadPath(root: string, key: string): Promise<string> {
  const relative = localKey(key).slice(prefix.length);
  const segments = relative.split('/');
  // S3 object names cannot be allowed to write outside the Node's video directory.
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        /[\\:]/.test(segment) ||
        segment.includes(String.fromCharCode(0))
    )
  ) {
    throw new Error('Invalid video object path');
  }
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = await fs.promises.lstat(current).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      return undefined;
    });
    if (stat?.isSymbolicLink() === true) {
      throw new Error('Video object path contains a symbolic link');
    }
  }
  await fs.promises.mkdir(path.dirname(current), { recursive: true });
  return current;
}

/** Copy every video object, replacing matching destinations and retaining every source. */
export async function migrateStorage(
  migration: StorageMigration,
  videosDirectory: string
): Promise<number> {
  const source = 'source' in migration ? remote(migration.source) : undefined;
  const destination = 'destination' in migration ? remote(migration.destination) : undefined;
  let filesCopied = 0;
  try {
    if (!source && destination) {
      for await (const { key, file } of localFiles(videosDirectory)) {
        const stat = await fs.promises.stat(file);
        await upload(destination, key, fs.createReadStream(file), stat.size, contentType(key));
        filesCopied++;
      }
    } else if (source) {
      let token: string | undefined;
      do {
        const page = await source.client.send(
          new ListObjectsV2Command({
            Bucket: source.bucket,
            Prefix: prefix,
            ...(token !== undefined && token !== '' ? { ContinuationToken: token } : {}),
          })
        );
        for (const object of page.Contents ?? []) {
          if (object.Key === undefined || object.Key === '' || object.Key.endsWith('/')) {
            continue;
          }
          const key = object.Key;
          const target = destination ?? (await downloadPath(videosDirectory, key));
          const response = await source.client.send(
            new GetObjectCommand({ Bucket: source.bucket, Key: key })
          );
          if (!response.Body) {
            throw new Error('Missing video object body');
          }
          const body = response.Body as Readable;
          try {
            if (typeof target !== 'string') {
              await upload(
                target,
                key,
                body,
                response.ContentLength ?? object.Size ?? 0,
                response.ContentType ?? contentType(key)
              );
            } else {
              await pipeline(body, fs.createWriteStream(target, { flags: 'w' }));
            }
          } finally {
            body.destroy();
          }
          filesCopied++;
        }
        token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
        if (page.IsTruncated === true && (token === undefined || token === '')) {
          throw new Error('Missing S3 continuation token');
        }
      } while (token !== undefined && token !== '');
    }
    return filesCopied;
  } finally {
    source?.client.destroy();
    destination?.client.destroy();
  }
}
