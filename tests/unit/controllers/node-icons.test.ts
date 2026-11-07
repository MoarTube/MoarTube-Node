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

it('authenticates and validates icon changes and persists ordered arrays without changing other settings', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-links-'));
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
  expect(initial.nodeIcons).toBeUndefined();
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
    { purgeHomePage: vi.fn(async () => {}) } as never
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
        { resolve: (key: string) => (key === 'settingsService' ? service : { purgeAllWatchPages: vi.fn(async () => {}), purgeHomePage: vi.fn(async () => {}) }) } as never
      );
      done();
    },
    { prefix: '/settings' }
  );
  const update = (nodeIcons: unknown, authorized = true) =>
    app.inject({
      method: 'POST',
      url: '/settings/personalize/icons',
      payload: { nodeIcons },
      headers: authorized ? { authorization: 'Bearer token' } : {},
    });
  try {
    expect(
      (await update([{ url: 'https://rivet.tube', svgGraphic: '<svg/>' }], false)).statusCode
    ).toBe(401);
    for (const invalid of [
      null,
      'text',
      {},
      [42],
      ['text'],
      [{ url: 'javascript:alert(1)', svgGraphic: 'Bad protocol' }],
      [{ url: 'ftp://rivet.tube', svgGraphic: 'Bad protocol' }],
      [{ url: 'data:text/html,Hello', svgGraphic: 'Bad protocol' }],
      [{ url: '//rivet.tube', svgGraphic: 'No protocol' }],
      [{ url: 'rivet.tube', svgGraphic: 'No protocol' }],
      [{ svgGraphic: 'Missing URL' }],
      [{ url: 'https://rivet.tube' }],
      [{ url: 'https://rivet.tube', svgGraphic: ' ' }],
      [{ url: 'https://rivet.tube/' + 'x'.repeat(2048), svgGraphic: 'Long URL' }],
      [{ url: 'https://rivet.tube', svgGraphic: 'x'.repeat(50001) }],
      Array(51).fill({ url: 'https://rivet.tube', svgGraphic: '<svg/>' }),
    ]) {
      expect((await update(invalid)).statusCode).toBe(400);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).nodeIcons).toBeUndefined();
    }
    for (const entries of [
      [
        { url: ' https://rivet.tube ', svgGraphic: '<svg/>' },
        { url: 'http://localhost:9090', svgGraphic: '<svg/>' },
      ],
      [{ url: 'https://gearhead.tube', svgGraphic: '<svg/>' }],
      [],
    ]) {
      const response = await update(entries);
      const expected = entries.map((item) => ({
        url: item.url.trim(),
        svgGraphic: item.svgGraphic.trim(),
      }));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ isError: false, nodeIcons: expected });
      config.reloadNodeSettings(true);
      expect(config.nodeSettings.nodeIcons).toEqual(expected);
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
        ...initial,
        nodeIcons: expected,
      });
      const settings = await app.inject({
        url: '/settings/',
        headers: { authorization: 'Bearer token' },
      });
      expect(settings.statusCode).toBe(200);
      expect(settings.json().nodeSettings.nodeIcons).toEqual(expected);
    }
    service.updateNodeSettings({ nodeIcons: [{ url: ' https://link.test ', svgGraphic: '<svg/>' }] });
    expect(config.nodeSettings.nodeIcons).toEqual([{ url: 'https://link.test', svgGraphic: '<svg/>' }]);
    const beforeFailure = fs.readFileSync(file, 'utf8');
    const save = vi.spyOn(config, 'updateNodeSettings').mockImplementation(() => {
      throw new Error('Disk write failed');
    });
    try {
      const response = await update([]);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ isError: true, message: 'Unable to save icons' });
      expect(fs.readFileSync(file, 'utf8')).toBe(beforeFailure);
    } finally {
      save.mockRestore();
    }
  } finally {
    await app.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
