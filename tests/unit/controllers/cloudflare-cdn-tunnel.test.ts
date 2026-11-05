import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ config: vi.fn(), operation: vi.fn(), credentials: vi.fn() }));
vi.mock('@/config/index.js', () => ({ getConfig: mocks.config }));
vi.mock('@/services/cloudflare-tunnel-runtime.js', () => ({
  requestTunnelOperation: mocks.operation,
}));
vi.mock('@utils/index.js', async (original) => ({
  ...(await original<object>()),
  isCloudflareCredentialsValid: mocks.credentials,
}));
import { settingsRoutes } from '@/routes/settings.js';
import { withSettingsChange } from '@/utils/settings-change.js';
import { SettingsController } from '@/controllers/settings.js';

let app: FastifyInstance;
let directory: string;
let settings: Record<string, unknown>;
let cloudflare: Record<string, ReturnType<typeof vi.fn>>;
const payload = {
  cloudflareEmailAddress: 'email@example.com',
  cloudflareZoneId: 'zone',
  cloudflareGlobalApiKey: 'key',
  cloudflareTunnelName: '  My Named Tunnel  ',
};

it.each([undefined,{cloudflareTunnelName:''}])('validates raw configure calls even without route schema: %o',async body=>{
 const controller=new SettingsController({} as never,{} as never,{} as never,{} as never);
 const reply={header:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),send:vi.fn().mockReturnThis()};
 await controller.cloudflareConfigure({body} as never,reply as never);expect(reply.status).toHaveBeenCalledWith(400);
 expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({isError:true,message:expect.stringContaining('Name')}));
});

it('returns conflict when another distribution operation holds admission during clear',async()=>{
 let release!:()=>void;let entered!:()=>void;const ready=new Promise<void>(resolve=>{entered=resolve});
 const config=mocks.config();const pending=withSettingsChange(config.paths.nodeSettingsPath,async()=>{entered();await new Promise<void>(resolve=>{release=resolve})});
 await ready;try{expect((await clear()).statusCode).toBe(409);}finally{release();await pending;}
});

it('rejects a missing configure body and reports persisted configuration when snapshot IPC fails',async()=>{
  const invalid=await app.inject({method:'POST',url:'/settings/cloudflare/configure'});
  expect(invalid.statusCode).toBe(400);
  mocks.operation.mockRejectedValue(new Error('IPC lost'));delete settings.cloudflareTunnelName;
  const result=await app.inject({method:'POST',url:'/settings/cloudflare/clear',payload:{},headers:{authorization:'Bearer test'}});
  expect(result.statusCode).toBe(502);expect(result.json()).toMatchObject({settingsSaved:true,cloudflareTunnelName:'',tunnel:{status:'error'}});
});

