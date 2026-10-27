import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBackup, restoreBackup } from '@/database/backup.js';

const state = vi.hoisted(() => ({
  data: {} as Record<string, Record<string, unknown>[]>,
  inserted: [] as unknown[],
  sequences: 0,
  closed: 0,
  columns: [
    { column_name: 'id', column_default: 'nextval(sequence)' },
    { column_name: 'title', column_default: null },
    { column_name: 'is_published', column_default: 'false' },
  ] as { column_name: string; column_default: string | null }[],
  unsafePath: undefined as string | undefined,
}));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdtemp: (prefix: string) =>
      state.unsafePath ? Promise.resolve(state.unsafePath) : actual.mkdtemp(prefix),
  };
});
vi.mock('postgres', () => ({
  default: () => {
    const sql = {
      async begin(first: unknown, second?: (value: typeof sql) => Promise<unknown>) {
        return typeof first === 'function' ? first(sql) : second!(sql);
      },
      async end() {
        state.closed++;
      },
      json(value: unknown) {
        return { value };
      },
      unsafe(query: string, parameters?: unknown[]) {
        const result = Promise.resolve(query.startsWith('SELECT column_name') ? state.columns : []);
        if (query.startsWith('INSERT')) state.inserted.push(parameters?.[0]);
        if (query.startsWith('SELECT setval')) state.sequences++;
        return Object.assign(result, {
          async *cursor(_limit: number) {
            const name = query.match(/FROM "([a-z]+)"/)?.[1] ?? '';
            yield state.data[name] ?? [];
          },
        });
      },
    };
    return sql;
  },
}));
const names = [
  'videos',
  'comments',
  'videoreports',
  'commentreports',
  'videoreportsarchives',
  'commentreportsarchives',
  'livechatmessages',
  'cryptowalletaddresses',
  'links',
];
const fixtures: string[] = [];
beforeEach(() => {
  state.data = {};
  state.inserted = [];
  state.closed = 0;
  state.sequences = 0;
  state.unsafePath = undefined;
  state.columns = [
    { column_name: 'id', column_default: 'nextval(sequence)' },
    { column_name: 'title', column_default: null },
    { column_name: 'is_published', column_default: 'false' },
  ];
});
afterEach(async () => {
  state.unsafePath = undefined;
  for (const dir of fixtures.splice(0)) {
    if (
      path.dirname(dir) !== path.resolve(tmpdir()) ||
      !path.basename(dir).startsWith('moartube-backup-contract-')
    )
      throw new Error('Unexpected fixture');
    await rm(dir, { recursive: true, force: true });
  }
});
async function input(rows: unknown[], name = 'videos') {
  const dir = await mkdtemp(path.join(tmpdir(), 'moartube-backup-contract-'));
  fixtures.push(dir);
  const file = path.join(dir, 'input.json');
  await writeFile(
    file,
    JSON.stringify(
      names.map((tableName) => ({
        tableName: tableName === 'videos' ? name : tableName,
        rows: tableName === 'videos' ? rows : [],
      }))
    )
  );
  return file;
}
describe('backup provider contracts and failure cleanup', () => {
  it('uses cursor snapshots, bounded insert groups, and sequence maintenance for PostgreSQL', async () => {
    state.data['videos'] = Array.from({ length: 101 }, (_, index) =>
      index % 2 ? { title: String(index) } : { title: String(index), is_published: true }
    );
    const backup = await createBackup({ dialect: 'postgres', postgresUrl: 'postgres://test' });
    try {
      expect(JSON.parse(await readFile(backup.file, 'utf8'))[0].rows).toHaveLength(101);
      await restoreBackup(backup.file, { dialect: 'postgres', postgresUrl: 'postgres://test' });
      expect(state.inserted.length).toBe(3);
      expect(state.sequences).toBe(9);
      expect(state.closed).toBe(2);
    } finally {
      await backup.dispose();
    }
  });
  it.each([{}, { unknown: 1 }, { 'invalid-name': 1 }])(
    'rejects invalid imported columns: %j',
    async (row) => {
      if ('invalid-name' in row)
        state.columns.push({ column_name: 'invalid-name', column_default: null });
      const file = await input([row]);
      await expect(
        restoreBackup(file, { dialect: 'postgres', postgresUrl: 'postgres://test' })
      ).rejects.toThrow();
      expect(state.closed).toBe(1);
    }
  );
  it('rejects oversized snapshot rows and closes the PostgreSQL connection', async () => {
    state.data['videos'] = [{ title: 'x'.repeat(1024 ** 2 + 1) }];
    await expect(
      createBackup({ dialect: 'postgres', postgresUrl: 'postgres://test' })
    ).rejects.toThrow('limit');
    expect(state.closed).toBe(1);
  });
  it.each(['unknown', 'comments'])('rejects unknown or duplicate table names: %s', async (name) => {
    const file = await input([], name);
    await expect(
      restoreBackup(file, { dialect: 'postgres', postgresUrl: 'postgres://test' })
    ).rejects.toThrow('tables');
  });
  it.each([false, true])(
    'refuses to recursively delete an unexpected temporary path (wrong parent=%s)',
    async (parent) => {
      state.unsafePath = parent
        ? path.join(tmpdir(), '..', 'not-owned')
        : path.join(tmpdir(), 'not-owned');
      await expect(
        createBackup({
          dialect: 'sqlite',
          sqlitePath: path.join(tmpdir(), 'moartube-definitely-missing.sqlite'),
        })
      ).rejects.toThrow('Unexpected backup path');
    }
  );
});
