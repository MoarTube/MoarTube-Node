import { describe, expect, it } from 'vitest';
import { relativeHlsLine, hlsPlaylistPath } from '@/utils/hls-urls.js';
const id = 'video123';
const master = hlsPlaylistPath(id, 'manifest-master.m3u8');
const rendition = hlsPlaylistPath(id, 'manifest-360p.m3u8');
const segment = '/external/videos/video123/adaptive/m3u8/360p/segments/segment-360p-0.ts';
describe('managed HLS references', () => {
  it('keeps origin-independent paths valid for direct, quick, CDN, and path-style S3 origins', () => {
    const reference = relativeHlsLine('http://localhost:9090' + segment, rendition, ['http://localhost:9090']);
    expect(reference).toBe('../../360p/segments/segment-360p-0.ts');
    for (const base of ['http://localhost:9090', 'http://192.168.1.2:9090', 'https://new-quick.trycloudflare.com', 'https://externalvideos.node.example.com', 'https://s3.example.com/bucket']) {
      expect(new URL(reference, base + rendition).href).toBe(base + segment);
    }
    expect(relativeHlsLine('https://old.example.com' + rendition, master, ['https://old.example.com'])).toBe('manifest-360p.m3u8');
  });
  it('normalizes URI tags and known S3 path prefixes, preserving external and signed destinations', () => {
    expect(relativeHlsLine('ftp://archive.example.com' + segment, rendition, [])).toBe('ftp://archive.example.com' + segment);
    expect(relativeHlsLine('#EXT-X-MAP:URI="https://s3.example.com/bucket' + segment + '"', rendition, ['https://s3.example.com/bucket'])).toBe('#EXT-X-MAP:URI="../../360p/segments/segment-360p-0.ts"');
    for (const value of ['https://keys.example.com/key', 'https://old.example.com' + segment + '?token=secret', '#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/key"']) {
      expect(relativeHlsLine(value, rendition, ['https://old.example.com'])).toBe(value);
    }
    expect(relativeHlsLine('../../360p/segments/0.ts', rendition, [])).toBe('../../360p/segments/0.ts');
  });
  it('refuses ambiguous legacy origins instead of rewriting unrelated resources', () => {
    expect(() => relativeHlsLine('https://unknown.example.com' + segment, rendition, ['https://node.example.com'])).toThrow('previous media base');
    expect(() => relativeHlsLine('https://unknown.example.com/bucket' + segment, rendition, [])).toThrow('previous media base');
    expect(relativeHlsLine('https://unknown.example.com/external/videos/another/adaptive/m3u8/360p/segments/0.ts', rendition, [])).toContain('unknown.example.com');
    expect(relativeHlsLine('#EXTINF:6.000,', rendition, [])).toBe('#EXTINF:6.000,');
  });
});
