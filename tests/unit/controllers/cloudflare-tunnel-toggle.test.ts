import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ config: vi.fn(), operation: vi.fn() }));
vi.mock('@/config/index.js', () => ({ getConfig: mocks.config }));
vi.mock('@/services/cloudflare-tunnel-runtime.js', () => ({
  requestTunnelOperation: mocks.operation,
}));
import { settingsRoutes } from '@/routes/settings.js';
import { withSettingsChange } from '@/utils/settings-change.js';

let app: FastifyInstance;
let directory: string;
let filename: string;
let config: {
  paths: { nodeSettingsPath: string };
  nodeSettings: Record<string, unknown>;
  reloadNodeSettings: () => void;
  updateNodeSettings: (updates: object) => void;
};

beforeEach(async () => {
  vi.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-toggle-test-'));
  filename = path.join(directory, 'settings.json');
  fs.writeFileSync(
    filename,
    JSON.stringify({
      isCloudflareTunnelEnabled: true,
      isCloudflareCdnEnabled: false,
      cloudflareTunnelName: 'saved-name',
      cloudflareGlobalApiKey: 'private-key',
      nodeName: 'Keep me',
    })
  );
  config = {
    paths: { nodeSettingsPath: filename },
    nodeSettings: {},
    reloadNodeSettings: () => {
      config.nodeSettings = JSON.parse(fs.readFileSync(filename, 'utf8'));
    },
    updateNodeSettings: (updates) => {
      config.nodeSettings = { ...config.nodeSettings, ...updates };
      fs.writeFileSync(filename, JSON.stringify(config.nodeSettings));
    },
  };
  config.reloadNodeSettings();
  mocks.config.mockReturnValue(config);
  mocks.operation.mockImplementation(async () => {
    // The lifecycle can acquire the writer lock: the handler must release it before IPC.
    await withSettingsChange(filename, () => Promise.resolve());
    return config.nodeSettings.isCloudflareTunnelEnabled
      ? {
          mode: config.nodeSettings.isCloudflareCdnEnabled ? 'named' : 'quick',
          status: 'running',
          name: 'saved-name',
        }
      : { mode: 'none', status: 'stopped', name: '' };
  });
  app = Fastify();
  app.decorate('optionalAuthenticate', async () => {});
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate(
    'authenticate',
    async (
      request: { headers: { authorization?: string } },
      reply: { code: (code: number) => { send: (body: object) => unknown } }
    ) => {
      if (request.headers.authorization !== 'Bearer test-token')
        return reply.code(401).send({ isError: true });
    }
  );
  await app.register(
    async (scope) => {
      settingsRoutes(scope as never, { resolve: () => ({}) } as never);
    },
    { prefix: '/settings' }
  );
});
afterEach(async () => {
  await app.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
const toggle = (value: unknown, authenticated = true) =>
  app.inject({
    method: 'POST',
    url: '/settings/cloudflare/tunnel/toggle',
    headers: authenticated ? { authorization: 'Bearer test-token' } : {},
    payload: { isEnabled: value },
  });

describe('authenticated tunnel toggle', () => {
  it('returns an empty saved-name field for old settings on success and failed IPC',async()=>{
    config.updateNodeSettings({cloudflareTunnelName:undefined});
    expect((await toggle(false)).json().cloudflareTunnelName).toBe('');
    mocks.operation.mockRejectedValue(new Error('IPC lost'));
    expect((await toggle(true)).json()).toMatchObject({settingsSaved:true,cloudflareTunnelName:''});
  });
  it.each([false, true])(
    'stops/re-enables with CDN %s and preserves names and credentials',
    async (cdn) => {
      config.updateNodeSettings({ isCloudflareCdnEnabled: cdn });
      const off = await toggle(false);
      expect(off.statusCode).toBe(200);
      expect(off.json()).toMatchObject({
        settingsSaved: true,
        isCloudflareTunnelEnabled: false,
        tunnel: { status: 'stopped' },
      });
      config.reloadNodeSettings();
      expect(config.nodeSettings).toMatchObject({
        cloudflareTunnelName: 'saved-name',
        nodeName: 'Keep me',
        cloudflareGlobalApiKey: 'private-key',
        isCloudflareCdnEnabled: cdn,
      });
      const on = await toggle(true);
      expect(on.statusCode).toBe(200);
      expect(on.json().tunnel.mode).toBe(cdn ? 'named' : 'quick');
      expect(on.body).not.toContain('private-key');
      expect(mocks.operation).toHaveBeenCalledWith('reconcile');
    }
  );
  it('requires authentication before changing preferences', async () => {
    expect((await toggle(false, false)).statusCode).toBe(401);
    expect(mocks.operation).not.toHaveBeenCalled();
    config.reloadNodeSettings();
    expect(config.nodeSettings.isCloudflareTunnelEnabled).toBe(true);
  });
  it.each(['false', 0, null])('rejects nonboolean toggle %s', async (input) => {
    expect((await toggle(input)).statusCode).toBe(400);
    expect(mocks.operation).not.toHaveBeenCalled();
  });
  it('returns a partial save when the connector cannot reach the requested state', async () => {
    mocks.operation.mockResolvedValue({ mode: 'quick', status: 'error', name: '' });
    const response = await toggle(false);
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      isError: true,
      settingsSaved: true,
      isCloudflareTunnelEnabled: false,
    });
    config.reloadNodeSettings();
    expect(config.nodeSettings.isCloudflareTunnelEnabled).toBe(false);
  });
  it('keeps a saved preference after IPC failure and sanitizes the error', async () => {
    mocks.operation.mockRejectedValue(new Error('private-key'));
    const response = await toggle(false);
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain('private-key');
    expect(response.json()).toMatchObject({
      settingsSaved: true,
      isCloudflareTunnelEnabled: false,
    });
  });
  it('reports lock conflicts without saving or requesting lifecycle work', async () => {
    const lock = new Database(filename + '.change-lock.sqlite');
    lock.exec('BEGIN IMMEDIATE');
    try {
      const response = await toggle(false);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        settingsSaved: false,
        isCloudflareTunnelEnabled: true,
      });
      expect(mocks.operation).not.toHaveBeenCalled();
    } finally {
      lock.close();
    }
  });
  it('reports persistence failure and leaves the connector untouched', async () => {
    vi.spyOn(config, 'updateNodeSettings').mockImplementation(() => {
      throw new Error('disk path private-key');
    });
    const response = await toggle(false);
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      settingsSaved: false,
      isCloudflareTunnelEnabled: true,
    });
    expect(response.body).not.toContain('private-key');
    expect(mocks.operation).not.toHaveBeenCalled();
  });
});
