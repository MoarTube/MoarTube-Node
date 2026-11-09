import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ reserve: vi.fn(), end: vi.fn() }));
vi.mock('postgres', () => ({ default: () => state }));
import {
  acquirePostgresLock,
  coordinationConfig,
  coordinationName,
} from '@/database/coordination.js';

it('closes a failed PostgreSQL reservation and preserves its error', async () => {
  state.reserve.mockRejectedValueOnce(new Error('connection failed'));
  await expect(
    acquirePostgresLock({ dialect: 'postgres', connectionString: 'postgres://unused' }, 'settings')
  ).rejects.toThrow('connection failed');
  expect(state.end).toHaveBeenCalledWith({ timeout: 5 });
});
it('rejects corrupt settings rather than silently coordinating with another database', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-coordination-'));
  const file = path.join(root, 'settings.json');
  try {
    fs.writeFileSync(file, '{');
    expect(() => coordinationConfig(file)).toThrow(SyntaxError);
    expect(coordinationName(file + '.tunnel')).toBe('tunnel');
    expect(coordinationName(file + '.distribution')).toBe('distribution');
    expect(coordinationName(file)).toBe('settings');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
