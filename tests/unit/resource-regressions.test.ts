import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkPool } from '@/utils/work-pool.js';
import { sendBounded } from '@/utils/socket-budget.js';
import { transformManifest, rewriteManifestFile } from '@/utils/manifest-transform.js';
import { parseBackup } from '@/utils/backup-json.js';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    if (
      path.dirname(directory) !== path.resolve(tmpdir()) ||
      !path.basename(directory).startsWith('moartube-resource-test-')
    )
      throw new Error('Unexpected fixture');
    await rm(directory, { recursive: true, force: true });
  }
});
describe('resource failure and cleanup paths', () => {
  it('admits work FIFO, rejects excess work, and frees slots on success and failure', async () => {
    expect(() => new WorkPool(0)).toThrow();
    expect(() => new WorkPool(1.5)).toThrow();
    const pool = new WorkPool(1, 1);
    const first = await pool.acquire();
    const second = pool.run(async () => {
      throw new Error('job failed');
    });
    await expect(pool.acquire()).rejects.toThrow('queue');
    first();
    first();
    await expect(second).rejects.toThrow('job failed');
    expect(await pool.run(async () => 7)).toBe(7);
    expect(sendBounded({ readyState: 3, send: vi.fn(), close: vi.fn() }, 'ignored')).toBe(false);
  });
  it('rewrites files atomically and leaves the original when a transform fails', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'moartube-resource-test-'));
    directories.push(directory);
    const file = path.join(directory, 'manifest.m3u8');
    await writeFile(file, '#EXTM3U\nold.ts');
    await rewriteManifestFile(file, (line) => line.replace('old.ts', 'new.ts'));
    expect(await readFile(file, 'utf8')).toBe('#EXTM3U\nnew.ts\n');
    await expect(
      rewriteManifestFile(
        file,
        () => {
          throw new Error('failed transform');
        },
        true
      )
    ).rejects.toThrow('failed transform');
    expect(await readdir(directory)).toEqual(['manifest.m3u8']);
    let text = '';
    for await (const chunk of transformManifest(Readable.from(['#EXTM3U\n']))) text += chunk;
    expect(text).toBe('#EXTM3U\n');
  });
  it.each([false, true])('rejects oversized manifest lines (terminated=%s)', async (terminated) => {
    const read = async () => {
      for await (const _chunk of transformManifest(
        Readable.from([Buffer.from('x'.repeat(1024 ** 2 + 1) + (terminated ? '\n' : ''))])
      )) {
        /* consume */
      }
    };
    await expect(read()).rejects.toThrow('limit');
  });
});

describe('strict incremental JSON errors', () => {
  it.each([
    ' [ { "rows": [], "tableName": "videos" } ] ',
    '[{"tableName":"videos","rows":[{"one":1,"two":false,"three":null,"four":1e3}]}]',
  ])('accepts valid whitespace and scalar tokens: %s', async (text) => {
    const events = [];
    for await (const event of parseBackup(Readable.from([Buffer.from(text)]))) events.push(event);
    expect(events.at(-1)).toMatchObject({ kind: 'table', name: 'videos' });
  });
  it.each([
    '[{wrong:1}]',
    '[{"tableName":1,"rows":[]}]',
    '[{"tableName":null,"rows":[]}]',
    '[{"tableName":"' + 'x'.repeat(101) + '","rows":[]}]',
    '[{"tableName":"videos","unknown":[]}]',
    '[{"rows":[1],"tableName":"videos"}]',
    '[{"rows":[{"a":1',
    '[{"tableName":"videos"}]',
    '[{"rows":[]}]',
    '[{"rows":[],"tableName":"videos"},]',
    '[{"rows":[],"tableName":"videos"}]{}',
    '[{"tableName":',
  ])('rejects malformed structure before restoration: %s', async (text) => {
    await expect(
      (async () => {
        for await (const _event of parseBackup(Readable.from([Buffer.from(text)]))) {
          /* consume */
        }
      })()
    ).rejects.toThrow();
  });
  it('caps a record containing many small fields, not only individual string tokens', async () => {
    const row = Object.fromEntries(
      Array.from({ length: 15000 }, (_, index) => [String(index), 'x'.repeat(70)])
    );
    await expect(
      (async () => {
        for await (const _event of parseBackup(
          Readable.from([Buffer.from(JSON.stringify([{ rows: [row], tableName: 'videos' }]))])
        )) {
          /* consume */
        }
      })()
    ).rejects.toThrow('limit');
  });
  it('rejects an oversized token delivered as one chunk', async () => {
    await expect(
      (async () => {
        for await (const _event of parseBackup(
          Readable.from([
            Buffer.from(
              '[{"rows":[{"a":"' + 'x'.repeat(1024 ** 2 + 1) + '"}],"tableName":"videos"}]'
            ),
          ])
        )) {
          /* consume */
        }
      })()
    ).rejects.toThrow('limit');
  });
});

