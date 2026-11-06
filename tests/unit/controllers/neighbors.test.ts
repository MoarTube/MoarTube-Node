import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ config: undefined as unknown }));
vi.mock('@/config/index.js', async (original) => ({
  ...(await original<typeof import('@/config/index.js')>()),
  getConfig: () => state.config,
}));
import { Config } from '@/config/index.js';
import { NodeSettingsSchema } from '@/config/schema.js';
import { SettingsService } from '@/services/settings.js';
import { settingsRoutes } from '@/routes/settings.js';

it('authenticates and validates neighbors changes and persists ordered arrays without changing other settings', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-neighbors-'));
  const file = path.join(directory, '_node_settings.json');
  const initial = NodeSettingsSchema.parse({
    nodeListeningPort: 9090,
    username: 'user',
    password: 'password',
    nodeName: 'Node name',
    nodeHeadline: 'Headline',
    nodeAbout: 'About',
    nodeBulletin: ['Keep the bulletin'],
    databaseConfig: { databaseDialect: 'sqlite' },
    storageConfig: { storageMode: 'filesystem' },
  });
  expect(initial.nodeNeighbors).toEqual([]);
  fs.writeFileSync(file, JSON.stringify(initial));
  const config = Object.assign(Object.create(Config.prototype), {
    _nodeSettings: initial,
    _paths: { nodeSettingsPath: file },
  }) as Config;
  state.config = config;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = new SettingsService(
    logger as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('optionalAuthenticate', (_request: unknown, _reply: unknown, done: () => void) =>
    done()
  );
  app.decorate(
    'authenticate',
    (
      request: { headers: { authorization?: string } },
      reply: { code: (code: number) => { send: (body: object) => unknown } },
      done: () => void
    ) => {
      if (request.headers.authorization !== 'Bearer token')
        return reply.code(401).send({ isError: true });
      done();
    }
  );
  await app.register(
    (scope, _options, done) => {
      settingsRoutes(
        scope as never,
        { resolve: (key: string) => (key === 'settingsService' ? service : {}) } as never
      );
      done();
    },
    { prefix: '/settings' }
  );
  const update = (nodeNeighbors: unknown, authorized = true) =>
    app.inject({
      method: 'POST',
      url: '/settings/personalize/neighbors',
      payload: { nodeNeighbors },
      headers: authorized ? { authorization: 'Bearer token' } : {},
    });
  try {
    expect(
      (await update([{ url: 'https://rivet.tube', description: 'Denied' }], false)).statusCode
    ).toBe(401);
    for (const invalid of [
      null,
      'text',
      {},
      [42],
      ['text'],
      [{ url: 'javascript:alert(1)', description: 'Bad protocol' }],
      [{ url: 'ftp://rivet.tube', description: 'Bad protocol' }],
      [{ url: 'data:text/html,Hello', description: 'Bad protocol' }],
      [{ url: '//rivet.tube', description: 'No protocol' }],
      [{ url: 'rivet.tube', description: 'No protocol' }],
      [{ description: 'Missing URL' }],
      [{ url: 'https://rivet.tube' }],
      [{ url: 'https://rivet.tube', description: ' ' }],
      [{ url: 'https://rivet.tube/' + 'x'.repeat(2048), description: 'Long URL' }],
      [{ url: 'https://rivet.tube', description: 'x'.repeat(1001) }],
      Array(51).fill({ url: 'https://rivet.tube', description: 'Neighbor' }),
    ]) {
      expect((await update(invalid)).statusCode).toBe(400);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).nodeNeighbors).toEqual([]);
    }
    for (const entries of [
      [
        { url: ' https://rivet.tube ', description: ' Indie film and art ' },
        { url: 'http://localhost:9090', description: '<b>Plain text</b>' },
      ],
      [{ url: 'https://gearhead.tube', description: 'Replacement' }],
      [],
    ]) {
      const response = await update(entries);
      const expected = entries.map((item) => ({
        url: item.url.trim(),
        description: item.description.trim(),
      }));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ isError: false, nodeNeighbors: expected });
      config.reloadNodeSettings(true);
      expect(config.nodeSettings.nodeNeighbors).toEqual(expected);
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
        ...initial,
        nodeNeighbors: expected,
      });
      const settings = await app.inject({
        url: '/settings/',
        headers: { authorization: 'Bearer token' },
      });
      expect(settings.statusCode).toBe(200);
      expect(settings.json().nodeSettings.nodeNeighbors).toEqual(expected);
    }
    service.updateNodeSettings({ nodeNeighbors: [{ url: ' https://neighbor.test ', description: ' Neighbor ' }] });
    expect(config.nodeSettings.nodeNeighbors).toEqual([{ url: 'https://neighbor.test', description: 'Neighbor' }]);
    const beforeFailure = fs.readFileSync(file, 'utf8');
    const save = vi.spyOn(config, 'updateNodeSettings').mockImplementation(() => {
      throw new Error('Disk write failed');
    });
    try {
      const response = await update([]);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ isError: true, message: 'Unable to save neighbors' });
      expect(fs.readFileSync(file, 'utf8')).toBe(beforeFailure);
    } finally {
      save.mockRestore();
    }
  } finally {
    await app.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
