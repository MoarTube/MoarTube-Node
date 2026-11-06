import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ config: vi.fn() }));
vi.mock('@/config/index.js', () => ({ getConfig: mocks.config }));
import { withDistributionTransition, withJobAdmission } from '@/utils/distribution-admission.js';
import { NodeSettingsSchema } from '@/config/schema.js';
import { VideosService } from '@/services/videos.js';
import { StreamsService } from '@/services/streams.js';

let directory: string;
let file: string;
let stored: Record<string, unknown>;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-distribution-admission-'));
  file = path.join(directory, 'settings.json');
  stored = {
    nodeListeningPort: 9090,
    username: 'user',
    password: 'password',
    databaseConfig: { databaseDialect: 'sqlite' },
    storageConfig: { storageMode: 'filesystem' },
    cloudflarePublicAddressBackup: {
      publicNodeProtocol: 'http',
      publicNodeAddress: 'localhost',
      publicNodePort: 9090,
    },
  };
  fs.writeFileSync(file, JSON.stringify(stored));
  const config = {
    paths: { nodeSettingsPath: file },
    nodeSettings: NodeSettingsSchema.parse(stored),
    reloadNodeSettings() {
      config.nodeSettings = NodeSettingsSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
    },
  };
  mocks.config.mockReturnValue(config);
});
afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

it('excludes all real job-start entry points while a transition holds the cross-worker gate', async () => {
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  const repository = { findById: vi.fn(), create: vi.fn(), update: vi.fn() };
  const videos = new VideosService(
    logger as never,
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  const streams = Object.create(StreamsService.prototype) as StreamsService;
  await withDistributionTransition(async () => {
    for (const operation of [
      () => videos.createVideo({ title: 'Test', description: '', tags: '' }),
      () => videos.setImporting('video123', true),
      () => videos.setPublishing('video123', true),
      () => streams.startStream('video123'),
      () => streams.startNewStream({} as never),
    ])
      await expect(operation()).rejects.toThrow(/admission is in progress/);
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    await videos.setImporting('video123', false);
    expect(repository.update).toHaveBeenCalledWith('video123', { is_importing: false });
  });
  await expect(withJobAdmission(async () => 'admitted')).resolves.toBe('admitted');
});

it('reloads a pending migration after restart and keeps both its backup and job block', async () => {
  stored.cloudflareAddressMigrationPending = true;
  fs.writeFileSync(file, JSON.stringify(stored));
  const job = vi.fn();
  await expect(withJobAdmission(job)).rejects.toThrow(/retry the CDN address migration/);
  expect(job).not.toHaveBeenCalled();
  expect(mocks.config().nodeSettings.cloudflarePublicAddressBackup).toEqual(
    stored.cloudflarePublicAddressBackup
  );
  stored.cloudflareAddressMigrationPending = false;
  fs.writeFileSync(file, JSON.stringify(stored));
  await withJobAdmission(job);
  expect(job).toHaveBeenCalledOnce();
});

it('releases admission after a job fails and accepts older configuration without migration fields', async () => {
  delete stored.cloudflarePublicAddressBackup;
  fs.writeFileSync(file, JSON.stringify(stored));
  await expect(
    withJobAdmission(async () => {
      throw new Error('Job failed');
    })
  ).rejects.toThrow('Job failed');
  await expect(withJobAdmission(async () => 'ready')).resolves.toBe('ready');
});
