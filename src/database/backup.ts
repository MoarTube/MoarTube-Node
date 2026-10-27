import fs from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import SQLite from 'better-sqlite3';
import postgres from 'postgres';
import { parseBackup } from '@/utils/backup-json.js';

export type BackupConfig =
  | { dialect: 'sqlite'; sqlitePath: string }
  | { dialect: 'postgres'; postgresUrl: string };
const tables = [
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
type Row = Record<string, unknown>;
const quoted = (value: string): string => {
  if (!/^[a-z_]+$/.test(value)) {
    throw new Error('Invalid database identifier');
  }
  return `"${value}"`;
};
async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'moartube-backup-'));
  return {
    directory,
    async dispose() {
      if (
        path.dirname(directory) !== path.resolve(tmpdir()) ||
        !path.basename(directory).startsWith('moartube-backup-')
      ) {
        throw new Error('Unexpected backup path');
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}
function exported(row: Row): Row {
  const result = { ...row };
  delete result['id'];
  for (const [key, value] of Object.entries(result)) {
    if (key.startsWith('is_') && (value === 0 || value === 1)) {
      result[key] = Boolean(value);
    }
  }
  return result;
}
async function writeTables(
  file: string,
  rows: (name: string) => AsyncIterable<Row> | Iterable<Row>
): Promise<void> {
  const output = await open(file, 'wx');
  try {
    await output.write('[');
    for (const [index, name] of tables.entries()) {
      await output.write(`${index ? ',' : ''}{"rows":[`);
      let first = true;
      for await (const row of rows(name)) {
        const json = JSON.stringify(exported(row));
        if (Buffer.byteLength(json) > 1024 ** 2) {
          throw new Error('Backup row exceeds byte limit');
        }
        await output.write((first ? '' : ',') + json);
        first = false;
      }
      await output.write(`],"tableName":${JSON.stringify(name)}}`);
    }
    await output.write(']');
  } finally {
    await output.close();
  }
}

/** Disk-backed consistent snapshot; memory is bounded to a cursor batch and one row. */
export async function createBackup(
  config: BackupConfig
): Promise<{ file: string; dispose(): Promise<void> }> {
  const temp = await temporary();
  const file = path.join(temp.directory, 'database.json');
  try {
    if (config.dialect === 'sqlite') {
      const source = new SQLite(config.sqlitePath, { readonly: true });
      const snapshot = path.join(temp.directory, 'snapshot.sqlite');
      try {
        await source.backup(snapshot);
      } finally {
        source.close();
      }
      const db = new SQLite(snapshot, { readonly: true });
      try {
        db.exec('BEGIN');
        await writeTables(file, function* (name) {
          for (const row of db.prepare(`SELECT * FROM ${quoted(name)}`).iterate()) {
            yield row as Row;
          }
        });
        db.exec('COMMIT');
      } finally {
        db.close();
      }
    } else {
      const sql = postgres(config.postgresUrl, { max: 1, connect_timeout: 10 });
      try {
        await sql.begin('isolation level repeatable read read only', async (transaction) => {
          await writeTables(file, async function* (name) {
            for await (const batch of transaction
              .unsafe(`SELECT * FROM ${quoted(name)}`)
              .cursor(100)) {
              for (const row of batch) {
                yield row;
              }
            }
          });
        });
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
    return { file, dispose: () => temp.dispose() };
  } catch (error) {
    await temp.dispose();
    throw error;
  }
}

async function* stagedRows(file: string): AsyncGenerator<Row[]> {
  const stream = fs.createReadStream(file);
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let rows: Row[] = [];
  try {
    for await (const line of lines) {
      rows.push(JSON.parse(line) as Row);
      if (rows.length === 100) {
        yield rows;
        rows = [];
      }
    }
    if (rows.length) {
      yield rows;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}

/** Validate the complete structure before replacing tables, then restore in one transaction. */
export async function restoreBackup(file: string, config: BackupConfig): Promise<void> {
  const temp = await temporary();
  const staged = new Map<string, string>();
  let output: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const input = fs.createReadStream(file);
    try {
      for await (const event of parseBackup(input)) {
        const rowFile = path.join(temp.directory, `${String(event.table)}.ndjson`);
        output ??= await open(rowFile, 'wx');
        if (event.kind === 'row') {
          await output.write(JSON.stringify(event.row) + '\n');
        } else {
          if (!tables.includes(event.name) || staged.has(event.name)) {
            throw new Error('Invalid backup tables');
          }
          await output.close();
          output = undefined;
          staged.set(event.name, rowFile);
        }
      }
    } finally {
      input.destroy();
    }
    if (staged.size !== tables.length) {
      throw new Error('Backup must contain all database tables');
    }
    if (config.dialect === 'sqlite') {
      const db = new SQLite(config.sqlitePath, { timeout: 30_000 });
      try {
        db.exec('BEGIN IMMEDIATE');
        for (const name of [...tables].reverse()) {
          db.exec(`DELETE FROM ${quoted(name)}`);
        }
        for (const name of tables) {
          const allowed = new Set(
            (db.prepare(`PRAGMA table_info(${quoted(name)})`).all() as { name: string }[]).map(
              (column) => column.name
            )
          );
          let lastSignature = '',
            statement: SQLite.Statement | undefined;
          for await (const rows of stagedRows(staged.get(name) as string)) {
            for (const row of rows) {
              delete row['id'];
              const keys = Object.keys(row);
              if (!keys.length || keys.some((key) => !allowed.has(key))) {
                throw new Error('Unknown backup columns');
              }
              const signature = keys.join(',');
              if (signature !== lastSignature) {
                statement = db.prepare(
                  `INSERT INTO ${quoted(name)} (${keys.map(quoted).join(',')}) VALUES (${keys.map(() => '?').join(',')})`
                );
                lastSignature = signature;
              }
              (statement as SQLite.Statement).run(
                ...keys.map((key) => (typeof row[key] === 'boolean' ? Number(row[key]) : row[key]))
              );
            }
          }
        }
        db.exec('COMMIT');
      } catch (error) {
        if (db.inTransaction) {
          db.exec('ROLLBACK');
        }
        throw error;
      } finally {
        db.close();
      }
    } else {
      const sql = postgres(config.postgresUrl, { max: 1, connect_timeout: 10 });
      try {
        await sql.begin(async (transaction) => {
          for (const name of [...tables].reverse()) {
            await transaction.unsafe(`DELETE FROM ${quoted(name)}`);
          }
          for (const name of tables) {
            const columns = await transaction.unsafe<
              { column_name: string; column_default: string | null }[]
            >(
              "SELECT column_name,column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
              [name]
            );
            const allowed = new Set(columns.map((column) => column.column_name));
            for await (const rows of stagedRows(staged.get(name) as string)) {
              const groups = new Map<string, Row[]>();
              for (const row of rows) {
                delete row['id'];
                const keys = Object.keys(row).sort();
                if (!keys.length || keys.some((key) => !allowed.has(key))) {
                  throw new Error('Unknown backup columns');
                }
                const signature = keys.join(',');
                const group = groups.get(signature) ?? [];
                group.push(row);
                groups.set(signature, group);
              }
              for (const [signature, group] of groups) {
                const selected = signature.split(',').map(quoted).join(',');
                await transaction.unsafe(
                  `INSERT INTO ${quoted(name)} (${selected}) SELECT ${selected} FROM json_populate_recordset(NULL::${quoted(name)}, $1::json)`,
                  [transaction.json(group as postgres.JSONValue)]
                );
              }
            }
            for (const column of columns) {
              if (column.column_default?.startsWith('nextval(')) {
                await transaction.unsafe(
                  `SELECT setval(pg_get_serial_sequence($1,$2), GREATEST(COALESCE(MAX(${quoted(column.column_name)}),0),1), COUNT(*) > 0) FROM ${quoted(name)}`,
                  [name, column.column_name]
                );
              }
            }
          }
        });
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
  } finally {
    await output?.close();
    await temp.dispose();
  }
}
