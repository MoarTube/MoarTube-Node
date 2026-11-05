import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { managedMediaBases } from '@/utils/media-url-origins.js';
import { relativeHlsLine, hlsPlaylistPath } from '@/utils/hls-urls.js';

describe('managed media origin recovery', () => {
  it('remembers previous media bases across commits/restart and leaves external/signed URLs intact', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-url-history-'));
    try {
      let media = 'https://old.example/bucket';
      const config = { nodeSettings: { publicNodeProtocol: 'http', publicNodeAddress: 'localhost', publicNodePort: 9090 }, paths: { dataDirectoryPath: directory }, getExternalVideosBaseUrl: () => media };
      managedMediaBases(config as never, true);
      media = 'https://new.example';
      const afterRestart = managedMediaBases({ ...config } as never, true);
      expect(afterRestart).toContain('https://old.example/bucket');
      const playlist = hlsPlaylistPath('video', 'manifest-720p.m3u8');
      const original = 'https://old.example/bucket/external/videos/video/adaptive/m3u8/720p/segments/0.ts';
      expect(relativeHlsLine(original, playlist, afterRestart)).toBe('../../720p/segments/0.ts');
      expect(relativeHlsLine(original + '?token=signed', playlist, afterRestart)).toBe(original + '?token=signed');
      expect(relativeHlsLine('https://other.example/media/0.ts', playlist, afterRestart)).toBe('https://other.example/media/0.ts');
      expect(fs.readdirSync(directory)).toEqual(['_media_url_origins.json']);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  it('fails before a distribution operation can commit when origin journaling fails', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-url-history-'));
    try {
      const config = { nodeSettings: { publicNodeProtocol: 'https', publicNodeAddress: 'node.example.com', publicNodePort: 443 }, paths: { dataDirectoryPath: directory }, getExternalVideosBaseUrl: () => 'https://media.example.com' };
      const write = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => { throw new Error('disk full'); });
      expect(() => managedMediaBases(config as never, true)).toThrow('disk full');
      write.mockRestore();
      expect(fs.readdirSync(directory)).toEqual([]);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
