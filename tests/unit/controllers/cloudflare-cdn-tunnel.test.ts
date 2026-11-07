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
import { SettingsService } from '@/services/settings.js';
import { withJobAdmission } from '@/utils/distribution-admission.js';
import { buildExternalVideosBaseUrl } from '@/config/urls.js';

let app: FastifyInstance;
let directory: string;
let settings: Record<string, unknown>;
let videoRecords: object[];
const rewriteS3 = vi.fn();
let cloudflare: Record<string, ReturnType<typeof vi.fn>>;
const payload = {
  cloudflareEmailAddress: 'email@example.com',
  cloudflareZoneId: 'zone',
  cloudflareGlobalApiKey: 'key',
};

beforeEach(async () => {
  vi.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-cdn-test-'));
  videoRecords = [];
  settings = {
    isCloudflareTunnelEnabled: true,
    isCloudflareCdnEnabled: false,
    cloudflareTunnelName: 'old-quick',
    cloudflareEmailAddress: '',
    cloudflareZoneId: '',
    cloudflareGlobalApiKey: '',
    publicNodeProtocol: 'http',
    publicNodePort: 9090,
    publicNodeAddress: 'node.example.com',
    storageConfig: { storageMode: 'filesystem' },
  };
  const config = {
    paths: {
      nodeSettingsPath: path.join(directory, 'settings.json'),
      videosDirectoryPath: directory,
      dataDirectoryPath: directory,
    },
    get nodeSettings() {
      return { ...settings };
    },
    reloadNodeSettings: vi.fn(),
    updateNodeSettings: (updates: object) => {
      settings = { ...settings, ...updates };
    },
    getExternalVideosBaseUrl: () => buildExternalVideosBaseUrl(settings as never),
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
  const service = new SettingsService(
    { info: vi.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  cloudflare = {
    captureCdnSnapshot: vi.fn().mockResolvedValue({ rules: null, settings: [] }),
    managedCdnSnapshot: vi.fn().mockReturnValue({ rules: [], settings: [] }),
    verifyCdnChange: vi.fn().mockResolvedValue(undefined),
    verifyCdnSnapshot: vi.fn().mockResolvedValue(undefined),
    restoreCdnSnapshot: vi.fn().mockResolvedValue(undefined),
    retryPendingPurges: vi.fn().mockResolvedValue(undefined),
    resolveCdnPublicAddress: vi.fn().mockResolvedValue('node.example.com'),
    validateCdnConfiguration: vi.fn().mockResolvedValue(undefined),
    withConfigurationRollback: vi.fn(async (_email, _zone, _key, operation) => operation()),
    setCdnConfiguration: vi.fn().mockResolvedValue(undefined),
    addCdnDnsRecord: vi.fn().mockResolvedValue(undefined),
    purgeEntireCacheWithCredentials: vi.fn().mockResolvedValue(undefined),
    resetCdn: vi.fn().mockResolvedValue(undefined),
    purgeAdaptiveVideos: vi.fn().mockResolvedValue(undefined),
    purgeWatchPages: vi.fn().mockResolvedValue(undefined),
    purgeVideo: vi.fn().mockResolvedValue(undefined),
  };
  const services: Record<string, object> = {
    settingsService: service,
    cloudflareService: cloudflare,
    videosService: {
      getAllVideosData: async () => videoRecords,
      rewriteS3VideoManifests: rewriteS3,
    },
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

import { readCdnJournal, writeCdnJournal, hasPendingCdn } from '@/utils/cdn-journal.js';
import {
  withMediaWrite,
  beginRemoteWrite,
  finishRemoteWrite,
} from '@/utils/distribution-admission.js';
const journal = () => readCdnJournal(mocks.config().paths.nodeSettingsPath);
const retry = (transitionId = journal().current?.id) =>
  app.inject({
    method: 'POST',
    url: '/settings/cloudflare/retry',
    headers: { authorization: 'Bearer test' },
    payload: { transitionId },
  });

describe('durable CDN lifecycle', () => {
  it('adopts the root over HTTPS, generates fresh configuration names, preserves the backup, and restores provider and public settings on removal', async () => {
    const before = {
      publicNodeProtocol: settings.publicNodeProtocol,
      publicNodeAddress: settings.publicNodeAddress,
      publicNodePort: settings.publicNodePort,
    };
    cloudflare.resolveCdnPublicAddress.mockResolvedValue('example.com');
    expect((await configure()).statusCode).toBe(200);
    const name = settings.cloudflareTunnelName;
    expect(settings).toMatchObject({
      publicNodeProtocol: 'https',
      publicNodeAddress: 'example.com',
      publicNodePort: 443,
      cloudflarePublicAddressBackup: before,
      cloudflareAddressMigrationPending: false,
    });
    expect((await configure()).statusCode).toBe(200);
    expect(settings.cloudflareTunnelName).not.toBe(name);
    expect(settings.cloudflarePublicAddressBackup).toEqual(before);
    expect(cloudflare.captureCdnSnapshot).toHaveBeenCalledOnce();
    expect((await clear()).statusCode).toBe(200);
    expect(settings).toMatchObject({
      ...before,
      isCloudflareCdnEnabled: false,
      cloudflarePublicAddressBackup: null,
      cloudflareAddressMigrationPending: false,
    });
    expect(cloudflare.restoreCdnSnapshot).toHaveBeenCalledWith(
      {
        email: payload.cloudflareEmailAddress,
        zone: payload.cloudflareZoneId,
        key: payload.cloudflareGlobalApiKey,
      },
      { rules: null, settings: [] },
      { rules: [], settings: [] }
    );
    expect(journal().originals).toEqual({});
    expect(journal().current).toMatchObject({ stage: 'complete', source: null, target: null });
  });

  it.each([
    'capture',
    'provider',
    'dns',
    'settings',
    'media',
    'purge',
    'outbox',
    'tunnel',
    'completion',
  ])(
    'retains intent and blocks jobs after an enable failure in %s, then retries the same identity',
    async (stage) => {
      const failure = new Error('injected failure');
      if (stage === 'capture') cloudflare.captureCdnSnapshot.mockRejectedValueOnce(failure);
      if (stage === 'provider') cloudflare.setCdnConfiguration.mockRejectedValueOnce(failure);
      if (stage === 'dns') cloudflare.addCdnDnsRecord.mockRejectedValueOnce(failure);
      if (stage === 'purge')
        cloudflare.purgeEntireCacheWithCredentials.mockRejectedValueOnce(failure);
      if (stage === 'outbox') cloudflare.retryPendingPurges.mockRejectedValueOnce(failure);
      if (stage === 'tunnel') mocks.operation.mockRejectedValueOnce(failure);
      if (stage === 'settings' || stage === 'completion') {
        const config = mocks.config();
        const update = config.updateNodeSettings;
        let failed = false;
        config.updateNodeSettings = (data: Record<string, unknown>) => {
          if (
            !failed &&
            ((stage === 'settings' && data.isCloudflareCdnEnabled === true) ||
              (stage === 'completion' && data.cloudflareAddressMigrationPending === false))
          ) {
            failed = true;
            throw failure;
          }
          update(data);
        };
      }
      if (stage === 'media') {
        videoRecords = [{ videoId: 'video', outputs: { m3u8: ['720p'] } }];
        fs.mkdirSync(path.join(directory, 'video', 'adaptive', 'm3u8', 'manifest-720p.m3u8'), {
          recursive: true,
        });
      }
      const response = await configure();
      expect(response.statusCode).toBe(502);
      const transition = journal().current!;
      expect(transition.targetEnabled).toBe(true);
      expect(response.json().cdnTransition.id).toBe(transition.id);
      expect(response.json().cloudflareAddressMigrationPending).toBe(true);
      await expect(withJobAdmission(async () => {})).rejects.toThrow('retry');
      expect((await configure()).statusCode).toBe(409);
      expect((await clear()).statusCode).toBe(409);
      if (stage === 'media')
        fs.rmdirSync(path.join(directory, 'video', 'adaptive', 'm3u8', 'manifest-720p.m3u8'));
      expect((await retry()).statusCode).toBe(200);
      expect(journal().current).toMatchObject({
        id: transition.id,
        tunnelName: transition.tunnelName,
        stage: 'complete',
      });
      expect(settings.cloudflareAddressMigrationPending).toBe(false);
    }
  );

  it.each(['provider', 'settings', 'media', 'purge', 'outbox', 'tunnel'])(
    'retries failed removal in %s using retained old-zone credentials',
    async (stage) => {
      await configure();
      const failure = new Error('removal failure');
      if (stage === 'provider') cloudflare.restoreCdnSnapshot.mockRejectedValueOnce(failure);
      if (stage === 'purge')
        cloudflare.purgeEntireCacheWithCredentials.mockRejectedValueOnce(failure);
      if (stage === 'outbox') cloudflare.retryPendingPurges.mockRejectedValueOnce(failure);
      if (stage === 'tunnel')
        mocks.operation
          .mockImplementationOnce(async () => ({
            mode: 'named',
            status: 'running',
            name: settings.cloudflareTunnelName,
          }))
          .mockRejectedValueOnce(failure);
      if (stage === 'settings') {
        const config = mocks.config();
        const update = config.updateNodeSettings;
        let failed = false;
        config.updateNodeSettings = (data: Record<string, unknown>) => {
          if (!failed && data.isCloudflareCdnEnabled === false) {
            failed = true;
            throw failure;
          }
          update(data);
        };
      }
      if (stage === 'media') {
        videoRecords = [{ videoId: 'video', outputs: { m3u8: ['720p'] } }];
        fs.mkdirSync(path.join(directory, 'video', 'adaptive', 'm3u8', 'manifest-720p.m3u8'), {
          recursive: true,
        });
      }
      expect((await clear()).statusCode).toBe(502);
      const transition = journal().current!;
      expect(transition.targetEnabled).toBe(false);
      expect(transition.source).toMatchObject({
        zone: payload.cloudflareZoneId,
        key: payload.cloudflareGlobalApiKey,
      });
      expect(settings.cloudflarePublicAddressBackup).not.toBeNull();
      expect((await configure({ ...payload, cloudflareZoneId: 'other' })).statusCode).toBe(409);
      if (stage === 'media')
        fs.rmdirSync(path.join(directory, 'video', 'adaptive', 'm3u8', 'manifest-720p.m3u8'));
      cloudflare.purgeEntireCacheWithCredentials.mockClear();
      expect((await retry()).statusCode).toBe(200);
      if (stage !== 'tunnel')
        expect(cloudflare.purgeEntireCacheWithCredentials).toHaveBeenCalledWith(
          payload.cloudflareEmailAddress,
          payload.cloudflareZoneId,
          payload.cloudflareGlobalApiKey
        );
      expect(settings.cloudflarePublicAddressBackup).toBeNull();
      expect(journal().current).toMatchObject({ id: transition.id, stage: 'complete' });
    }
  );

  it('retains the final old-zone purge intent in the saved removal state before media migration finishes', async () => {
    await configure();
    videoRecords = [{ videoId: 'video', outputs: { m3u8: ['720p'] } }];
    fs.mkdirSync(path.join(directory, 'video', 'adaptive', 'm3u8', 'manifest-720p.m3u8'), {
      recursive: true,
    });
    expect((await clear()).statusCode).toBe(502);
    expect(settings.cloudflareZoneId).toBe('');
    const persisted = journal();
    expect(persisted.current).toMatchObject({
      stage: 'media',
      source: { zone: 'zone', key: 'key' },
    });
    // Reloading the journal after the interruption retains the obligation independently of settings/outbox.
    fs.rmdirSync(path.join(directory, 'video', 'adaptive', 'm3u8', 'manifest-720p.m3u8'));
    cloudflare.purgeEntireCacheWithCredentials.mockClear();
    expect((await retry(persisted.current!.id)).statusCode).toBe(200);
    expect(cloudflare.purgeEntireCacheWithCredentials).toHaveBeenCalledWith(
      'email@example.com',
      'zone',
      'key'
    );
  });

  it('makes completed retries no-ops and rejects stale, missing, superseded and unauthorized IDs', async () => {
    expect(
      (await app.inject({ method: 'POST', url: '/settings/cloudflare/retry', payload: {} }))
        .statusCode
    ).toBe(401);
    expect((await retry('old')).statusCode).toBe(409);
    expect((await retry(undefined)).statusCode).toBe(400);
    await configure();
    const previous = journal().current!.id;
    const before = cloudflare.retryPendingPurges.mock.calls.length;
    cloudflare.retryPendingPurges.mockRejectedValue(new Error('must not execute'));
    expect((await retry(previous)).statusCode).toBe(200);
    expect(cloudflare.retryPendingPurges).toHaveBeenCalledTimes(before);
    cloudflare.retryPendingPurges.mockResolvedValue(undefined);
    await configure();
    expect((await retry(previous)).statusCode).toBe(409);
  });

  it.each([false, true])(
    'preserves tunnel preference %s across both directions',
    async (preference) => {
      settings.isCloudflareTunnelEnabled = preference;
      expect((await configure()).statusCode).toBe(200);
      expect((await clear()).statusCode).toBe(200);
      expect(settings.isCloudflareTunnelEnabled).toBe(preference);
    }
  );

  it.each(['isImporting', 'isPublishing', 'isStreaming', 'draining'])(
    'refuses transitions while %s is active',
    async (activity) => {
      videoRecords = [
        { [activity]: true, meta: activity === 'draining' ? { streamCleanupAt: Date.now() } : {} },
      ];
      expect((await configure()).statusCode).toBe(400);
      expect((await clear()).statusCode).toBe(400);
      expect(journal().current).toBeNull();
    }
  );

  it('blocks a transition during live HTTP writes and rejects writes while recovery is pending', async () => {
    await withMediaWrite(async () => {
      expect((await configure()).statusCode).toBe(409);
    });
    cloudflare.setCdnConfiguration.mockRejectedValueOnce(new Error('failure'));
    await configure();
    await expect(withMediaWrite(async () => {})).rejects.toThrow('retry');
  });

  it('keeps remote write leases across restart, releases only after finish, and rejects late admission after finish', async () => {
    await beginRemoteWrite('video', 'write');
    expect((await configure()).statusCode).toBe(409);
    finishRemoteWrite('video', 'write');
    await expect(beginRemoteWrite('video', 'write')).rejects.toThrow('already finished');
    expect((await configure()).statusCode).toBe(200);
  });

  it('does not silently repair a legacy pending migration or an unknown original provider snapshot', async () => {
    settings.cloudflareAddressMigrationPending = true;
    expect((await configure()).statusCode).toBe(409);
    expect((await retry('legacy')).statusCode).toBe(409);
    settings.cloudflareAddressMigrationPending = false;
    settings.isCloudflareCdnEnabled = true;
    settings.cloudflareZoneId = 'zone';
    settings.cloudflareGlobalApiKey = 'key';
    settings.cloudflareEmailAddress = 'email';
    expect((await clear()).statusCode).toBe(502);
    expect(hasPendingCdn(mocks.config().paths.nodeSettingsPath)).toBe(true);
  });

  it('fails closed on unreadable journal state', async () => {
    fs.writeFileSync(mocks.config().paths.nodeSettingsPath + '.cdn-private.json', '{broken');
    expect((await configure()).statusCode).toBe(409);
    await expect(withJobAdmission(async () => {})).rejects.toThrow('journal');
  });

  it('keeps the journal pending if the completion write fails after the summary flag was cleared', async () => {
    cloudflare.setCdnConfiguration.mockRejectedValueOnce(new Error('first failure'));
    await configure();
    const pathName = mocks.config().paths.nodeSettingsPath;
    const rename = fs.renameSync;
    let failed = false;
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (
        !failed &&
        String(target).endsWith('.cdn-private.json') &&
        JSON.parse(fs.readFileSync(source, 'utf8')).current.stage === 'complete'
      ) {
        failed = true;
        throw new Error('disk unavailable');
      }
      rename(source, target);
    });
    try {
      expect((await retry()).statusCode).toBe(502);
    } finally {
      spy.mockRestore();
    }
    expect(settings.cloudflareAddressMigrationPending).toBe(false);
    expect(hasPendingCdn(pathName)).toBe(true);
    await expect(withJobAdmission(async () => {})).rejects.toThrow('retry');
    expect((await retry()).statusCode).toBe(200);
  });
});

import { VideosController } from '@/controllers/videos.js';

it.each([false, 'offline'])(
  'rejects credentials before preparing a transition (%s)',
  async (failure) => {
    if (failure === false) mocks.credentials.mockResolvedValueOnce(false);
    else mocks.credentials.mockRejectedValueOnce(failure);
    expect((await configure()).statusCode).toBe(400);
    expect(journal().current).toBeNull();
  }
);
it('rejects malformed configure calls and direct retry calls without an ID', async () => {
  expect((await configure({})).statusCode).toBe(400);
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/settings/cloudflare/retry',
        headers: { authorization: 'Bearer test' },
        payload: {},
      })
    ).statusCode
  ).toBe(400);
});
it('refuses distribution edits during pending recovery and refuses a changed storage origin on retry', async () => {
  cloudflare.setCdnConfiguration.mockRejectedValueOnce(new Error('pending'));
  await configure();
  const response = await app.inject({
    method: 'POST',
    url: '/settings/network/external',
    headers: { authorization: 'Bearer test' },
    payload: { publicNodeProtocol: 'http', publicNodeAddress: 'new.test', publicNodePort: 80 },
  });
  expect(response.json().message).toMatch(/pending/);
  settings.storageConfig = {
    storageMode: 's3provider',
    s3Config: { bucketName: 'new', s3ProviderClientConfig: { region: 'region' } },
  };
  expect((await retry()).statusCode).toBe(502);
  expect(journal().current?.stage).toBe('provider');
});
it('refuses an enable on an untracked legacy zone rather than inventing original settings', async () => {
  settings.isCloudflareCdnEnabled = true;
  settings.cloudflareZoneId = 'zone';
  settings.cloudflareEmailAddress = 'email';
  settings.cloudflareGlobalApiKey = 'key';
  expect((await configure()).statusCode).toBe(502);
  expect(cloudflare.captureCdnSnapshot).not.toHaveBeenCalled();
});
it('rejects a stale running named connector and leaves recovery pending', async () => {
  mocks.operation.mockResolvedValueOnce({
    mode: 'named',
    status: 'running',
    name: 'previous-name',
  });
  expect((await configure()).statusCode).toBe(502);
  expect(journal().current?.stage).toBe('tunnel');
  expect((await retry()).statusCode).toBe(200);
});
it('detects preference changes between reconciliation and completion commit', async () => {
  const implementation = mocks.operation.getMockImplementation()!;
  mocks.operation.mockImplementationOnce(async (operation) => {
    const result = await implementation(operation);
    mocks
      .config()
      .reloadNodeSettings.mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        settings.isCloudflareTunnelEnabled = false;
      });
    return result;
  });
  expect((await configure()).statusCode).toBe(502);
  expect(hasPendingCdn(mocks.config().paths.nodeSettingsPath)).toBe(true);
  expect((await retry()).statusCode).toBe(200);
});
it('clears an initially disabled configuration with no tunnel name without inventing a name', async () => {
  settings.isCloudflareTunnelEnabled = false;
  delete settings.cloudflareTunnelName;
  expect((await clear()).statusCode).toBe(200);
  expect(journal().current?.tunnelName).toBe('');
});
it('releases transition admission even if the HTTP response never finishes', async () => {
  const controller = new SettingsController(
    {} as never,
    { getAllVideosData: async () => [] } as never,
    cloudflare as never,
    {} as never
  );
  const reply = {
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn(() => new Promise(() => {})),
  };
  void controller.cloudflareClear({} as never, reply as never);
  await vi.waitFor(() => expect(reply.send).toHaveBeenCalled());
  await expect(withJobAdmission(async () => 'free')).resolves.toBe('free');
});
it('rejects body-less private enable preparation without touching provider state', async () => {
  const controller = new SettingsController(
    {} as never,
    { getAllVideosData: async () => [] } as never,
    cloudflare as never,
    {} as never
  );
  const response = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
  await (
    controller as unknown as {
      runCdnChange: (reply: unknown, enabled: boolean) => Promise<unknown>;
    }
  ).runCdnChange(response, true);
  expect(response.send).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Cloudflare credentials are required.' })
  );
});
it('does not reconcile missing or out-of-order recovery state', async () => {
  delete settings.cloudflareTunnelName;
  const controller = new SettingsController(
    {} as never,
    {} as never,
    cloudflare as never,
    {} as never
  );
  const result = await (
    controller as unknown as { finishCloudflareChange: () => Promise<{ data: unknown }> }
  ).finishCloudflareChange();
  expect(result.data).toMatchObject({ isError: true });
});
it('fails closed if the saved transition disappears after admission', async () => {
  cloudflare.setCdnConfiguration.mockRejectedValueOnce(new Error('prepare'));
  await configure();
  let reads = 0;
  mocks.config().reloadNodeSettings.mockImplementation(() => {
    if (++reads === 2)
      writeCdnJournal(mocks.config().paths.nodeSettingsPath, {
        version: 1,
        current: null,
        originals: {},
      });
  });
  expect((await retry()).statusCode).toBe(502);
});
it('reports non-Error admission failures without releasing pending state', async () => {
  mocks.config().reloadNodeSettings.mockImplementationOnce(() => {
    throw 'unavailable';
  });
  expect((await configure()).statusCode).toBe(409);
});
it('guards HTTP uploads and releases remote write activity only after successful invalidation', async () => {
  const controller = new VideosController(
    { getVideo: vi.fn().mockResolvedValue({}) } as never,
    {} as never,
    {
      validateVideoUploadParams: () => true,
      trackProgress: vi.fn(),
      isValidVideoMimeType: () => true,
      getVideoDestinationPath: () => 'media',
      saveUploadedFile: vi.fn(),
    } as never,
    {
      retryPendingPurges: vi.fn(),
      purgePrefixes: vi.fn(),
      purgeVideo: vi.fn(),
      purgeWatchPages: vi.fn(),
      purgeHomePage: vi.fn(),
    } as never,
    {} as never
  );
  const reply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
  const params = { videoId: 'video' };
  const upload = {
    params,
    query: { format: 'm3u8', resolution: '720p', finalBatch: 'false' },
    parts: async function* () {
      yield { type: 'file', filename: 'playlist.m3u8', mimetype: 'application/x-mpegURL' };
    },
  };
  await controller.uploadVideo(upload as never, reply as never);
  expect(reply.send).toHaveBeenLastCalledWith(expect.objectContaining({ isError: false }));
  cloudflare.setCdnConfiguration.mockRejectedValueOnce(new Error('pending'));
  await configure();
  await controller.uploadVideo(upload as never, reply as never);
  expect(reply.status).toHaveBeenLastCalledWith(409);
  await retry();
  await controller.beginStorageActivity(
    { params, body: { activityId: 'write' } } as never,
    reply as never
  );
  expect(reply.status).toHaveBeenLastCalledWith(200);
  await controller.invalidateCache(
    { params, body: { activityId: 'write', paths: ['images/poster.jpg'] } } as never,
    reply as never
  );
  await controller.beginStorageActivity(
    { params, body: { activityId: 'another' } } as never,
    reply as never
  );
  await controller.invalidateCache(
    { params, body: { activityId: 'another' } } as never,
    reply as never
  );
  expect((await clear()).statusCode).toBe(200);
  await beginRemoteWrite('video', 'owned');
  await expect(beginRemoteWrite('different', 'owned')).rejects.toThrow('another video');
  finishRemoteWrite('video', 'owned');
  await controller.beginStorageActivity(
    { params, body: { activityId: 'write' } } as never,
    reply as never
  );
  expect(reply.status).toHaveBeenLastCalledWith(409);
});

