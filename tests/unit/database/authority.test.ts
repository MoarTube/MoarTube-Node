import Fastify from 'fastify';
import { gunzipSync } from 'node:zlib';
import { SettingsController } from '@/controllers/settings.js';
import { compressTextResponse } from '@/utils/http-compression.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import SQLite from 'better-sqlite3';
import postgres from 'postgres';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ config: undefined as any }));
vi.mock('@/config/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/index.js')>()),
  getConfig: () => state.config,
}));
import { OperationalDatabase, operationalConfig } from '@/database/operational.js';
import { importLegacyOperationalState } from '@/database/legacy-operational.js';
import { assertDatabaseIdle } from '@/database/switch.js';
import { purgeOutbox } from '@/utils/purge-outbox.js';
import { withSettingsChange, withSettingsWrite } from '@/utils/settings-change.js';
import {
  beginRemoteWrite,
  finishRemoteWrite,
  withDistributionTransition,
  withMediaWrite,
} from '@/utils/distribution-admission.js';
import { readCdnJournal, writeCdnJournal } from '@/utils/cdn-journal.js';
import { Config } from '@/config/index.js';
import { SettingsService } from '@/services/settings.js';
import { StreamCleanupQueue } from '@/utils/stream-cleanup.js';
import { createBackup, restoreBackup } from '@/database/backup.js';

