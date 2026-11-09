import { operationalForPath, writeRecovery } from '@/database/recovery.js';
import { OperationalDatabase } from '@/database/operational.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AsyncResource } from 'node:async_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Config } from '@/config/index.js';
import { NodeSettingsSchema } from '@/config/schema.js';
import { withSettingsChange } from '@/utils/settings-change.js';
import {
  readCdnJournal,
  writeCdnJournal,
  hasPendingCdn,
  cdnStatus,
  publicAddressOf,
  type CdnJournal,
} from '@/utils/cdn-journal.js';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-cdn-state-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});
const initial = () =>
  NodeSettingsSchema.parse({
    username: 'user',
    password: 'password',
    nodeListeningPort: 9090,
    databaseConfig: { databaseDialect: 'sqlite' },
    storageConfig: { storageMode: 'filesystem' },
  });
function worker(file: string) {
  return Object.assign(Object.create(Config.prototype), {
    _nodeSettings: initial(),
    _paths: { nodeSettingsPath: file },
  }) as Config;
}
const record = (): CdnJournal => ({
  version: 1,
  originals: {},
  current: {
    id: '11111111-1111-4111-8111-111111111111',
    targetEnabled: true,
    stage: 'provider',
    source: null,
    target: { email: 'private-email', zone: 'zone', key: 'PRIVATE_KEY' },
    publicAddress: {
      publicNodeProtocol: 'https',
      publicNodeAddress: 'example.com',
      publicNodePort: 443,
    },
    originalAddress: {
      publicNodeProtocol: 'http',
      publicNodeAddress: 'localhost',
      publicNodePort: 9090,
    },
    tunnelName: 'managed',
    storageIdentity: 'filesystem',
  },
});

describe('settings concurrency and durable CDN state', () => {
  it('merges an unrelated stale worker patch without losing address, backup or recovery state', () => {
    const file = path.join(directory, 'settings.json');
    fs.writeFileSync(file, JSON.stringify(initial()));
    const first = worker(file),
      second = worker(file);
    first.updateNodeSettings({
      publicNodeProtocol: 'https',
      publicNodeAddress: 'example.com',
      publicNodePort: 443,
      isCloudflareCdnEnabled: true,
      cloudflareAddressMigrationPending: true,
      cloudflarePublicAddressBackup: {
        publicNodeProtocol: 'http',
        publicNodeAddress: 'localhost',
        publicNodePort: 9090,
      },
    });
    second.updateNodeSettings({ nodeHeadline: 'Concurrent identity change' });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({
      nodeHeadline: 'Concurrent identity change',
      isCloudflareCdnEnabled: true,
      cloudflareAddressMigrationPending: true,
      publicNodeAddress: 'example.com',
      cloudflarePublicAddressBackup: { publicNodeAddress: 'localhost' },
    });
  });
  it('shares a live enclosing writer lock but does not inherit ownership after it has closed', async () => {
    const file = path.join(directory, 'settings.json');
    fs.writeFileSync(file, JSON.stringify(initial()));
    const config = worker(file);
    let later!: () => void;
    await withSettingsChange(file, async () => {
      config.updateNodeSettings({ nodeHeadline: 'Locked patch' });
      later = AsyncResource.bind(() =>
        config.updateNodeSettings({ nodeHeadline: 'Stale callback' })
      );
    });
    await withSettingsChange(file, async () => {
      expect(later).toThrow('in progress');
    });
    later();
    expect(config.nodeSettings.nodeHeadline).toBe('Stale callback');
  });
  it('keeps the previous document and cache if persistence fails', () => {
    const file = path.join(directory, 'settings.json');
    fs.writeFileSync(file, JSON.stringify(initial()));
    const config = worker(file);
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('disk failure');
    });
    expect(() => config.updateNodeSettings({ nodeHeadline: 'Lost patch' })).toThrow('disk failure');
    expect(config.nodeSettings.nodeHeadline).toBe(initial().nodeHeadline);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).nodeHeadline).toBe(initial().nodeHeadline);
  });
  it('treats missing journals as empty and projects only safe transition status', async () => {
    const file = path.join(directory, 'settings.json');
    expect(await readCdnJournal(file)).toEqual({ version: 1, current: null, originals: {} });
    expect(await cdnStatus(file)).toBeNull();
    expect(await hasPendingCdn(file)).toBe(false);
    await writeCdnJournal(file, record());
    expect(await hasPendingCdn(file)).toBe(true);
    expect(await cdnStatus(file)).toEqual({
      id: record().current!.id,
      targetEnabled: true,
      stage: 'provider',
    });
    expect(JSON.stringify(await cdnStatus(file))).not.toContain('PRIVATE');
    const completed = record();
    completed.current!.stage = 'complete';
    await writeCdnJournal(file, completed);
    expect(await hasPendingCdn(file)).toBe(false);
    expect(publicAddressOf(completed.current!.publicAddress)).toEqual(
      completed.current!.publicAddress
    );
  });
  it.each(['{invalid', JSON.stringify({ version: 2 })])(
    'fails closed on corrupt journals %s',
    async (contents) => {
      const file = path.join(directory, 'settings.json');
      await writeRecovery(file, 'cdn', contents);
      await expect(readCdnJournal(file)).rejects.toThrow('Repair the recovery journal');
    }
  );
  it('retains committed recovery state when a database write fails', async () => {
    const file = path.join(directory, 'settings.json');
    await writeCdnJournal(file, record());
    const write = vi
      .spyOn(OperationalDatabase.prototype, 'query')
      .mockRejectedValueOnce(new Error('cannot commit'));
    await expect(writeCdnJournal(file, { ...record(), current: null })).rejects.toThrow(
      'cannot commit'
    );
    write.mockRestore();
    expect((await readCdnJournal(file)).current).not.toBeNull();
  });
});

import { rewindCdnAfterRestart } from '@/utils/cdn-journal.js';

it.each(['provider', 'settings', 'media', 'purge', 'tunnel', 'complete'] as const)(
  're-arms media and final invalidation after restart from %s',
  async (stage) => {
    const file = path.join(directory, 'settings.json');
    const state = record();
    state.current!.stage = stage;
    await writeCdnJournal(file, state);
    await rewindCdnAfterRestart(file);
    expect((await readCdnJournal(file)).current!.stage).toBe(
      stage === 'purge' || stage === 'tunnel' ? 'media' : stage
    );
  }
);
it('does not invent recovery during an ordinary startup', async () => {
  const file = path.join(directory, 'settings.json');
  await rewindCdnAfterRestart(file);
  const db = operationalForPath(file);
  try {
    expect(await db.query('SELECT * FROM node_recovery')).toEqual([]);
  } finally {
    await db.close();
  }
});

it('persists name and headline independently across reloads', () => {
  const file = path.join(directory, 'identity-settings.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ ...initial(), nodeName: 'Existing name', nodeHeadline: 'Existing headline' })
  );
  const config = worker(file);
  config.reloadNodeSettings(true);
  config.updateNodeSettings({ nodeName: 'New name' });
  config.reloadNodeSettings(true);
  expect(config.nodeSettings.nodeName).toBe('New name');
  expect(config.nodeSettings.nodeHeadline).toBe('Existing headline');
  config.updateNodeSettings({ nodeHeadline: 'New headline' });
  config.reloadNodeSettings(true);
  expect(config.nodeSettings.nodeName).toBe('New name');
  expect(config.nodeSettings.nodeHeadline).toBe('New headline');
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({
    nodeName: 'New name',
    nodeHeadline: 'New headline',
  });
});