const reportModules = [
  () => import('@/database/repositories/reports-videos/sqlite.js'),
  () => import('@/database/repositories/reports-videos/postgres.js'),
  () => import('@/database/repositories/reports-comments/sqlite.js'),
  () => import('@/database/repositories/reports-comments/postgres.js'),
  () => import('@/database/repositories/reports-archive-videos/sqlite.js'),
  () => import('@/database/repositories/reports-archive-videos/postgres.js'),
  () => import('@/database/repositories/reports-archive-comments/sqlite.js'),
  () => import('@/database/repositories/reports-archive-comments/postgres.js'),
];
function builder(pages: Record<string, unknown>[][]) {
  const query = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then(
      resolve: (rows: Record<string, unknown>[]) => unknown,
      reject: (error: unknown) => unknown
    ) {
      return Promise.resolve(pages.shift() ?? []).then(resolve, reject);
    },
  };
  return query;
}
describe('bounded query builder contracts', () => {
  it.each(reportModules)(
    'applies moderation search and offsets for both dialects',
    async (load) => {
      const module = await load();
      const Repository = Object.values(module).find((value) => typeof value === 'function') as new (
        db: never
      ) => { findAll(options: object): Promise<unknown[]> };
      const db = builder([[{ id: 1 }]]);
      const repository = new Repository(db as never);
      expect(await repository.findAll({ limit: 101, offset: 100, search: 'spam' })).toEqual([
        { id: 1 },
      ]);
      expect(db.where).toHaveBeenCalled();
      expect(db.offset).toHaveBeenCalledWith(100);
    }
  );
  it.each([
    () => import('@/database/repositories/videos/sqlite.js'),
    () => import('@/database/repositories/videos/postgres.js'),
  ])('projects tag pages without retaining video rows', async (load) => {
    const module = await load();
    const Repository = Object.values(module).find((value) => typeof value === 'function') as new (
      db: never
    ) => {
      findTags(visible?: boolean): Promise<string[]>;
      findAll(options: object): Promise<unknown[]>;
    };
    const db = builder([
      Array.from({ length: 200 }, () => ({ tags: 'a,, b' })),
      [{ tags: 'c' }],
      [],
    ]);
    const repository = new Repository(db as never);
    expect(await repository.findTags()).toEqual(['a', 'b', 'c']);
    expect(await repository.findTags(true)).toEqual([]);
    await repository.findAll({ limit: 10, offset: 100, visibleOnly: true });
    expect(db.offset).toHaveBeenCalledWith(200);
  });
  it('applies the comment ID refresh cursor in PostgreSQL queries', async () => {
    const { CommentsRepositoryPostgres } =
      await import('@/database/repositories/comments/postgres.js');
    const db = builder([[]]);
    const repository = new CommentsRepositoryPostgres(db as never);
    expect(
      await repository.findByVideoIdWithTimestampFilter('video', 'after', 'ascending', 100, 10)
    ).toEqual([]);
    expect(db.limit).toHaveBeenCalledWith(101);
  });
  it('applies an older-comment cursor and lookahead in PostgreSQL', async () => {
    const { CommentsRepositoryPostgres } =
      await import('@/database/repositories/comments/postgres.js');
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    await new CommentsRepositoryPostgres(db as never).findByVideoIdWithTimestampFilter(
      'video',
      'before',
      'descending',
      100,
      10
    );
    expect(db.limit).toHaveBeenCalledWith(101);
  });
});
