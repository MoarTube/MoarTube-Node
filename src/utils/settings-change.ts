import Database from 'better-sqlite3';
import { AsyncLocalStorage } from 'node:async_hooks';
import { coordinationConfig, coordinationName, withPostgresLock } from '@/database/coordination.js';
import { acquireFileLock } from './file-lock.js';

const held = new AsyncLocalStorage<ReadonlyMap<string, { active: boolean }>>();
function acquire(settingsPath: string): Database.Database {
  const lock = new Database(settingsPath + '.change-lock.sqlite', { timeout: 0 });
  try {
    lock.exec('BEGIN IMMEDIATE');
    return lock;
  } catch (error) {
    lock.close();
    if ((error as { code?: string }).code === 'SQLITE_BUSY') {
      throw new Error('Another settings change or job admission is in progress.');
    }
    throw error;
  }
}

/** Synchronous settings patches share an enclosing settings transaction when present. */
export function withSettingsWrite<T>(settingsPath: string, operation: () => T): T {
  if (held.getStore()?.get(settingsPath)?.active === true) {
    return operation();
  }
  if (coordinationConfig(settingsPath)?.dialect === 'postgres') {
    const release = acquireFileLock(settingsPath);
    try {
      return operation();
    } finally {
      release();
    }
  }
  const lock = acquire(settingsPath);
  try {
    return operation();
  } finally {
    lock.close();
  }
}

/** OS-backed writer admission, automatically released on process death. */
export async function withSettingsChange<T>(
  settingsPath: string,
  operation: () => Promise<T>
): Promise<T> {
  const config = coordinationConfig(settingsPath);
  if (config?.dialect === 'postgres') {
    return withPostgresLock(config, coordinationName(settingsPath), async () => {
      const ownership = { active: true };
      const context = new Map(held.getStore());
      context.set(settingsPath, ownership);
      try {
        return await held.run(context, operation);
      } finally {
        ownership.active = false;
      }
    });
  }
  const lock = acquire(settingsPath);
  const ownership = { active: true };
  const context = new Map(held.getStore());
  context.set(settingsPath, ownership);
  try {
    return await held.run(context, operation);
  } finally {
    ownership.active = false;
    lock.close();
  }
}
