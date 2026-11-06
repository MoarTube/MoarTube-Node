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
    second.updateNodeSettings({ nodeName: 'Concurrent identity change' });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({
      nodeName: 'Concurrent identity change',
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
      config.updateNodeSettings({ nodeName: 'Locked patch' });
      later = AsyncResource.bind(() => config.updateNodeSettings({ nodeName: 'Stale callback' }));
    });
    await withSettingsChange(file, async () => {
      expect(later).toThrow('in progress');
    });
    later();
    expect(config.nodeSettings.nodeName).toBe('Stale callback');
  });
  it('keeps the previous document and cache if persistence fails', () => {
    const file = path.join(directory, 'settings.json');
    fs.writeFileSync(file, JSON.stringify(initial()));
    const config = worker(file);
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('disk failure');
    });
    expect(() => config.updateNodeSettings({ nodeName: 'Lost patch' })).toThrow('disk failure');
    expect(config.nodeSettings.nodeName).toBe(initial().nodeName);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).nodeName).toBe(initial().nodeName);
  });
  it('treats missing journals as empty and projects only safe transition status', () => {
    const file = path.join(directory, 'settings.json');
    expect(readCdnJournal(file)).toEqual({ version: 1, current: null, originals: {} });
    expect(cdnStatus(file)).toBeNull();
    expect(hasPendingCdn(file)).toBe(false);
    writeCdnJournal(file, record());
    expect(hasPendingCdn(file)).toBe(true);
    expect(cdnStatus(file)).toEqual({
      id: record().current!.id,
      targetEnabled: true,
      stage: 'provider',
    });
    expect(JSON.stringify(cdnStatus(file))).not.toContain('PRIVATE');
    const completed = record();
    completed.current!.stage = 'complete';
    writeCdnJournal(file, completed);
    expect(hasPendingCdn(file)).toBe(false);
    expect(publicAddressOf(completed.current!.publicAddress)).toEqual(
      completed.current!.publicAddress
    );
  });
  it.each(['{invalid', JSON.stringify({ version: 2 })])(
    'fails closed on corrupt journals %s',
    (contents) => {
      const file = path.join(directory, 'settings.json');
      fs.writeFileSync(file + '.cdn-private.json', contents);
      expect(() => readCdnJournal(file)).toThrow('Repair the recovery journal');
    }
  );
  it('cleans temporary files and retains the committed journal when rename fails', () => {
    const file = path.join(directory, 'settings.json');
    writeCdnJournal(file, record());
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('cannot commit');
    });
    expect(() => writeCdnJournal(file, { ...record(), current: null })).toThrow('cannot commit');
    rename.mockRestore();
    expect(readCdnJournal(file).current).not.toBeNull();
    expect(fs.readdirSync(directory)).toEqual(['settings.json.cdn-private.json']);
  });
});

import { rewindCdnAfterRestart } from '@/utils/cdn-journal.js';

it.each(['provider', 'settings', 'media', 'purge', 'tunnel', 'complete'] as const)(
  're-arms media and final invalidation after restart from %s',
  (stage) => {
    const file = path.join(directory, 'settings.json');
    const state = record();
    state.current!.stage = stage;
    writeCdnJournal(file, state);
    rewindCdnAfterRestart(file);
    expect(readCdnJournal(file).current!.stage).toBe(
      stage === 'purge' || stage === 'tunnel' ? 'media' : stage
    );
  }
);
it('does not invent recovery during an ordinary startup', () => {
  const file = path.join(directory, 'settings.json');
  rewindCdnAfterRestart(file);
  expect(fs.readdirSync(directory)).toEqual([]);
});
