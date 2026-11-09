import path from 'node:path';
import { OperationalDatabase } from './operational.js';
import { coordinationConfig } from './coordination.js';

export function operationalForPath(settingsPath: string): OperationalDatabase {
  return new OperationalDatabase(
    coordinationConfig(settingsPath) ?? {
      dialect: 'sqlite',
      filepath: path.join(path.dirname(settingsPath), 'db/node_db.sqlite'),
    }
  );
}
export async function readRecovery(settingsPath: string, key: string): Promise<string | undefined> {
  const db = operationalForPath(settingsPath);
  try {
    return (
      await db.query<{ value: string }>('SELECT value FROM node_recovery WHERE key=?', [key])
    )[0]?.value;
  } finally {
    await db.close();
  }
}
export async function writeRecovery(
  settingsPath: string,
  key: string,
  value: string
): Promise<void> {
  const db = operationalForPath(settingsPath);
  try {
    await db.query(
      'INSERT INTO node_recovery VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      [key, value]
    );
  } finally {
    await db.close();
  }
}
