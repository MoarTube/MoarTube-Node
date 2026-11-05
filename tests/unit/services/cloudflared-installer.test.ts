import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { install } from '../../../scripts/install-cloudflared.mjs';

describe('pinned connector installer', () => {
  it('rejects unsupported architectures before downloading', async () => {
    const fetchAsset = vi.fn();
    await expect(install('unknown', '/unused', fetchAsset)).rejects.toThrow('Unsupported');
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it('rejects failed downloads and mismatched checksums without replacing a binary', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-installer-test-'));
    try {
      const destination = path.join(directory, 'cloudflared');
      fs.writeFileSync(destination, 'existing');
      await expect(install('amd64', destination, async () => ({ ok: false }))).rejects.toThrow(
        'download failed'
      );
      await expect(
        install('arm64', destination, async () => ({
          ok: true,
          arrayBuffer: async () => Buffer.from('tampered'),
        }))
      ).rejects.toThrow('checksum mismatch');
      expect(fs.readFileSync(destination, 'utf8')).toBe('existing');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
