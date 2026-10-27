import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import SQLite from 'better-sqlite3';
import { createBackup, restoreBackup } from '@/database/backup.js';

const fixtures: string[] = [];
afterEach(async () => {
  for (const dir of fixtures.splice(0)) {
    if (
      path.dirname(dir) !== path.resolve(tmpdir()) ||
      !path.basename(dir).startsWith('moartube-backup-test-')
    )
      throw new Error('Unexpected fixture');
    await rm(dir, { recursive: true, force: true });
  }
});
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'moartube-backup-test-'));
  fixtures.push(dir);
  const sqlitePath = path.join(dir, 'data.sqlite');
  const db = new SQLite(sqlitePath);
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
  for (const name of names)
    db.exec(
      `CREATE TABLE ${name} (id INTEGER PRIMARY KEY, title TEXT NOT NULL, is_published INTEGER)`
    );
  db.prepare('INSERT INTO videos (title,is_published) VALUES (?,?)').run('🌻 original', 1);
  db.close();
  return { dir, config: { dialect: 'sqlite' as const, sqlitePath }, names };
}
describe('streamed database backups', () => {
  it('round-trips the existing JSON shape with bounded records', async () => {
    const { dir, config } = await fixture();
    const backup = await createBackup(config);
    try {
      const data = JSON.parse(await readFile(backup.file, 'utf8'));
      expect(data[0]).toEqual({
        rows: [{ title: '🌻 original', is_published: true }],
        tableName: 'videos',
      });
      const db = new SQLite(config.sqlitePath);
      db.exec('DELETE FROM videos');
      db.close();
      await restoreBackup(backup.file, config);
      const restored = new SQLite(config.sqlitePath);
      expect(restored.prepare('SELECT title,is_published FROM videos').get()).toEqual({
        title: '🌻 original',
        is_published: 1,
      });
      restored.close();
    } finally {
      await backup.dispose();
    }
    expect((await import('node:fs')).existsSync(backup.file)).toBe(false);
    expect(dir).toBeTruthy();
  });
  it('rolls back all replacement tables when an insert fails', async () => {
    const { dir, config, names } = await fixture();
    const file = path.join(dir, 'bad.json');
    await writeFile(
      file,
      JSON.stringify(
        names.map((name) => ({ tableName: name, rows: name === 'videos' ? [{ title: null }] : [] }))
      )
    );
    await expect(restoreBackup(file, config)).rejects.toThrow();
    const db = new SQLite(config.sqlitePath);
    expect(db.prepare('SELECT title FROM videos').get()).toEqual({ title: '🌻 original' });
    db.close();
  });
  it('rejects incomplete or unknown tables before changing any data', async () => {
    const { dir, config } = await fixture();
    const file = path.join(dir, 'incomplete.json');
    await writeFile(file, '[{"tableName":"videos","rows":[]}]');
    await expect(restoreBackup(file, config)).rejects.toThrow('tables');
    const db = new SQLite(config.sqlitePath);
    expect(db.prepare('SELECT count(*) AS count FROM videos').get()).toEqual({ count: 1 });
    db.close();
  });
  it('restores repeated row shapes in bounded batches and rejects unknown columns', async () => {
    const { dir, config, names } = await fixture();
    const file = path.join(dir, 'many.json');
    const data = names.map((tableName) => ({
      tableName,
      rows:
        tableName === 'videos'
          ? Array.from({ length: 101 }, (_, i) => ({ title: String(i), is_published: false }))
          : [],
    }));
    await writeFile(file, JSON.stringify(data));
    await restoreBackup(file, config);
    const db = new SQLite(config.sqlitePath);
    expect(db.prepare('SELECT count(*) AS count FROM videos').get()).toEqual({ count: 101 });
    db.close();
    for (const row of [{}, { unknown: 'a' }]) {
      data[0].rows = [row as never];
      await writeFile(file, JSON.stringify(data));
      await expect(restoreBackup(file, config)).rejects.toThrow('Unknown backup columns');
    }
  });
  it('closes the connection when SQLite cannot begin its restore transaction', async () => {
    const { config } = await fixture();
    const backup = await createBackup(config);
    const exec = vi.spyOn(SQLite.prototype, 'exec').mockImplementationOnce(() => {
      throw new Error('database is locked');
    });
    try {
      await expect(restoreBackup(backup.file, config)).rejects.toThrow('database is locked');
    } finally {
      exec.mockRestore();
      await backup.dispose();
    }
  });
});
