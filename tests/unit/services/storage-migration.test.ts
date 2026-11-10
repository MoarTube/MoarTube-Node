import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { migrateStorage } from '@/services/storage-migration.js';
import { siloFixture, siloProxy, type SiloFixture } from '../../support/silo.js';

let source: SiloFixture;
let destination: SiloFixture;
let root: string;
beforeEach(async () => {
  source = await siloFixture();
  destination = await siloFixture();
  root = await fs.mkdtemp(path.join(tmpdir(), 'moartube-migration-'));
});
afterEach(async () => {
  await source.close();
  await destination.close();
  await fs.rm(root, { recursive: true, force: true });
});

it('uploads every local video file, including multipart and empty files, overwriting without deleting', async () => {
  const key = 'external/videos/video/adaptive/manifest.m3u8';
  const file = path.join(root, 'video/adaptive/manifest.m3u8');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '#EXTM3U\n');
  const large = Buffer.alloc(17 * 1024 ** 2, 71);
  await fs.writeFile(path.join(root, 'video/large.mp4'), large);
  await fs.writeFile(path.join(root, 'video/empty.mp4'), '');
  await destination.put(key, 'old');
  await destination.put('external/videos/unrelated/file.txt', 'retain');
  const methods: string[] = [];
  const proxy = await siloProxy(destination.config.s3ProviderClientConfig.endpoint, (req) => {
    methods.push(req.method ?? '');
  });
  try {
    expect(
      await migrateStorage(
        {
          direction: 'filesystem-to-s3',
          destination: {
            ...destination.config,
            s3ProviderClientConfig: {
              ...destination.config.s3ProviderClientConfig,
              endpoint: proxy.endpoint,
            },
          },
        },
        root
      )
    ).toBe(3);
    expect(await destination.text(key)).toBe('#EXTM3U\n');
    expect(await fs.readFile(file, 'utf8')).toBe('#EXTM3U\n');
    expect(await destination.text('external/videos/unrelated/file.txt')).toBe('retain');
    expect(await destination.text('external/videos/video/empty.mp4')).toBe('');
    const object = await destination.client.send(
      new GetObjectCommand({
        Bucket: destination.config.bucketName,
        Key: 'external/videos/video/large.mp4',
      })
    );
    expect(object.CacheControl).toBe('public, max-age=0, s-maxage=31536000, must-revalidate');
    expect(
      createHash('sha256')
        .update(await object.Body!.transformToByteArray())
        .digest('hex')
    ).toBe(createHash('sha256').update(large).digest('hex'));
    expect(methods).not.toContain('DELETE');
    expect(methods.filter((method) => method === 'PUT').length).toBeGreaterThanOrEqual(4);
  } finally {
    await proxy.close();
  }
}, 30_000);

it('copies S3 video objects across stores with pagination and retains source and destination-only data', async () => {
  const keys = Array.from({ length: 1002 }, (_, i) => `external/videos/video/segment-${i}.ts`);
  for (let i = 0; i < keys.length; i += 30)
    await Promise.all(keys.slice(i, i + 30).map((key) => source.put(key, 'segment', 'video/mp2t')));
  await source.put('unrelated/data', 'do not copy');
  await destination.put(keys[0]!, 'old');
  await destination.put('external/videos/other/extra', 'keep');
  expect(
    await migrateStorage(
      { direction: 's3-to-s3', source: source.config, destination: destination.config },
      root
    )
  ).toBe(1002);
  expect(await source.text(keys[0]!)).toBe('segment');
  expect(await destination.text(keys[0]!)).toBe('segment');
  expect(await destination.text(keys.at(-1)!)).toBe('segment');
  expect(await destination.text('external/videos/other/extra')).toBe('keep');
  const object = await destination.client.send(
    new GetObjectCommand({ Bucket: destination.config.bucketName, Key: keys[0]! })
  );
  expect(object.ContentType).toBe('video/mp2t');
  expect(object.CacheControl).toBe('public, max-age=0, s-maxage=31536000, must-revalidate');
  await object.Body!.transformToByteArray();
  const unrelated = await destination.client.send(
    new ListObjectsV2Command({ Bucket: destination.config.bucketName, Prefix: 'unrelated/' })
  );
  expect(unrelated.Contents ?? []).toHaveLength(0);
}, 60_000);

it('downloads and overwrites Node files, retaining source objects and unrelated local files', async () => {
  const key = 'external/videos/video/images/poster.jpg';
  await source.put(key, 'new');
  await source.put('external/videos/empty-directory/', '');
  const file = path.join(root, 'video/images/poster.jpg');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, 'old');
  await fs.writeFile(path.join(root, 'keep.txt'), 'keep');
  expect(await migrateStorage({ direction: 's3-to-filesystem', source: source.config }, root)).toBe(
    1
  );
  expect(await fs.readFile(file, 'utf8')).toBe('new');
  expect(await fs.readFile(path.join(root, 'keep.txt'), 'utf8')).toBe('keep');
  expect(await source.text(key)).toBe('new');
});

it('surfaces a read failure without deleting source objects', async () => {
  const key = 'external/videos/video/source.mp4';
  await source.put(key, 'source');
  const proxy = await siloProxy(source.config.s3ProviderClientConfig.endpoint, (req) => {
    if (req.method === 'GET' && !req.url?.includes('list-type'))
      req.headers.authorization = 'invalid';
  });
  try {
    await expect(
      migrateStorage(
        {
          direction: 's3-to-filesystem',
          source: {
            ...source.config,
            s3ProviderClientConfig: {
              ...source.config.s3ProviderClientConfig,
              endpoint: proxy.endpoint,
            },
          },
        },
        root
      )
    ).rejects.toThrow();
    expect(await source.text(key)).toBe('source');
  } finally {
    await proxy.close();
  }
});
