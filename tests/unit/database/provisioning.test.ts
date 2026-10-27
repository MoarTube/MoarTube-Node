import { describe, it, expect, vi } from 'vitest';
import type SQLite from 'better-sqlite3';
import type postgres from 'postgres';
import {
  provisionSQLiteComments,
  provisionPostgresComments,
} from '@/database/provisioning/comments.js';

describe('versioned operational database provisioning', () => {
  it('installs SQLite definitions once and repairs missing identity, changed versions, or missing triggers', () => {
    const state = new Map<string, string>();
    let count = 3;
    const exec = vi.fn(),
      insert = vi.fn((key: string, value: string) => state.set(key, value));
    const client = {
      exec,
      transaction: (fn: () => void) => ({ immediate: fn }),
      prepare: (sql: string) => ({
        all: () => [...state].map(([key, value]) => ({ key, value })),
        get: () => ({ count }),
        run: insert,
      }),
    } as unknown as SQLite.Database;
    provisionSQLiteComments(client);
    const first = state.get('instance_id');
    expect(first).toBeDefined();
    exec.mockClear();
    provisionSQLiteComments(client);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(state.get('instance_id')).toBe(first);
    state.delete('instance_id');
    provisionSQLiteComments(client);
    expect(state.get('instance_id')).not.toBe(first);
    count = 0;
    const prior = state.get('instance_id');
    provisionSQLiteComments(client);
    expect(state.get('instance_id')).not.toBe(prior);
    state.set('comment_cache_provision', 'old-version');
    provisionSQLiteComments(client);
    expect(state.get('comment_cache_provision')).not.toBe('old-version');
  });
  it('installs PostgreSQL definitions once and serializes repair transactions', async () => {
    const state = new Map<string, string>();
    let count = 1;
    const unsafe = vi.fn((query: string, values?: string[]) => {
      if (query.includes("VALUES('instance_id'")) state.set('instance_id', values![0]!);
      if (query.includes("VALUES('comment_cache_provision'"))
        state.set('comment_cache_provision', values![0]!);
      const rows =
        query === 'SELECT key,value FROM database_meta'
          ? [...state].map(([key, value]) => ({ key, value }))
          : query.includes('FROM pg_trigger')
            ? [{ count }]
            : [];
      const result = Promise.resolve(rows);
      return Object.assign(result, { simple: () => result });
    });
    const client = {
      begin: async (fn: (tx: { unsafe: typeof unsafe }) => Promise<void>) => fn({ unsafe }),
    } as unknown as postgres.Sql;
    await provisionPostgresComments(client);
    const first = state.get('instance_id');
    expect(first).toBeDefined();
    unsafe.mockClear();
    await provisionPostgresComments(client);
    expect(unsafe).toHaveBeenCalledTimes(4);
    expect(state.get('instance_id')).toBe(first);
    state.delete('instance_id');
    await provisionPostgresComments(client);
    expect(state.get('instance_id')).not.toBe(first);
    count = 0;
    const prior = state.get('instance_id');
    await provisionPostgresComments(client);
    expect(state.get('instance_id')).not.toBe(prior);
    state.set('comment_cache_provision', 'old');
    await provisionPostgresComments(client);
    expect(state.get('comment_cache_provision')).not.toBe('old');
  });
});
