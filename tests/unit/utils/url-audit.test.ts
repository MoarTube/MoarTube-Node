import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/services/cloudflare-tunnel-runtime.js', () => ({ requestTunnelOperation: vi.fn() }));
import { canonicalNodeOrigin } from '@/utils/viewer-urls.js';
import { relativeHlsLine, hlsPlaylistPath } from '@/utils/hls-urls.js';
import { managedMediaBases } from '@/utils/media-url-origins.js';
import { NodeSettingsSchema } from '@/config/schema.js';
const config = () => NodeSettingsSchema.parse({ nodeListeningPort:9090, username:'hash',password:'hash',databaseConfig:{databaseDialect:'sqlite'},storageConfig:{storageMode:'filesystem'},isCloudflareTunnelEnabled:false });
const stopped = { mode:'none',status:'stopped',name:'' } as const;
const playlist = hlsPlaylistPath('video', 'manifest-720p.m3u8');
const route = '/external/videos/video/adaptive/m3u8/720p/segments/one.ts';

describe('URL audit regressions', () => {
  it('normalizes a known root-relative S3 bucket path and refuses an unrecognized bucket on the same origin', () => {
    expect(relativeHlsLine('/bucket'+route, playlist, ['https://s3.example.com/bucket'])).toBe('../../720p/segments/one.ts');
    expect(() => relativeHlsLine('https://s3.example.com/another-bucket'+route,playlist,['https://s3.example.com/bucket'])).toThrow('previous media base');
  });
  it('preserves HTTPS for a configured local address with an explicit default port', () => {
    const settings = {...config(),publicNodeProtocol:'https' as const, publicNodeAddress:'127.0.0.1',publicNodePort:443};
    expect(canonicalNodeOrigin(settings,stopped,{headers:{host:'127.0.0.1:443'}})).toBe('https://127.0.0.1');
  });
  it('does not advertise an arbitrary private Host as a recognized local Node address', () => {
    const interfaces=vi.spyOn(os,'networkInterfaces').mockReturnValue({});
    try { expect(canonicalNodeOrigin(config(),stopped,{headers:{host:'10.253.254.253:9090'}})).toBe(''); }
    finally { interfaces.mockRestore(); }
  });
  it('keeps relative filesystem media usable and allows recording origins while repairing invalid legacy CDN settings', () => {
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'moartube-audit-origins-'));
    try {
      const settings={...config(),publicNodeProtocol:'http' as const,publicNodeAddress:'localhost',publicNodePort:9090,isCloudflareCdnEnabled:true};
      const state={nodeSettings:settings,paths:{dataDirectoryPath:directory},getExternalVideosBaseUrl:()=>{throw new Error('Legacy CDN configuration invalid');}};
      const bases=managedMediaBases(state as never,true);
      expect(bases).toContain('http://localhost:9090');
      expect(relativeHlsLine('http://localhost:9090'+route,playlist,bases)).toBe('../../720p/segments/one.ts');
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
  });
});
