import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { withSettingsChange } from '@/utils/settings-change.js';

describe('OS-backed cross-worker transition and admission lock', () => {
  async function fixture(operation: (settings: string) => Promise<void>): Promise<void> {
    const directory = await mkdtemp(path.join(tmpdir(), 'moartube-settings-lock-'));
    try {
      await operation(path.join(directory, 'settings.json'));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  it('rejects concurrent owners and releases after success or failure', async () => {
    await fixture(async (settings) => {
      await withSettingsChange(settings, async () => {
        const mutations = Array.from({ length: 5 }, () => vi.fn());
        await Promise.all(
          mutations.map((mutation) =>
            expect(withSettingsChange(settings, mutation)).rejects.toThrow('in progress')
          )
        );
        mutations.forEach((mutation) => expect(mutation).not.toHaveBeenCalled());
      });
      await expect(withSettingsChange(settings, async () => 42)).resolves.toBe(42);
      await expect(
        withSettingsChange(settings, async () => {
          throw new Error('operation failed');
        })
      ).rejects.toThrow('operation failed');
      await expect(withSettingsChange(settings, async () => 42)).resolves.toBe(42);
    });
  });
  it.each(['', 'invalid', '0', '-1'])(
    'does not deadlock on an abandoned legacy lock: %s',
    async (value) => {
      await fixture(async (settings) => {
        await writeFile(settings + '.change-lock', value);
        await expect(withSettingsChange(settings, async () => true)).resolves.toBe(true);
      });
    }
  );
  it('fails before mutation for invalid storage and a corrupt lock database', async () => {
    await fixture(async (settings) => {
      const operation = vi.fn();
      await expect(withSettingsChange(path.join(settings, 'missing'), operation)).rejects.toThrow();
      await writeFile(settings + '.change-lock.sqlite', 'not a sqlite database');
      await expect(withSettingsChange(settings, operation)).rejects.toThrow();
      expect(operation).not.toHaveBeenCalled();
    });
  });
  it('keeps a live process exclusive and recovers immediately after a real process crash', async () => {
    await fixture(async (settings) => {
      const library = createRequire(import.meta.url).resolve('better-sqlite3');
      const child = spawn(
        process.execPath,
        [
          '-e',
          `const Database=require(${JSON.stringify(library)});const db=new Database(process.argv[1]+'.change-lock.sqlite',{timeout:0});db.exec('BEGIN IMMEDIATE');process.send('locked');setInterval(()=>{},1000);`,
          settings,
        ],
        { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }
      );
      try {
        await once(child, 'message');
        await expect(withSettingsChange(settings, vi.fn())).rejects.toThrow('in progress');
        child.kill('SIGKILL');
        await once(child, 'exit');
        await expect(withSettingsChange(settings, async () => 'recovered')).resolves.toBe(
          'recovered'
        );
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          await once(child, 'exit');
        }
      }
    });
  });
});
