import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  cpSync,
  symlinkSync,
  unlinkSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTestDatabase, comment } from './helpers.js';
import * as connection from '@/database/sqlite-connection.js';
import { createCommentsRepository } from '@/database/repositories/comments/index.js';

describe('reproducible comment provisioning (sqlite)', () => {
  let directory: string;
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'moartube-fresh-'));
    const result = spawnSync(
      process.execPath,
      ['scripts/ensure-migrations.mjs', '--out-root', directory],
      { cwd: resolve('.'), encoding: 'utf8' }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const folder = join(directory, 'sqlite');
    const journal = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'));
    const sql = readFileSync(join(folder, journal.entries[0].tag + '.sql'), 'utf8');
    expect(sql).not.toMatch(/CREATE (?:OR REPLACE )?(?:TRIGGER|FUNCTION)/i);
  }, 30000);
  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('provisions triggers and cache metadata from newly generated schema-only migrations', async () => {
    const database = openTestDatabase();
    try {
      // Own a separate empty connection; never reset the development database.
      const db = connection.createDatabase({ filepath: ':memory:' });
      const client = (db as typeof db & { $client: typeof database.client }).$client;
      try {
        connection.initializeDatabaseSchema({ migrationsFolder: join(directory, 'sqlite') });
        const repository = createCommentsRepository('sqlite', db);
        const parent = await repository.create(comment('a', 100));
        const child = await repository.create({
          ...comment('a', 200),
          comment_plain_text_sanitized: `&gt;&gt;00${parent.comment_id}`,
        });
        expect(await repository.getBacklinksForComments('a', [parent.comment_id])).toEqual([
          { parent_id: parent.comment_id, reply_id: child.comment_id },
        ]);
        const epoch = await repository.getCacheEpoch();
        expect(epoch).toMatch(/^[a-f0-9-]{36}$/);
        const version = await repository.getCacheVersion('a');
        await repository.delete('a', child.comment_id, 200);
        expect(await repository.getCacheChanges('a', version)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ comment_id: child.comment_id, deleted: 1 }),
          ])
        );
        connection.initializeDatabaseSchema({ migrationsFolder: join(directory, 'sqlite') });
        expect(await repository.getCacheEpoch()).toBe(epoch);
      } finally {
        client.close();
      }
    } finally {
      database.close();
    }
  });

  it('repairs missing triggers and backfills changes without changing healthy database identities', async () => {
    const database = openTestDatabase();
    try {
      const repository = createCommentsRepository('sqlite', database.db);
      const parent = await repository.create(comment('a', 100));
      const removed = await repository.create(comment('a', 150));
      const epoch = await repository.getCacheEpoch();
      database.client.exec(
        'DROP TRIGGER comment_cache_insert;DROP TRIGGER comment_cache_update;DROP TRIGGER comment_cache_delete;'
      );
      const child = await repository.create({
        ...comment('a', 200),
        comment_plain_text_sanitized: `&gt;&gt;${parent.comment_id}`,
      });
      await repository.delete('a', removed.comment_id, 150);
      connection.initializeDatabaseSchema();
      expect(await repository.getBacklinksForComments('a', [parent.comment_id])).toEqual([
        { parent_id: parent.comment_id, reply_id: child.comment_id },
      ]);
      expect(await repository.getCacheChanges('a', 0)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ comment_id: removed.comment_id, deleted: 1 }),
        ])
      );
      const repaired = await repository.getCacheEpoch();
      expect(repaired).not.toBe(epoch);
      const version = await repository.getCacheVersion('a');
      connection.initializeDatabaseSchema();
      expect(await repository.getCacheEpoch()).toBe(repaired);
      expect(await repository.getCacheVersion('a')).toBe(version);
    } finally {
      database.close();
    }
  });
  it('rolls back a failed operational repair instead of starting with partial triggers', async () => {
    const database = openTestDatabase();
    try {
      const repository = createCommentsRepository('sqlite', database.db);
      await repository.create(comment('a', 100));
      const epoch = await repository.getCacheEpoch();
      database.client.exec(
        "DROP TRIGGER comment_cache_insert;CREATE TRIGGER reject_backfill BEFORE INSERT ON comment_changes BEGIN SELECT RAISE(ABORT,'Backfill failed'); END;"
      );
      expect(() => connection.initializeDatabaseSchema()).toThrow('Backfill failed');
      expect(
        database.client
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND name='comment_cache_insert'"
          )
          .all()
      ).toHaveLength(0);
      database.client.exec('DROP TRIGGER reject_backfill');
      expect(await repository.getCacheEpoch()).toBe(epoch);
      expect(await repository.countByVideoId('a')).toBe(1);
      connection.initializeDatabaseSchema();
      expect(await repository.getCacheEpoch()).not.toBe(epoch);
    } finally {
      database.close();
    }
  });

  it('preserves existing migration history and refuses an incomplete journal', () => {
    const journal = join(directory, 'sqlite/meta/_journal.json'),
      before = readFileSync(journal, 'utf8');
    const result = spawnSync(
      process.execPath,
      ['scripts/ensure-migrations.mjs', '--out-root', directory],
      { encoding: 'utf8' }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(readFileSync(journal, 'utf8')).toBe(before);
    const broken = join(directory, 'broken');
    mkdirSync(join(broken, 'sqlite'), { recursive: true });
    writeFileSync(join(broken, 'sqlite/0000_old.sql'), 'keep');
    const rejected = spawnSync(
      process.execPath,
      ['scripts/ensure-migrations.mjs', '--out-root', broken],
      { encoding: 'utf8' }
    );
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('Incomplete migration history');
    expect(readFileSync(join(broken, 'sqlite/0000_old.sql'), 'utf8')).toBe('keep');
  });

  it('builds missing baselines and clean resets broken history before provisioning an empty database', async () => {
    const workspace = join(directory, 'build');
    mkdirSync(workspace);
    for (const name of ['src', 'scripts', 'bin', 'public', 'client'])
      cpSync(resolve(name), join(workspace, name), { recursive: true });
    for (const name of [
      'package.json',
      'tsconfig.json',
      'tsconfig.build.json',
      'tsup.config.ts',
      'drizzle.config.ts',
    ])
      if (existsSync(name)) cpSync(resolve(name), join(workspace, name));
    const modules = join(workspace, 'node_modules');
    symlinkSync(resolve('node_modules'), modules, 'junction');
    try {
      expect(existsSync(join(workspace, 'drizzle'))).toBe(false);
      const npm = join(process.execPath, '..', 'node_modules/npm/bin/npm-cli.js');
      const result = spawnSync(process.execPath, [npm, 'run', 'build'], {
        cwd: workspace,
        encoding: 'utf8',
        timeout: 45000,
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(existsSync(join(workspace, 'dist/drizzle/sqlite/meta/_journal.json'))).toBe(true);
      expect(existsSync(join(workspace, 'dist/drizzle/postgres/meta/_journal.json'))).toBe(true);
      expect(existsSync(join(workspace, 'data'))).toBe(false);
      const entry = join(workspace, 'src/provision-smoke.ts');
      writeFileSync(
        entry,
        `import {createDatabase,initializeDatabaseSchema} from './database/sqlite-connection.js';const db=createDatabase({filepath:':memory:'});initializeDatabaseSchema();console.log(JSON.stringify(db.$client.prepare("SELECT count(*) AS triggers FROM sqlite_master WHERE type='trigger' AND name LIKE 'comment_cache_%'").get()));db.$client.close();`
      );
      const { build } = await import('esbuild');
      await build({
        entryPoints: [entry],
        outfile: join(workspace, 'dist/provision-smoke.js'),
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        tsconfig: join(workspace, 'tsconfig.json'),
      });
      const smoke = spawnSync(process.execPath, [join(workspace, 'dist/provision-smoke.js')], {
        cwd: workspace,
        encoding: 'utf8',
      });
      expect(smoke.status, smoke.stdout + smoke.stderr).toBe(0);
      expect(JSON.parse(smoke.stdout)).toEqual({ triggers: 3 });

      // Exercise the actual destructive launcher only inside this owned fixture.
      // Replace the server entry with a terminating database initialization probe.
      writeFileSync(
        join(workspace, 'src/moartube-node.ts'),
        `import {mkdirSync} from 'node:fs';import {fileURLToPath} from 'node:url';import type Database from 'better-sqlite3';import {createDatabase,initializeDatabaseSchema} from './database/sqlite-connection.js';const directory=new URL('../data/db/',import.meta.url);mkdirSync(directory,{recursive:true});const db=createDatabase({filepath:fileURLToPath(new URL('node_db.sqlite',directory))});const client=(db as typeof db & {$client:Database.Database}).$client;initializeDatabaseSchema();console.log('CLEAN_BASELINE '+JSON.stringify({triggers:client.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'comment_cache_%'").get(),comments:client.prepare('SELECT count(*) AS n FROM comments').get(),identity:client.prepare("SELECT value FROM database_meta WHERE key='instance_id'").get()}));client.close();`
      );
      for (const name of ['data', 'coverage', 'dist', 'drizzle']) {
        mkdirSync(join(workspace, name), { recursive: true });
        writeFileSync(join(workspace, name, 'old'), 'discard this state');
      }
      mkdirSync(join(workspace, 'data/db'), { recursive: true });
      const oldDatabase = connection.createDatabase({
        filepath: join(workspace, 'data/db/node_db.sqlite'),
      });
      const oldClient = (
        oldDatabase as typeof oldDatabase & {
          $client: ReturnType<typeof openTestDatabase>['client'];
        }
      ).$client;
      let oldIdentity: string;
      try {
        connection.initializeDatabaseSchema({ migrationsFolder: join(directory, 'sqlite') });
        const oldRepository = createCommentsRepository('sqlite', oldDatabase);
        await oldRepository.create(comment('old-video', 100));
        oldIdentity = await oldRepository.getCacheEpoch();
      } finally {
        oldClient.close();
      }
      // Broken history must not obstruct an explicitly requested fresh start.
      writeFileSync(join(workspace, 'drizzle/sqlite/meta/_journal.json'), 'invalid old history');
      const clean = spawnSync(
        process.execPath,
        [join(workspace, 'bin/moartube-node-start'), '--clean'],
        {
          cwd: tmpdir(),
          encoding: 'utf8',
          timeout: 45000,
        }
      );
      expect(clean.status, clean.stdout + clean.stderr).toBe(0);
      expect(existsSync(join(workspace, 'data/db/node_db.sqlite'))).toBe(true);
      const baseline = JSON.parse(clean.stdout.split('CLEAN_BASELINE ')[1].trim());
      expect(baseline).toEqual({
        triggers: { n: 3 },
        comments: { n: 0 },
        identity: { value: expect.stringMatching(/^[a-f0-9-]{36}$/) },
      });
      expect(baseline.identity.value).not.toBe(oldIdentity);
      for (const name of ['data', 'coverage', 'dist', 'drizzle'])
        expect(existsSync(join(workspace, name, 'old'))).toBe(false);
      for (const dialect of ['sqlite', 'postgres']) {
        const fresh = JSON.parse(
          readFileSync(join(workspace, 'drizzle', dialect, 'meta/_journal.json'), 'utf8')
        );
        expect(fresh.entries).toHaveLength(1);
        expect(
          existsSync(join(workspace, 'dist/drizzle', dialect, fresh.entries[0].tag + '.sql'))
        ).toBe(true);
      }
    } finally {
      expect(lstatSync(modules).isSymbolicLink()).toBe(true);
      unlinkSync(modules);
    }
  }, 120000);
  it('the migration command provisions a new database and repairs it on a later run', () => {
    const file = join(directory, 'cli', 'nested', 'new.sqlite');
    const run = () =>
      spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/migrate.ts'], {
        cwd: resolve('.'),
        env: { ...process.env, DATABASE_DIALECT: 'sqlite', DATABASE_URL: file },
        encoding: 'utf8',
      });
    const first = run();
    expect(first.status, first.stdout + first.stderr).toBe(0);
    const db = connection.createDatabase({ filepath: file }),
      client = (db as typeof db & { $client: ReturnType<typeof openTestDatabase>['client'] })
        .$client;
    try {
      const epoch = client.prepare("SELECT value FROM database_meta WHERE key='instance_id'").get();
      client.exec('DROP TRIGGER comment_cache_insert');
      const repaired = run();
      expect(repaired.status, repaired.stdout + repaired.stderr).toBe(0);
      expect(
        client.prepare("SELECT value FROM database_meta WHERE key='instance_id'").get()
      ).not.toEqual(epoch);
      expect(
        client
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND name='comment_cache_insert'"
          )
          .all()
      ).toHaveLength(1);
    } finally {
      client.close();
    }
  });
});
