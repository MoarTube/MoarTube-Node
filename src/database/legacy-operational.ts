import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import SQLite from 'better-sqlite3';
import { OperationalDatabase, type OperationalConfig, type Statement } from './operational.js';
import { withSettingsChange } from '@/utils/settings-change.js';

function archiveLegacyFiles(settingsPath: string): void {
  const parent = path.dirname(path.resolve(settingsPath));
  for (const suffix of [
    '.purges.sqlite',
    '.remote-writes.sqlite',
    '.cdn-private.json',
    '.stream-cleanup',
  ]) {
    const source = path.resolve(settingsPath + suffix);
    if (path.dirname(source) !== parent) {
      throw new Error('Invalid legacy journal path');
    }
    if (fs.existsSync(source)) {
      fs.renameSync(source, source + '.migrated-' + randomUUID());
    }
  }
}

/** One-time upgrade, not a database-switch migration. Never reopens sidecars after commit. */
async function importLocked(settingsPath: string, config: OperationalConfig): Promise<void> {
  const db = new OperationalDatabase(config);
  const marker =
    'legacy-sidecars:' + createHash('sha256').update(path.resolve(settingsPath)).digest('hex');
  try {
    if ((await db.query('SELECT 1 FROM node_operational_meta WHERE key=?', [marker])).length) {
      archiveLegacyFiles(settingsPath);
      return;
    }
    const statements: Statement[] = [];
    for (const [suffix, tables] of [
      [
        '.purges.sqlite',
        [
          ['purges', 'node_purges', ['zone', 'target', 'token']],
          ['purge_backoff', 'node_purge_backoff', ['zone', 'until_ms']],
          ['purge_credentials', 'node_purge_credentials', ['zone', 'email', 'key']],
        ],
      ],
      [
        '.remote-writes.sqlite',
        [['writes', 'node_remote_writes', ['id', 'video', 'active', 'finished']]],
      ],
    ] as const) {
      const file = settingsPath + suffix;
      if (!fs.existsSync(file)) {
        continue;
      }
      const legacy = new SQLite(file, { readonly: true, fileMustExist: true });
      try {
        legacy.exec('BEGIN');
        for (const [source, target, columns] of tables) {
          if (
            !legacy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(source)
          ) {
            continue;
          }
          for (const row of legacy
            .prepare(`SELECT ${columns.join(',')} FROM ${source}`)
            .iterate() as Iterable<Record<string, string | number | null>>) {
            statements.push({
              sql: `INSERT INTO ${target} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT DO NOTHING`,
              parameters: columns.map((column) => row[column] ?? null),
            });
          }
        }
      } finally {
        legacy.close();
      }
    }
    const journal = settingsPath + '.cdn-private.json';
    if (fs.existsSync(journal)) {
      const value = fs.readFileSync(journal, 'utf8');
      JSON.parse(value);
      statements.push({
        sql: 'INSERT INTO node_recovery VALUES (?,?) ON CONFLICT DO NOTHING',
        parameters: ['cdn', value],
      });
    }
    const directory = settingsPath + '.stream-cleanup';
    if (fs.existsSync(directory)) {
      for (const name of fs.readdirSync(directory).filter((name) => name.endsWith('.json'))) {
        const value = fs.readFileSync(path.join(directory, name), 'utf8');
        const job = JSON.parse(value) as { videoId: string; generation: string };
        if (!/^[a-zA-Z0-9_-]+$/.test(job.videoId) || !/^[a-zA-Z0-9_-]+$/.test(job.generation)) {
          throw new Error('Invalid legacy stream cleanup journal');
        }
        statements.push({
          sql: 'INSERT INTO node_recovery VALUES (?,?) ON CONFLICT DO NOTHING',
          parameters: ['cleanup:' + job.videoId + '-' + job.generation, value],
        });
      }
    }
    statements.push({
      sql: 'INSERT INTO node_operational_meta VALUES (?,?) ON CONFLICT DO NOTHING',
      parameters: [marker, '1'],
    });
    await db.batch(statements);
    // Do this before workers start. A later database selection must not replay
    // old sidecars that were already imported and drained in another database.
    archiveLegacyFiles(settingsPath);
  } finally {
    await db.close();
  }
}

export function importLegacyOperationalState(
  settingsPath: string,
  config: OperationalConfig
): Promise<void> {
  return withSettingsChange(settingsPath, () => importLocked(settingsPath, config));
}
