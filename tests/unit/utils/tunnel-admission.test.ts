import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { admitTunnelLaunch, withTunnelAdmission } from '@/utils/tunnel-admission.js';
import { withSettingsChange } from '@/utils/settings-change.js';
import type { TunnelSettings } from '@/types/cloudflare-tunnel.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});
function settingsAccess() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-tunnel-admission-'));
  directories.push(directory);
  const filename = path.join(directory, 'settings.json');
  const expected: TunnelSettings = {
    isCloudflareTunnelEnabled: true,
    isCloudflareCdnEnabled: false,
    cloudflareEmailAddress: '',
    cloudflareZoneId: '',
    cloudflareGlobalApiKey: '',
    publicNodeAddress: '',
    nodeListeningPort: 9090,
  };
  fs.writeFileSync(filename, JSON.stringify(expected));
  const config = {
    paths: { nodeSettingsPath: filename },
    nodeSettings: expected,
    reloadNodeSettings: vi.fn((_strict?: boolean) => {
      config.nodeSettings = JSON.parse(fs.readFileSync(filename, 'utf8'));
    }),
  };
  return { config, filename, directory, expected };
}
describe('cross-worker tunnel admission', () => {
  it('does not launch after a newer disable was committed', async () => {
    const test = settingsAccess();
    fs.writeFileSync(
      test.filename,
      JSON.stringify({ ...test.expected, isCloudflareTunnelEnabled: false })
    );
    const launch = vi.fn();
    await expect(admitTunnelLaunch(test.config, test.expected, launch)).rejects.toThrow(
      'superseded'
    );
    expect(launch).not.toHaveBeenCalled();
    expect(test.config.reloadNodeSettings).toHaveBeenCalledWith(true);
  });
  it('holds writer admission during the synchronous spawn and releases it afterward', async () => {
    const test = settingsAccess();
    const connector = { ready: Promise.resolve({}), stop: vi.fn() };
    await admitTunnelLaunch(test.config, test.expected, () => {
      const lock = new Database(test.filename + '.change-lock.sqlite', { timeout: 0 });
      try {
        expect(() => lock.exec('BEGIN IMMEDIATE')).toThrow();
      } finally {
        lock.close();
      }
      return connector;
    });
    await expect(
      withSettingsChange(test.filename, () => Promise.resolve('released'))
    ).resolves.toBe('released');
  });
  it('rejects changed credentials or names before spawning in named mode', async () => {
    const test = settingsAccess();
    const expected = {
      ...test.expected,
      isCloudflareCdnEnabled: true,
      cloudflareTunnelName: 'named',
      cloudflareGlobalApiKey: 'old',
    };
    fs.writeFileSync(test.filename, JSON.stringify({ ...expected, cloudflareGlobalApiKey: 'new' }));
    const launch = vi.fn();
    await expect(admitTunnelLaunch(test.config, expected, launch)).rejects.toThrow('superseded');
    expect(launch).not.toHaveBeenCalled();
  });
  it('serializes provider work against a separate OS process', async () => {
    const test = settingsAccess();
    const childFile = path.join(test.directory, 'lock.mjs');
    fs.writeFileSync(
      childFile,
      `import { createRequire } from 'node:module'; const Database=createRequire(${JSON.stringify(path.resolve('package.json'))})('better-sqlite3'); const lock=new Database(${JSON.stringify(test.filename + '.tunnel.change-lock.sqlite')}); lock.exec('BEGIN IMMEDIATE'); process.stdout.write('locked\\n'); process.on('message',()=>{lock.close();process.exit(0);});`
    );
    const child = spawn(process.execPath, [childFile], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', () => reject(new Error('Lock child exited early')));
        child.stdout.once('data', () => resolve());
      });
      await expect(withTunnelAdmission(test.filename, () => Promise.resolve())).rejects.toThrow(
        'Another settings change'
      );
    } finally {
      child.send('release');
      await once(child, 'exit');
    }
    await expect(
      withTunnelAdmission(test.filename, () => Promise.resolve('available'))
    ).resolves.toBe('available');
  }, 10000);
});