it('rejects raw invalid configure bodies before attempting any provider work', async () => {
  const controller = new SettingsController(
    {} as never,
    {} as never,
    cloudflare as never,
    {} as never
  );
  const reply = {
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  await controller.cloudflareConfigure({ body: {} } as never, reply as never);
  expect(reply.status).toHaveBeenCalledWith(400);
});
it('releases a media lease when its SQLite read transaction cannot be opened', async () => {
  fs.writeFileSync(mocks.config().paths.nodeSettingsPath + '.media-lock.sqlite', 'not a database');
  await expect(withMediaWrite(async () => {})).rejects.toThrow();
});

import { spawnSync } from 'node:child_process';
import { rewindCdnAfterRestart } from '@/utils/cdn-journal.js';

it('recovers the final old-zone purge after a real process dies at the post-media purge boundary', async () => {
  await configure();
  const state = journal();
  const transition = state.current!;
  Object.assign(transition, {
    targetEnabled: false,
    stage: 'media',
    source: { email: 'email@example.com', zone: 'zone', key: 'key' },
    target: null,
    publicAddress: transition.originalAddress,
  });
  writeCdnJournal(mocks.config().paths.nodeSettingsPath, state);
  Object.assign(settings, transition.originalAddress, {
    cloudflareAddressMigrationPending: true,
    isCloudflareCdnEnabled: false,
    cloudflareEmailAddress: '',
    cloudflareZoneId: '',
    cloudflareGlobalApiKey: '',
    username: 'user',
    password: 'password',
    nodeListeningPort: 9090,
    databaseConfig: { databaseDialect: 'sqlite' },
  });
  const file = mocks.config().paths.nodeSettingsPath;
  fs.writeFileSync(file, JSON.stringify(settings));
  const marker = path.join(directory, 'purge-entered.json');
  const child = `
    import fs from 'node:fs';
    import path from 'node:path';
    import { Config } from './src/config/index.ts';
    import { NodeSettingsSchema } from './src/config/schema.ts';
    import { SettingsController } from './src/controllers/settings.ts';
    const file = process.argv[1], marker = process.argv[2], id = process.argv[3];
    const config = Object.assign(Object.create(Config.prototype), {
      _nodeSettings: NodeSettingsSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))),
      _paths: { nodeSettingsPath: file, videosDirectoryPath: path.dirname(file), dataDirectoryPath: path.dirname(file) }
    });
    Config.instance = config;
    const cloudflare = { purgeEntireCacheWithCredentials: async (email, zone, key) => {
      fs.writeFileSync(marker, JSON.stringify({ email, zone, key }));
      process.kill(process.pid, 'SIGTERM');
      await new Promise(() => {});
    }};
    const controller = new SettingsController({}, { getAllVideosData: async () => [] }, cloudflare, {});
    const reply = { header() { return this; }, status() { return this; }, send() { return this; } };
    await controller.cloudflareRetry({ body: { transitionId: id } }, reply);
  `;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', child, file, marker, transition.id],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 15000 }
  );
  expect(result.status, result.stderr).not.toBe(0);
  expect(fs.existsSync(marker), result.stderr).toBe(true);
  expect(JSON.parse(fs.readFileSync(marker, 'utf8'))).toEqual({
    email: 'email@example.com',
    zone: 'zone',
    key: 'key',
  });
  expect(journal().current).toMatchObject({ stage: 'purge', source: { zone: 'zone', key: 'key' } });
  rewindCdnAfterRestart(file);
  cloudflare.purgeEntireCacheWithCredentials.mockClear();
  expect((await retry()).statusCode).toBe(200);
  expect(cloudflare.purgeEntireCacheWithCredentials).toHaveBeenCalledWith(
    'email@example.com',
    'zone',
    'key'
  );
  expect(settings.cloudflareAddressMigrationPending).toBe(false);
}, 20000);

it('reapplies the saved public address and repeats invalidation when the summary settings diverge after interruption', async () => {
  cloudflare.purgeEntireCacheWithCredentials.mockRejectedValueOnce(
    new Error('pending final purge')
  );
  expect((await configure()).statusCode).toBe(502);
  const intended = journal().current!.publicAddress;
  settings.publicNodeAddress = 'diverged.test';
  settings.publicNodePort = 1234;
  cloudflare.purgeEntireCacheWithCredentials.mockClear();
  expect((await retry()).statusCode).toBe(200);
  expect(settings).toMatchObject(intended);
  expect(cloudflare.purgeEntireCacheWithCredentials).toHaveBeenCalledOnce();
});
