import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { operationalConfig, type OperationalConfig } from './operational.js';
import type { DatabaseConfig } from '@/types/config.js';

export function coordinationConfig(resource: string): OperationalConfig | undefined {
  const file = resource.replace(/\.(distribution|tunnel)$/, '');
  let raw: { databaseConfig?: DatabaseConfig };
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof raw;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  return operationalConfig({ paths: { nodeSettingsPath: file }, nodeSettings: raw });
}
export async function acquirePostgresLock(
  config: Extract<OperationalConfig, { dialect: 'postgres' }>,
  name: string,
  shared = false
): Promise<() => Promise<void>> {
  const sql = postgres(config.connectionString, { max: 1, connect_timeout: 10 });
  const lock = createHash('sha256')
    .update('moartube:' + name)
    .digest()
    .readBigInt64BE()
    .toString();
  const client = await sql.reserve().catch(async (error: unknown) => {
    await sql.end({ timeout: 5 });
    throw error;
  });
  try {
    const rows = await client.unsafe<{ acquired: boolean }[]>(
      `SELECT pg_try_advisory_lock${shared ? '_shared' : ''}($1::bigint) AS acquired`,
      [lock]
    );
    if (rows[0]?.acquired !== true) {
      throw new Error('Another settings change or job admission is in progress.');
    }
    return async () => {
      try {
        await client.unsafe(`SELECT pg_advisory_unlock${shared ? '_shared' : ''}($1::bigint)`, [
          lock,
        ]);
      } finally {
        client.release();
        await sql.end({ timeout: 5 });
      }
    };
  } catch (error) {
    client.release();
    await sql.end({ timeout: 5 });
    throw error;
  }
}
export async function withPostgresLock<T>(
  config: Extract<OperationalConfig, { dialect: 'postgres' }>,
  name: string,
  operation: () => Promise<T>,
  shared = false
): Promise<T> {
  const release = await acquirePostgresLock(config, name, shared);
  try {
    return await operation();
  } finally {
    await release();
  }
}
export function coordinationName(resource: string): string {
  return path.basename(resource).endsWith('.distribution')
    ? 'distribution'
    : path.basename(resource).endsWith('.tunnel')
      ? 'tunnel'
      : 'settings';
}
