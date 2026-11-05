import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { installHost, runInstaller } from '../../../scripts/install-npm-cloudflared.mjs';
import { assets } from '../../../scripts/cloudflared-release.mjs';

const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const binary = Buffer.from('verified test executable');

async function isolated(operation: (destination: string) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'moartube-host-install-'));
  try {
    await operation(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function archive() {
  const header = Buffer.alloc(512);
  header.write('cloudflared');
  header.write(binary.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('0', 156);
  return gzipSync(
    Buffer.concat([header, binary, Buffer.alloc(512 - binary.length), Buffer.alloc(1024)])
  );
}

describe('host-only npm installer', () => {
  it.each(Object.keys(assets))(
    'downloads only %s, with the correct filename and executable permissions',
    async (target) => {
      await isolated(async (destination) => {
        const [platform, architecture] = target.split('-');
        const asset = assets[target as keyof typeof assets];
        const downloaded = asset.name.endsWith('.tgz') ? archive() : binary;
        const fetchAsset = vi.fn(async () => ({ ok: true, arrayBuffer: async () => downloaded }));
        const assetMap = {
          [target]: { ...asset, sha256: digest(downloaded), binarySha256: digest(binary) },
        };
        const result = await installHost({
          platform,
          architecture,
          destination,
          fetchAsset,
          assetMap,
        });
        expect(result.downloaded).toBe(true);
        expect(fetchAsset).toHaveBeenCalledTimes(1);
        expect(String(fetchAsset.mock.calls[0]![0])).toContain('/' + asset.name);
        expect(await fs.readFile(result.executable)).toEqual(binary);
        expect(path.basename(result.executable)).toBe(
          platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
        );
        expect(await fs.readdir(destination)).toEqual([target]);
        expect(await fs.readdir(path.dirname(result.executable))).toEqual([
          path.basename(result.executable),
        ]);
        if (process.platform !== 'win32' && platform !== 'win32')
          expect((await fs.stat(result.executable)).mode & 0o111).not.toBe(0);
        await expect(
          installHost({ platform, architecture, destination, fetchAsset, assetMap })
        ).resolves.toMatchObject({ downloaded: false });
        expect(fetchAsset).toHaveBeenCalledTimes(1);
      });
    }
  );

  it('rejects unsupported platforms before any download', async () => {
    const fetchAsset = vi.fn();
    await expect(
      installHost({ platform: 'win32', architecture: 'arm64', fetchAsset })
    ).rejects.toThrow('Unsupported');
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it('preserves the previous executable on failed or corrupt downloads, and can retry', async () => {
    await isolated(async (destination) => {
      const executable = path.join(destination, 'linux-x64', 'cloudflared');
      await fs.mkdir(path.dirname(executable), { recursive: true });
      await fs.writeFile(executable, 'previous');
      const assetMap = { 'linux-x64': { name: 'cloudflared-linux-amd64', sha256: digest(binary) } };
      for (const fetchAsset of [
        async () => ({ ok: false }),
        async () => ({ ok: true, arrayBuffer: async () => Buffer.from('tampered') }),
      ]) {
        await expect(
          installHost({ platform: 'linux', architecture: 'x64', destination, assetMap, fetchAsset })
        ).rejects.toThrow();
        expect(await fs.readFile(executable, 'utf8')).toBe('previous');
      }
      await installHost({
        platform: 'linux',
        architecture: 'x64',
        destination,
        assetMap,
        fetchAsset: async () => ({ ok: true, arrayBuffer: async () => binary }),
      });
      expect(await fs.readFile(executable)).toEqual(binary);
    });
  });

  it('verifies the extracted macOS executable as well as its archive', async () => {
    await isolated(async (destination) => {
      const data = archive();
      await expect(
        installHost({
          platform: 'darwin',
          architecture: 'arm64',
          destination,
          assetMap: {
            'darwin-arm64': {
              name: 'cloudflared-darwin-arm64.tgz',
              sha256: digest(data),
              binarySha256: '0'.repeat(64),
            },
          },
          fetchAsset: async () => ({ ok: true, arrayBuffer: async () => data }),
        })
      ).rejects.toThrow('executable checksum');
      expect(await fs.readdir(destination)).toEqual([]);
    });
  });

  it('keeps optional postinstall failures nonfatal and manual failures retryable', async () => {
    const install = vi.fn(async () => {
      throw new Error('download unavailable');
    });
    const warn = vi.fn();
    await expect(runInstaller({ optional: true, env: {}, install, warn })).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('install:cloudflared'));
    await expect(runInstaller({ env: {}, install })).rejects.toThrow('download unavailable');
    install.mockResolvedValueOnce({ downloaded: true } as never);
    await expect(runInstaller({ env: {}, install, log: vi.fn() })).resolves.toBe(true);
  });

  it.each([
    { MOARTUBE_SKIP_CLOUDFLARED_INSTALL: '1' },
    { MOARTUBE_CLOUDFLARED_PATH: '/custom/cloudflared' },
  ])('skips automatic installation for explicit overrides', async (env) => {
    const install = vi.fn();
    await expect(runInstaller({ optional: true, env, install, log: vi.fn() })).resolves.toBe(true);
    expect(install).not.toHaveBeenCalled();
  });
});
