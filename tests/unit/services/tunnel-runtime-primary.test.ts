import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({primary:true,options:undefined as any,config:{paths:{dataDirectoryPath:'/data',nodeSettingsPath:'/data/settings'},nodeSettings:{} as any,reloadNodeSettings:vi.fn(),updateNodeSettings:vi.fn()},admit:vi.fn((_p,op)=>op()),launch:vi.fn((_c,_s,op)=>op()),write:vi.fn((_p,op)=>op()),provision:vi.fn(),restore:vi.fn(),warn:vi.fn(),instance:{snapshot:vi.fn(),reconcile:vi.fn(),restart:vi.fn(),prepareCdnClear:vi.fn()}}));
vi.mock('node:cluster',()=>({default:{get isPrimary(){return mocks.primary}}}));
vi.mock('@/config/index.js',()=>({getConfig:()=>mocks.config}));
vi.mock('@/utils/settings-change.js',()=>({withSettingsChange:mocks.write}));
vi.mock('@/utils/tunnel-admission.js',()=>({withTunnelAdmission:mocks.admit,admitTunnelLaunch:mocks.launch}));
vi.mock('@/utils/logger.js',()=>({Logger:{getInstance:()=>({warn:mocks.warn})}}));
vi.mock('@/services/cloudflared.js',()=>({CloudflaredDriver:class{}}));
vi.mock('@/services/cloudflare-tunnel-api.js',()=>({TunnelOwnershipStore:class{},CloudflareTunnelApi:class{provision=mocks.provision;restoreRoutes=mocks.restore}}));
vi.mock('@/services/cloudflare-tunnel.js',()=>({CloudflareTunnelManager:class{constructor(options:any){mocks.options=options;return mocks.instance}}}));
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();mocks.primary=true;mocks.config.nodeSettings={isCloudflareTunnelEnabled:true,isCloudflareCdnEnabled:false,nodeListeningPort:9090};});
const original=Object.getOwnPropertyDescriptor(process,'send');
afterEach(()=>{if(original)Object.defineProperty(process,'send',original);else Reflect.deleteProperty(process,'send');});
describe('primary runtime composition and worker channel failures',()=>{
 it('constructs one owner, reloads committed settings, applies locks and routes operations',async()=>{
   const {primaryTunnelManager,requestTunnelOperation}=await import('@/services/cloudflare-tunnel-runtime.js');
   expect(primaryTunnelManager()).toBe(mocks.instance);expect(primaryTunnelManager()).toBe(mocks.instance);
   const o=mocks.options;expect(o.settings()).toBe(mocks.config.nodeSettings);expect(mocks.config.reloadNodeSettings).toHaveBeenCalledWith(true);
   const work=vi.fn();await o.withAdmission(work);expect(work).toHaveBeenCalledOnce();
   const launch=vi.fn().mockReturnValue('connector');expect(await o.launchIfCurrent({},launch)).toBe('connector');
   await o.saveQuickName('new',{nodeListeningPort:9090});expect(mocks.config.updateNodeSettings).toHaveBeenCalledWith({cloudflareTunnelName:'new'});
   for(const patch of [{isCloudflareTunnelEnabled:false},{isCloudflareCdnEnabled:true},{nodeListeningPort:9091}]){
     mocks.config.nodeSettings={isCloudflareTunnelEnabled:true,isCloudflareCdnEnabled:false,nodeListeningPort:9090,...patch};
     await expect(o.saveQuickName('stale',{nodeListeningPort:9090})).rejects.toThrow('Settings changed');
   }
   const signal=new AbortController().signal;await o.provision({},'origin',signal);expect(mocks.provision).toHaveBeenCalledWith({},'origin',signal);
   await o.restoreRoutes({},signal);expect(mocks.restore).toHaveBeenCalledWith({},signal);o.report('safe');expect(mocks.warn).toHaveBeenCalledWith('safe');
   for(const operation of ['snapshot','prepare_cdn_clear','restart','reconcile'] as const){await requestTunnelOperation(operation);expect(mocks.instance[operation==='prepare_cdn_clear'?'prepareCdnClear':operation]).toHaveBeenCalledOnce();}
 });
 it('rejects unavailable channels and asynchronous send failures without leaving listeners',async()=>{
   mocks.primary=false;const {requestTunnelOperation}=await import('@/services/cloudflare-tunnel-runtime.js');const baseline=process.listenerCount('message');
   Reflect.deleteProperty(process,'send');await expect(requestTunnelOperation()).rejects.toThrow('unavailable');
   const existing=new Set(process.listeners('message'));
   Object.defineProperty(process,'send',{configurable:true,value:vi.fn((m,callback)=>{const receive=process.listeners('message').find(listener=>!existing.has(listener))!;for(const message of [null,'invalid',{}, {cmd:'cloudflare_tunnel_response',requestId:m.requestId}])receive(message);callback(new Error('closed'))})});
   await expect(requestTunnelOperation()).rejects.toThrow('unavailable');expect(process.listenerCount('message')).toBe(baseline);
 });
});
