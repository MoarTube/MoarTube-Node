import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ settings: {} as any, snapshot: vi.fn(), interfaces: {} as any }));
vi.mock('node:os',async original=>({...await original<typeof import('node:os')>(),networkInterfaces:()=>state.interfaces}));
vi.mock('@/config/index.js', () => ({ getConfig: () => ({ nodeSettings: state.settings }) }));
vi.mock('@/services/cloudflare-tunnel-runtime.js', () => ({ requestTunnelOperation: state.snapshot }));
import { canonicalNodeOrigin, localHostname, pageCanonicalOrigin } from '@/utils/viewer-urls.js';
import { relativeHlsLine, hlsPlaylistPath } from '@/utils/hls-urls.js';
import { managedMediaBases } from '@/utils/media-url-origins.js';
afterEach(() => vi.restoreAllMocks());
const stopped = { mode:'none',status:'stopped',name:'' } as const;
const local = () => ({ publicNodeProtocol:'http',publicNodeAddress:'localhost',publicNodePort:9090,isCloudflareTunnelEnabled:true,isCloudflareCdnEnabled:false,storageConfig:{storageMode:'filesystem'} });
describe('viewer origin failure boundaries', () => {
  it.each(['::ffff:127.0.0.1','::ffff:7f00:1','172.16.0.1','172.31.1.1','169.254.1.1','192.168.0.1'])('recognizes local address %s',host=>expect(localHostname(host)).toBe(true));
  it.each(['::ffff:8.8.8.8','::ffff:808:808','::ffff:1','172.15.0.1','172.32.0.1','192.1.1.1'])('does not classify %s as local',host=>expect(localHostname(host)).toBe(false));
  it('handles invalid raw Hosts and missing interface entries without reflecting them',()=>{
    state.interfaces={ missing:undefined,eth0:[{address:'10.1.2.3'}] };
    const settings={...local(),publicNodeAddress:'['};
    expect(canonicalNodeOrigin(settings as never,stopped,{headers:{host:'['}})).toBe('');
    expect(canonicalNodeOrigin(settings as never,stopped,{headers:{host:'10.1.2.3:1234'}})).toBe('http://10.1.2.3:1234');
    for(const host of ['', 'bad@host', 'host/path']) expect(canonicalNodeOrigin(settings as never,stopped,{headers:{host}})).toBe('');
  });
  it.each(['bad url','ftp://example.com','https://user:pass@x.trycloudflare.com','https://x.trycloudflare.com/path','https://x.trycloudflare.com?x=1','https://x.trycloudflare.com#fragment',undefined])('does not publish an invalid ready origin %s',publicUrl=>{
    expect(canonicalNodeOrigin(local() as never,{mode:'quick',status:'running',name:'x',publicUrl} as any)).toBe('');
  });
  it('falls back to local HTTP after failed snapshot reads and bypasses IPC for configured public links',async()=>{
    state.settings=local();state.snapshot.mockRejectedValue(new Error('IPC lost'));
    expect(await pageCanonicalOrigin({headers:{host:'127.0.0.1:9090'}} as never)).toBe('http://127.0.0.1:9090');
    state.snapshot.mockClear();state.settings={...local(),publicNodeAddress:'public.example',publicNodeProtocol:'https',publicNodePort:443};
    expect(await pageCanonicalOrigin({headers:{}} as never)).toBe('https://public.example');expect(state.snapshot).not.toHaveBeenCalled();
  });
});
describe('managed URL corruption and persistence boundaries',()=>{
  it('rejects invalid playlist locations and preserves empty, malformed, escaped and self references',()=>{
    expect(()=>relativeHlsLine('x','/unmanaged',[])).toThrow('Invalid managed playlist');
    const playlist=hlsPlaylistPath('video','master.m3u8');
    for(const reference of ['#EXT-X-KEY:URI=""','#EXT-X-KEY:URI="bad\\path"','http://[','   ']) expect(relativeHlsLine(reference,playlist,[])).toBe(reference);
    expect(relativeHlsLine('master.m3u8',playlist,[])).toBe('master.m3u8');
    expect(relativeHlsLine('/external/videos/video/adaptive/m3u8/static/manifests',playlist,[])).toBe('manifests');
    expect(relativeHlsLine('https://outside.example/other',playlist,['not a URL'])).toBe('https://outside.example/other');
    expect(relativeHlsLine('../../720p/segments/0.ts',playlist,['not a URL'])).toBe('../../720p/segments/0.ts');
  });
  it('validates saved history and cleans a failed atomic replacement without erasing the previous journal',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'moartube-origin-failures-'));
    const file=path.join(root,'_media_url_origins.json');
    const config={nodeSettings:local(),paths:{dataDirectoryPath:root},getExternalVideosBaseUrl:()=>''};
    try{
      expect(managedMediaBases({...config,paths:{dataDirectoryPath:''}} as never)).toEqual(['http://localhost:9090','']);
      for(const saved of [{},[123],['ftp://example.com'],['https://u:p@example.com'],['https://example.com?a=b'],['https://example.com#hash']]){
        fs.writeFileSync(file,JSON.stringify(saved));expect(()=>managedMediaBases(config as never)).toThrow(/Invalid managed media/);
      }
      fs.writeFileSync(file,'[]');const rename=vi.spyOn(fs,'renameSync').mockImplementationOnce(()=>{throw new Error('replace denied')});
      expect(()=>managedMediaBases(config as never,true)).toThrow('replace denied');rename.mockRestore();
      expect(fs.readdirSync(root)).toEqual(['_media_url_origins.json']);expect(fs.readFileSync(file,'utf8')).toBe('[]');
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
});