beforeEach(async () => {
  vi.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-cdn-test-'));
  settings = {
    isCloudflareTunnelEnabled: true,
    isCloudflareCdnEnabled: false,
    cloudflareTunnelName: 'old-quick',
    cloudflareEmailAddress: '',
    cloudflareZoneId: '',
    cloudflareGlobalApiKey: '',
    publicNodeAddress: 'node.example.com',
    storageConfig: { storageMode: 'filesystem' },
  };
  const config = {
    paths: {
      nodeSettingsPath: path.join(directory, 'settings.json'),
      videosDirectoryPath: directory,
    },
    get nodeSettings() {
      return { ...settings };
    },
    reloadNodeSettings: vi.fn(),
    updateNodeSettings: (updates: object) => {
      settings = { ...settings, ...updates };
    },
    getExternalVideosBaseUrl: () => 'https://externalvideos.node.example.com',
  };
  mocks.config.mockReturnValue(config);
  mocks.credentials.mockResolvedValue(true);
  mocks.operation.mockImplementation(async (operation) => {
    if (operation === 'prepare_cdn_clear') {
      expect(settings.isCloudflareCdnEnabled).toBe(true);
      expect(settings.cloudflareGlobalApiKey).not.toBe('');
      return { mode: 'named', status: 'running', name: settings.cloudflareTunnelName };
    }
    await withSettingsChange(config.paths.nodeSettingsPath, () => Promise.resolve());
    if (settings.isCloudflareTunnelEnabled === false)
      return { mode: 'none', status: 'stopped', name: '' };
    if (!settings.isCloudflareCdnEnabled) settings.cloudflareTunnelName = 'new-generated-quick';
    return {
      mode: settings.isCloudflareCdnEnabled ? 'named' : 'quick',
      status: 'running',
      name: settings.cloudflareTunnelName,
    };
  });
  const service = {
    updateCloudflareConfig: (email: string, zone: string, key: string, name: string) =>
      config.updateNodeSettings({
        isCloudflareCdnEnabled: true,
        cloudflareEmailAddress: email,
        cloudflareZoneId: zone,
        cloudflareGlobalApiKey: key,
        cloudflareTunnelName: name,
      }),
    clearCloudflareConfig: () =>
      config.updateNodeSettings({
        isCloudflareCdnEnabled: false,
        cloudflareEmailAddress: '',
        cloudflareZoneId: '',
        cloudflareGlobalApiKey: '',
      }),
  };
  cloudflare = {
    validateCdnConfiguration: vi.fn().mockResolvedValue(undefined),
    withConfigurationRollback: vi.fn(async (_email, _zone, _key, operation) => operation()),
    setCdnConfiguration: vi.fn().mockResolvedValue(undefined),
    addCdnDnsRecord: vi.fn().mockResolvedValue(undefined),
    purgeEntireCacheWithCredentials: vi.fn().mockResolvedValue(undefined),
    resetCdn: vi.fn().mockResolvedValue(undefined),
  };
  const services: Record<string, object> = {
    settingsService: service,
    cloudflareService: cloudflare,
    videosService: { getAllVideosData: async () => [] },
    websocketService: {},
  };
  app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('optionalAuthenticate', async () => {});
  app.decorate(
    'authenticate',
    async (
      request: { headers: { authorization?: string } },
      reply: { code: (code: number) => { send: (body: object) => unknown } }
    ) => {
      if (request.headers.authorization !== 'Bearer test')
        return reply.code(401).send({ isError: true });
    }
  );
  await app.register(
    async (scope) => {
      settingsRoutes(scope as never, { resolve: (name: string) => services[name] } as never);
    },
    { prefix: '/settings' }
  );
});
afterEach(async () => {
  await app.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
const configure = (body: object = payload) =>
  app.inject({
    method: 'POST',
    url: '/settings/cloudflare/configure',
    headers: { authorization: 'Bearer test' },
    payload: body,
  });
const clear = () =>
  app.inject({
    method: 'POST',
    url: '/settings/cloudflare/clear',
    headers: { authorization: 'Bearer test' },
    payload: {},
  });

describe('CDN and tunnel transition integration', () => {
  it('rejects overlapping toggle/CDN changes under admission and retains the committed off choice after rollback', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    cloudflare.setCdnConfiguration.mockImplementationOnce(() => blocked);
    const pending = configure();
    void pending.then(() => {});
    await vi.waitFor(() => expect(cloudflare.setCdnConfiguration).toHaveBeenCalled());
    const conflict = await app.inject({
      method: 'POST',
      url: '/settings/cloudflare/tunnel/toggle',
      headers: { authorization: 'Bearer test' },
      payload: { isEnabled: false },
    });
    expect(conflict.statusCode).toBe(409);
    expect(settings.isCloudflareTunnelEnabled).toBe(true);
    const duplicate = await configure();
    expect(duplicate.statusCode).toBe(409);
    release();
    expect((await pending).statusCode).toBe(200);
    const off = await app.inject({
      method: 'POST',
      url: '/settings/cloudflare/tunnel/toggle',
      headers: { authorization: 'Bearer test' },
      payload: { isEnabled: false },
    });
    expect(off.statusCode).toBe(200);
    cloudflare.resetCdn.mockRejectedValueOnce(new Error('failure'));
    expect((await clear()).statusCode).toBe(400);
    expect(settings.isCloudflareTunnelEnabled).toBe(false);
  });
  it('does not commit new-zone credentials or a name when old-zone cleanup fails', async () => {
    await configure();
    settings.isCloudflareTunnelEnabled = false;
    cloudflare.resetCdn.mockRejectedValueOnce(new Error('old zone failure'));
    const response = await configure({
      ...payload,
      cloudflareZoneId: 'new-zone',
      cloudflareGlobalApiKey: 'new-key',
      cloudflareTunnelName: 'New Name',
    });
    expect(response.statusCode).toBe(400);
    expect(settings).toMatchObject({
      cloudflareZoneId: 'zone',
      cloudflareGlobalApiKey: 'key',
      cloudflareTunnelName: 'My Named Tunnel',
      isCloudflareTunnelEnabled: false,
    });
  });
  it.each([true, false])(
    'saves the modal name and reconciles while preserving tunnel preference %s',
    async (enabled) => {
      settings.isCloudflareTunnelEnabled = enabled;
      const response = await configure();
      expect(response.statusCode).toBe(200);
      expect(settings).toMatchObject({
        isCloudflareCdnEnabled: true,
        isCloudflareTunnelEnabled: enabled,
        cloudflareTunnelName: 'My Named Tunnel',
        cloudflareGlobalApiKey: 'key',
      });
      expect(response.json()).toMatchObject({
        settingsSaved: true,
        isCloudflareTunnelEnabled: enabled,
        tunnel: { mode: enabled ? 'named' : 'none', status: enabled ? 'running' : 'stopped' },
      });
      expect(mocks.operation).toHaveBeenCalledExactlyOnceWith('reconcile');
    }
  );
  it.each([true, false])(
    'restores DNS before clearing credentials; quick creation follows preference %s',
    async (enabled) => {
      await configure();
      mocks.operation.mockClear();
      settings.isCloudflareTunnelEnabled = enabled;
      const response = await clear();
      expect(response.statusCode).toBe(200);
      expect(mocks.operation.mock.calls.map(([operation]) => operation)).toEqual([
        'prepare_cdn_clear',
        'reconcile',
      ]);
      expect(settings).toMatchObject({
        isCloudflareCdnEnabled: false,
        isCloudflareTunnelEnabled: enabled,
        cloudflareGlobalApiKey: '',
        cloudflareTunnelName: enabled ? 'new-generated-quick' : 'My Named Tunnel',
      });
      expect(response.json().tunnel.mode).toBe(enabled ? 'quick' : 'none');
    }
  );
  it.each([undefined, '', '  ', null, 'https://invalid', 'x'.repeat(101)])(
    'rejects invalid modal name %s before changing anything',
    async (name) => {
      const response = await configure({ ...payload, cloudflareTunnelName: name });
      expect(response.statusCode).toBe(400);
      expect(settings.cloudflareTunnelName).toBe('old-quick');
      expect(mocks.credentials).not.toHaveBeenCalled();
      expect(mocks.operation).not.toHaveBeenCalled();
    }
  );
  it('does not save or reconcile after CDN validation fails', async () => {
    mocks.credentials.mockResolvedValue(false);
    expect((await configure()).statusCode).toBe(400);
    expect(settings.cloudflareTunnelName).toBe('old-quick');
    expect(mocks.operation).not.toHaveBeenCalled();
  });
  it('reports a persisted CDN configuration followed by connector failure as a partial save', async () => {
    mocks.operation.mockResolvedValue({ mode: 'named', status: 'error', name: '' });
    const response = await configure();
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      isError: true,
      settingsSaved: true,
      isCloudflareCdnEnabled: true,
      cloudflareTunnelName: 'My Named Tunnel',
    });
    expect(response.body).not.toContain('"cloudflareGlobalApiKey"');
  });
  it('reconciles saved settings even when post-save invalidation fails', async () => {
    cloudflare.purgeEntireCacheWithCredentials
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('private-key'));
    const response = await configure();
    expect(response.statusCode).toBe(502);
    expect(response.json().settingsSaved).toBe(true);
    expect(mocks.operation).toHaveBeenCalledWith('reconcile');
    expect(response.body).not.toContain('private-key');
  });
  it('retains named configuration and does not reconcile if DNS restoration fails', async () => {
    await configure();
    mocks.operation.mockReset();
    mocks.operation.mockRejectedValue(new Error('private-key'));
    const response = await clear();
    expect(response.statusCode).toBe(400);
    expect(settings).toMatchObject({
      isCloudflareCdnEnabled: true,
      cloudflareTunnelName: 'My Named Tunnel',
      cloudflareGlobalApiKey: 'key',
    });
    expect(mocks.operation.mock.calls.map(([operation]) => operation)).toEqual([
      'prepare_cdn_clear',
    ]);
    expect(response.body).not.toContain('private-key');
  });
});
