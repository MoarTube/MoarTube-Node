import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    send = state.send;
    destroy = state.destroy;
  },
}));
import { migrateStorage } from '@/services/storage-migration.js';

let root: string;
const source = {
  bucketName: 'source',
  s3ProviderClientConfig: {
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'a', secretAccessKey: 'b' },
  },
};
const destination = { ...source, bucketName: 'destination' };
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-migration-errors-'));
  state.send.mockReset();
  state.destroy.mockClear();
  state.send.mockImplementation(async (command) => {
    switch (command.constructor.name) {
      case 'ListObjectsV2Command':
        return { Contents: [{ Key: 'external/videos/video/file.bin' }] };
      case 'GetObjectCommand':
        return { Body: Readable.from([new Uint8Array([1])]) };
      case 'CreateMultipartUploadCommand':
        return { UploadId: 'upload' };
      case 'UploadPartCommand':
        return { ETag: 'etag' };
      default:
        return {};
    }
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each([undefined, ''])(
  'rejects missing multipart IDs (%s) and leaves source data intact',
  async (UploadId) => {
    fs.writeFileSync(path.join(root, 'large.mp4'), Buffer.alloc(16 * 1024 ** 2));
    state.send.mockResolvedValue({ UploadId });
    await expect(
      migrateStorage({ direction: 'filesystem-to-s3', destination }, root)
    ).rejects.toThrow('Missing multipart upload ID');
    expect(fs.statSync(path.join(root, 'large.mp4')).size).toBe(16 * 1024 ** 2);
    expect(state.destroy).toHaveBeenCalledOnce();
  }
);
it.each([undefined, ''])('rejects missing multipart ETags (%s)', async (ETag) => {
  fs.writeFileSync(path.join(root, 'large.mp4'), Buffer.alloc(16 * 1024 ** 2));
  state.send.mockImplementation(async (command) =>
    command.constructor.name === 'CreateMultipartUploadCommand' ? { UploadId: 'upload' } : { ETag }
  );
  await expect(
    migrateStorage({ direction: 'filesystem-to-s3', destination }, root)
  ).rejects.toThrow('Missing multipart ETag');
  expect(state.destroy).toHaveBeenCalledOnce();
});
it('completes exact-sized multipart objects without adding an empty final part', async () => {
  const key = 'external/videos/video/dynamic/manifests/large.bin';
  state.send.mockImplementation(async (command) => {
    if (command.constructor.name === 'ListObjectsV2Command') return { Contents: [{ Key: key }] };
    if (command.constructor.name === 'GetObjectCommand')
      return { Body: Readable.from([Buffer.alloc(32 * 1024 ** 2)]) };
    if (command.constructor.name === 'CreateMultipartUploadCommand') return { UploadId: 'upload' };
    if (command.constructor.name === 'UploadPartCommand') return { ETag: 'etag' };
    return {};
  });
  await expect(migrateStorage({ direction: 's3-to-s3', source, destination }, root)).resolves.toBe(
    1
  );
  const commands = state.send.mock.calls.map(([command]) => command);
  expect(commands.filter((c) => c.constructor.name === 'UploadPartCommand')).toHaveLength(2);
  expect(
    commands.find((c) => c.constructor.name === 'CreateMultipartUploadCommand').input.CacheControl
  ).toBe('no-store');
});
it('copies non-Buffer chunks, skips directory markers and applies dynamic cache policy', async () => {
  state.send.mockImplementation(async (command) => {
    if (command.constructor.name === 'ListObjectsV2Command')
      return {
        Contents: [
          {},
          { Key: '' },
          { Key: 'external/videos/' },
          { Key: 'external/videos/video/dynamic/manifests/current.m3u8', Size: 1 },
        ],
      };
    if (command.constructor.name === 'GetObjectCommand')
      return { Body: Readable.from([new Uint8Array([1])]) };
    return {};
  });
  await expect(migrateStorage({ direction: 's3-to-s3', source, destination }, root)).resolves.toBe(
    1
  );
  const put = state.send.mock.calls.find(([c]) => c.constructor.name === 'PutObjectCommand')![0];
  expect(put.input.CacheControl).toBe('no-store');
  expect(put.input.ContentType).toBe('application/vnd.apple.mpegurl');
});
it('handles empty listings and no configured copy operation without writing', async () => {
  state.send.mockResolvedValue({});
  await expect(migrateStorage({ direction: 's3-to-filesystem', source }, root)).resolves.toBe(0);
  await expect(migrateStorage({} as never, root)).resolves.toBe(0);
});
it('ignores special local entries rather than following them', async () => {
  vi.spyOn(fs.promises, 'readdir').mockResolvedValue([
    { name: 'link', isDirectory: () => false, isFile: () => false },
  ] as never);
  await expect(migrateStorage({ direction: 'filesystem-to-s3', destination }, root)).resolves.toBe(
    0
  );
  expect(state.send).not.toHaveBeenCalled();
});
it('rejects objects with no response body', async () => {
  state.send.mockImplementation(async (c) =>
    c.constructor.name === 'ListObjectsV2Command'
      ? { Contents: [{ Key: 'external/videos/video/a.ts' }] }
      : {}
  );
  await expect(migrateStorage({ direction: 's3-to-filesystem', source }, root)).rejects.toThrow(
    'Missing video object body'
  );
  expect(state.destroy).toHaveBeenCalledOnce();
});
it.each([undefined, ''])(
  'rejects truncated pages without a usable cursor (%s)',
  async (NextContinuationToken) => {
    state.send.mockResolvedValue({ IsTruncated: true, NextContinuationToken });
    await expect(migrateStorage({ direction: 's3-to-filesystem', source }, root)).rejects.toThrow(
      'Missing S3 continuation token'
    );
  }
);
it.each([
  'video//a',
  'video/./a',
  'video/../a',
  'video/a\\b',
  'video/a:b',
  'video/a' + String.fromCharCode(0),
])('rejects an unsafe object path %s before fetching or writing', async (name) => {
  state.send.mockResolvedValue({ Contents: [{ Key: 'external/videos/' + name }] });
  await expect(migrateStorage({ direction: 's3-to-filesystem', source }, root)).rejects.toThrow(
    'Invalid video object path'
  );
  expect(state.send).toHaveBeenCalledOnce();
});
it('refuses symbolic-link destinations and preserves non-missing filesystem errors', async () => {
  const stat = vi
    .spyOn(fs.promises, 'lstat')
    .mockResolvedValue({ isSymbolicLink: () => true } as never);
  await expect(migrateStorage({ direction: 's3-to-filesystem', source }, root)).rejects.toThrow(
    'symbolic link'
  );
  stat.mockRejectedValue(new Error('permission denied'));
  await expect(migrateStorage({ direction: 's3-to-filesystem', source }, root)).rejects.toThrow(
    'permission denied'
  );
});