async function fixture(dialect: 'sqlite' | 'postgres') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-authority-'));
  const file = path.join(root, 'settings.json');
  const databaseName = 'moartube_test_' + randomUUID().replaceAll('-', '');
  const admin =
    dialect === 'postgres'
      ? postgres('postgres://postgres:postgres@localhost:5432/postgres', {
          max: 1,
          connect_timeout: 5,
          onnotice: () => {},
        })
      : undefined;
  try {
    await admin?.unsafe(`CREATE DATABASE "${databaseName}"`);
    const config: any = {
      paths: { nodeSettingsPath: file, databaseFilePath: path.join(root, 'db/node_db.sqlite') },
      nodeSettings: {
        databaseConfig:
          dialect === 'sqlite'
            ? { databaseDialect: 'sqlite' }
            : {
                databaseDialect: 'postgres',
                postgresConfig: {
                  host: 'localhost',
                  port: 5432,
                  username: 'postgres',
                  password: 'postgres',
                  databaseName,
                },
              },
      },
      reloadNodeSettings() {},
      updateNodeSettings: vi.fn((patch: object) => {
        Object.assign(config.nodeSettings, patch);
        fs.writeFileSync(file, JSON.stringify(config.nodeSettings));
      }),
    };
    fs.writeFileSync(file, JSON.stringify(config.nodeSettings));
    const selected = operationalConfig(config);
    const db = new OperationalDatabase(selected);
    await db.query(
      'CREATE TABLE videos (id INTEGER PRIMARY KEY, video_id TEXT, is_importing BOOLEAN DEFAULT FALSE, is_publishing BOOLEAN DEFAULT FALSE, is_streaming BOOLEAN DEFAULT FALSE)'
    );
    state.config = config;
    return {
      root,
      file,
      config,
      selected,
      db,
      async close() {
        await db.close();
        if (admin) {
          if (!/^moartube_test_[a-f0-9]{32}$/.test(databaseName))
            throw new Error('Invalid fixture database');
          try {
            await admin.unsafe(`DROP DATABASE "${databaseName}"`);
          } finally {
            await admin.end();
          }
        }
        fs.rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await admin?.end();
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

it.each(['sqlite', 'postgres'] as const)(
  '%s stores purge tokens, retries, credentials and remote activity in the selected database',
  async (dialect) => {
    const f = await fixture(dialect);
    try {
      if (dialect === 'postgres') {
        fs.mkdirSync(path.dirname(f.config.paths.databaseFilePath), { recursive: true });
        fs.writeFileSync(f.config.paths.databaseFilePath, 'must never open SQLite');
        for (const suffix of [
          '.purges.sqlite',
          '.remote-writes.sqlite',
          '.change-lock.sqlite',
          '.media-lock.sqlite',
        ])
          fs.writeFileSync(f.file + suffix, 'must never open SQLite');
      }
      const queue = purgeOutbox(f.selected);
      try {
        await queue.enqueue('zone', ['url'], { zone: 'zone', email: 'email', key: 'secret' });
        const first = await queue.snapshot('zone');
        await queue.enqueue('zone', ['url']);
        await queue.acknowledge('zone', first);
        expect(await queue.snapshot('zone')).toHaveLength(1);
        await queue.defer('zone', 500);
        await queue.defer('zone', 100);
        expect(await queue.notBefore('zone')).toBe(500);
        expect(await queue.pendingCredentials()).toEqual([
          { zone: 'zone', email: 'email', key: 'secret' },
        ]);
        await queue.acknowledge('zone', await queue.snapshot('zone'));
        expect(await queue.pendingCredentials()).toEqual([]);
      } finally {
        await queue.close();
      }
      await beginRemoteWrite('video', 'activity');
      await expect(beginRemoteWrite('other', 'activity')).rejects.toThrow(/another video/);
      await expect(withDistributionTransition(async () => true)).rejects.toThrow(
        /direct storage writes/
      );
      await finishRemoteWrite('video', 'activity');
      await expect(beginRemoteWrite('video', 'activity')).rejects.toThrow(/already finished/);
      await withDistributionTransition(async () => true);
      expect((await f.db.query('SELECT video,active FROM node_remote_writes'))[0]).toMatchObject({
        video: 'video',
        active: 0,
      });
      if (dialect === 'postgres')
        expect(fs.readFileSync(f.config.paths.databaseFilePath, 'utf8')).toBe(
          'must never open SQLite'
        );
      else expect(fs.existsSync(f.file + '.purges.sqlite')).toBe(false);
    } finally {
      await f.close();
    }
  }
);

it.each(['sqlite', 'postgres'] as const)(
  '%s rejects competing settings owners and database changes during real media writes',
  async (dialect) => {
    const f = await fixture(dialect);
    try {
      await withSettingsChange(f.file, async () => {
        await expect(withSettingsChange(f.file, async () => true)).rejects.toThrow(/in progress/);
        expect(withSettingsWrite(f.file, () => 42)).toBe(42);
      });
      await withMediaWrite(async () => {
        await expect(withDistributionTransition(async () => true)).rejects.toThrow(
          /active uploads|in progress/
        );
      });
      await expect(withDistributionTransition(async () => true)).resolves.toBe(true);
    } finally {
      await f.close();
    }
  }
);

it.each(['sqlite', 'postgres'] as const)(
  '%s denies switching while importing, publishing or streaming without changing configuration',
  async (dialect) => {
    const f = await fixture(dialect);
    try {
      const service = Object.assign(Object.create(SettingsService.prototype), {
        logger: { info: vi.fn() },
      }) as SettingsService;
      for (const flag of ['is_importing', 'is_publishing', 'is_streaming']) {
        await f.db.query(`INSERT INTO videos (id,video_id,${flag}) VALUES (1,'video',TRUE)`);
        await expect(service.updateDatabaseConfig({ databaseDialect: 'sqlite' })).rejects.toThrow(
          /Stop or finish all imports/
        );
        expect(f.config.updateNodeSettings).not.toHaveBeenCalled();
        await f.db.query('DELETE FROM videos');
      }
      await expect(assertDatabaseIdle(f.selected)).resolves.toBeUndefined();
    } finally {
      await f.close();
    }
  }
);

it.each(['sqlite', 'postgres'] as const)(
  '%s preserves legacy pending work once on upgrade and stores recovery in the selected database',
  async (dialect) => {
    const f = await fixture(dialect);
    try {
      const old = new SQLite(f.file + '.purges.sqlite');
      old.exec(
        "CREATE TABLE purges(zone TEXT,target TEXT,token TEXT); INSERT INTO purges VALUES ('zone','url','old-token')"
      );
      old.close();
      const writes = new SQLite(f.file + '.remote-writes.sqlite');
      writes.exec(
        "CREATE TABLE writes(id TEXT,video TEXT,active INTEGER,finished INTEGER); INSERT INTO writes VALUES ('id','video',1,NULL)"
      );
      writes.close();
      const journal = { version: 1 as const, current: null, originals: {} };
      fs.writeFileSync(f.file + '.cdn-private.json', JSON.stringify(journal));
      await importLegacyOperationalState(f.file, f.selected);
      expect(fs.existsSync(f.file + '.purges.sqlite')).toBe(false);
      expect(
        fs
          .readdirSync(f.root)
          .some((name) => name.startsWith('settings.json.purges.sqlite.migrated-'))
      ).toBe(true);
      expect(await f.db.query('SELECT token FROM node_purges')).toEqual([{ token: 'old-token' }]);
      expect(await readCdnJournal(f.file)).toEqual(journal);
      fs.writeFileSync(f.file + '.purges.sqlite', 'corrupt archive no longer used');
      await importLegacyOperationalState(f.file, f.selected);
      await writeCdnJournal(f.file, journal);
      expect(await f.db.query('SELECT key FROM node_recovery')).toEqual([{ key: 'cdn' }]);
      await expect(assertDatabaseIdle(f.selected)).rejects.toThrow(
        /imports|publishing|uploads|streams/
      );
    } finally {
      await f.close();
    }
  }
);

it.each(['sqlite', 'postgres'] as const)(
  '%s includes durable operational state and string activity ids in backups',
  async (dialect) => {
    const f = await fixture(dialect);
    let snapshot: Awaited<ReturnType<typeof createBackup>> | undefined;
    try {
      for (const table of [
        'comments',
        'videoreports',
        'commentreports',
        'videoreportsarchives',
        'commentreportsarchives',
        'livechatmessages',
        'cryptowalletaddresses',
        'links',
      ])
        await f.db.query(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, value TEXT)`);
      await f.db.query("INSERT INTO node_remote_writes VALUES ('activity-id','video',0,100)");
      const config =
        f.selected.dialect === 'sqlite'
          ? { dialect: 'sqlite' as const, sqlitePath: f.selected.filepath }
          : { dialect: 'postgres' as const, postgresUrl: f.selected.connectionString };
      snapshot = await createBackup(config);
      await f.db.query('DELETE FROM node_remote_writes');
      await restoreBackup(snapshot.file, config);
      expect((await f.db.query('SELECT id,video FROM node_remote_writes'))[0]).toEqual({
        id: 'activity-id',
        video: 'video',
      });
    } finally {
      await snapshot?.dispose();
      await f.close();
    }
  }
);

it('requires a restart after selection changes instead of allowing mixed database connections', () => {
  const original = { databaseDialect: 'sqlite' };
  const config = Object.assign(Object.create(Config.prototype), {
    _runningDatabaseConfig: JSON.stringify(original),
    _nodeSettings: { databaseConfig: original },
  }) as Config;
  expect(config.nodeSettings.databaseConfig).toEqual(original);
  (config as any)._nodeSettings.databaseConfig = { databaseDialect: 'postgres' };
  expect(() => config.nodeSettings).toThrow(/Restart MoarTube Node/);
});

it.each(['sqlite', 'postgres'] as const)(
  '%s recovers a stream cleanup from the database after the original worker stops',
  async (dialect) => {
    const f = await fixture(dialect);
    const original = new StreamCleanupQueue(f.file + '.stream-cleanup', vi.fn(), vi.fn());
    const performed = vi.fn(async () => {}),
      failed = vi.fn();
    const replacement = new StreamCleanupQueue(f.file + '.stream-cleanup', performed, failed);
    try {
      const job = {
        videoId: 'video',
        generation: 'run',
        deadline: Date.now() + 60000,
        storageConfig: { storageMode: 'filesystem' as const },
        videosDirectory: f.root,
      };
      await original.enqueue(job);
      original.close();
      job.deadline = Date.now() - 1;
      await f.db.query('UPDATE node_recovery SET value=? WHERE key=?', [
        JSON.stringify(job),
        'cleanup:video-run',
      ]);
      await replacement.recover();
      await vi.waitFor(async () =>
        expect(
          await f.db.query("SELECT key FROM node_recovery WHERE key LIKE 'cleanup:%'")
        ).toEqual([])
      );
      expect(performed).toHaveBeenCalledOnce();
      expect(failed).not.toHaveBeenCalled();
      expect(fs.existsSync(f.file + '.stream-cleanup')).toBe(false);
    } finally {
      original.close();
      replacement.close();
      await f.close();
    }
  }
);

it('uses the same PostgreSQL admission lock across different local data directories', async () => {
  const f = await fixture('postgres');
  try {
    const second = path.join(f.root, 'another-settings.json');
    fs.copyFileSync(f.file, second);
    await withSettingsChange(f.file, async () => {
      await expect(withSettingsChange(second, async () => true)).rejects.toThrow('in progress');
    });
  } finally {
    await f.close();
  }
});

it('accepts an idle database selection without migrating catalog rows', async () => {
  const f = await fixture('sqlite');
  try {
    await f.db.query("INSERT INTO videos (id,video_id) VALUES (1,'existing')");
    const service = Object.assign(Object.create(SettingsService.prototype), {
      logger: { info: vi.fn() },
    }) as SettingsService;
    await service.updateDatabaseConfig({ databaseDialect: 'sqlite' });
    expect(f.config.updateNodeSettings).toHaveBeenCalledWith({
      databaseConfig: { databaseDialect: 'sqlite' },
    });
    expect(await f.db.query('SELECT video_id FROM videos')).toEqual([{ video_id: 'existing' }]);
  } finally {
    await f.close();
  }
});

it('does not replay archived legacy activity when a different database is selected', async () => {
  const source = await fixture('sqlite');
  const target = await fixture('postgres');
  try {
    const legacy = new SQLite(source.file + '.remote-writes.sqlite');
    legacy.exec(
      "CREATE TABLE writes(id TEXT,video TEXT,active INTEGER,finished INTEGER); INSERT INTO writes VALUES ('old','video',1,NULL)"
    );
    legacy.close();
    await importLegacyOperationalState(source.file, source.selected);
    await source.db.query('DELETE FROM node_remote_writes');
    fs.writeFileSync(source.file, JSON.stringify(target.config.nodeSettings));
    await importLegacyOperationalState(source.file, target.selected);
    expect(await target.db.query('SELECT id FROM node_remote_writes')).toEqual([]);
  } finally {
    await source.close();
    await target.close();
  }
});

it.each(['identity', 'gzip'])(
  'keeps settings intact through compressed HTTP responses (%s)',
  async (encoding) => {
    const f = await fixture('sqlite');
    const app = Fastify();
    const nodeSettings = {
      publicNodeAddress: 'localhost',
      publicNodePort: 9090,
      publicNodeProtocol: 'http',
      nodeAbout: 'text'.repeat(1024),
    };
    const controller = new SettingsController(
      { getNodeSettings: () => nodeSettings, getVersion: () => '1.1.0' } as never,
      {} as never,
      {} as never,
      {} as never
    );
    app.addHook('onSend', compressTextResponse);
    app.get('/settings', controller.getSettings);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/settings',
        headers: { 'accept-encoding': encoding },
      });
      expect(response.statusCode).toBe(200);
      const body =
        response.headers['content-encoding'] === 'gzip'
          ? gunzipSync(response.rawPayload).toString('utf8')
          : response.body;
      expect(JSON.parse(body)).toMatchObject({ isError: false, nodeSettings });
    } finally {
      await app.close();
      await f.close();
    }
  }
);

it('rejects invalid operational dialects and use before PostgreSQL initialization', async () => {
  expect(() => new OperationalDatabase({ dialect: 'invalid' } as never)).toThrow('Invalid operational database selection');
  const db = new OperationalDatabase({ dialect: 'postgres', connectionString: 'postgres://unused' });
  expect(() => (db as any).postgresClient()).toThrow('not initialized');
  await db.close();
});

it('supports parameter-free PostgreSQL batches and synchronous settings patches without SQLite', async () => {
  const f = await fixture('postgres');
  try {
    await f.db.batch([{ sql: 'DELETE FROM node_purges' }]);
    expect(withSettingsWrite(f.file, () => 'saved')).toBe('saved');
    expect(() => withSettingsWrite(f.file, () => { throw new Error('write failed'); })).toThrow('write failed');
    expect(fs.existsSync(f.file + '.writer-lock')).toBe(false);
    expect(fs.existsSync(f.file + '.change-lock.sqlite')).toBe(false);
  } finally { await f.close(); }
});

it('blocks a database switch while invalidations or recovery jobs are pending', async () => {
  const f = await fixture('sqlite');
  try {
    await f.db.query("INSERT INTO node_purges VALUES ('zone','target','token')");
    await expect(assertDatabaseIdle(f.selected)).rejects.toThrow('invalidations');
    await f.db.query('DELETE FROM node_purges');
    await f.db.query("INSERT INTO node_recovery VALUES ('other','{}')");
    await f.db.query("INSERT INTO node_recovery VALUES ('cdn','{}')");
    await expect(assertDatabaseIdle(f.selected)).resolves.toBeUndefined();
    await f.db.query("UPDATE node_recovery SET value=? WHERE key='cdn'", [JSON.stringify({ current: { stage: 'complete' } })]);
    await expect(assertDatabaseIdle(f.selected)).resolves.toBeUndefined();
    await f.db.query("UPDATE node_recovery SET value=? WHERE key='cdn'", [JSON.stringify({ current: { stage: 'pending' } })]);
    await expect(assertDatabaseIdle(f.selected)).rejects.toThrow('CDN transition');
    await f.db.query("DELETE FROM node_recovery WHERE key='cdn'");
    await f.db.query("INSERT INTO node_recovery VALUES ('cleanup:video-run','{}')");
    await expect(assertDatabaseIdle(f.selected)).rejects.toThrow('stream cleanup');
  } finally { await f.close(); }
});

it('does not save a database selection during a pending CDN address migration', async () => {
  const f = await fixture('sqlite');
  try {
    f.config.nodeSettings.cloudflareAddressMigrationPending = true;
    const service = Object.assign(Object.create(SettingsService.prototype), { logger: { info: vi.fn() } }) as SettingsService;
    await expect(service.updateDatabaseConfig({ databaseDialect: 'sqlite' })).rejects.toThrow('pending CDN');
    expect(f.config.updateNodeSettings).not.toHaveBeenCalled();
  } finally { await f.close(); }
});

it.each(['valid', 'invalid-video', 'invalid-generation'])('imports legacy cleanup journals safely (%s)', async mode => {
  const f = await fixture('sqlite');
  try {
    const directory = f.file + '.stream-cleanup';
    fs.mkdirSync(directory);
    const job = { videoId: mode === 'invalid-video' ? '../bad' : 'video', generation: mode === 'invalid-generation' ? '../bad' : 'run' };
    fs.writeFileSync(path.join(directory, 'job.json'), JSON.stringify(job));
    fs.writeFileSync(path.join(directory, 'ignored.txt'), 'ignored');
    if (mode === 'valid') {
      await importLegacyOperationalState(f.file, f.selected);
      expect(await f.db.query("SELECT value FROM node_recovery WHERE key='cleanup:video-run'")).toEqual([{ value: JSON.stringify(job) }]);
      expect(fs.existsSync(directory)).toBe(false);
    } else {
      await expect(importLegacyOperationalState(f.file, f.selected)).rejects.toThrow('Invalid legacy stream cleanup');
      expect(fs.existsSync(directory)).toBe(true);
      expect(await f.db.query('SELECT * FROM node_operational_meta')).toEqual([]);
    }
  } finally { await f.close(); }
});

it('rejects an archive path that escapes the journal parent', async () => {
  const f = await fixture('sqlite');
  const resolve = path.resolve;
  const spy = vi.spyOn(path, 'resolve').mockImplementation((...parts) => parts[0] === f.file + '.purges.sqlite' ? path.join(f.root, 'other', 'file') : resolve(...parts));
  try {
    await expect(importLegacyOperationalState(f.file, f.selected)).rejects.toThrow('Invalid legacy journal path');
  } finally { spy.mockRestore(); await f.close(); }
});

it('closes the remote-write database and releases admission after a cleanup query fails', async () => {
  const f = await fixture('sqlite');
  const query = OperationalDatabase.prototype.query;
  const spy = vi.spyOn(OperationalDatabase.prototype, 'query').mockImplementation(function (this: OperationalDatabase, sql, parameters) {
    if (sql.startsWith('DELETE FROM node_remote_writes')) return Promise.reject(new Error('cleanup failed'));
    return query.call(this, sql, parameters);
  });
  try {
    await expect(withDistributionTransition(async () => true)).rejects.toThrow('cleanup failed');
    spy.mockRestore();
    await expect(withDistributionTransition(async () => true)).resolves.toBe(true);
  } finally { spy.mockRestore(); await f.close(); }
});

it('accepts an empty database before its catalog table is provisioned', async () => {
  const f = await fixture('sqlite');
  try {
    await f.db.query('DROP TABLE videos');
    await expect(assertDatabaseIdle(f.selected)).resolves.toBeUndefined();
  } finally { await f.close(); }
});
