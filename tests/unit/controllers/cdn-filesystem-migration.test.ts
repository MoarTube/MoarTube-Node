import { readCdnJournal } from '@/utils/cdn-journal.js';
vi.mock('@/services/cloudflare-tunnel-runtime.js', () => ({
  requestTunnelOperation: vi.fn(async () => ({ mode: 'none', status: 'stopped', name: '' })),
}));
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { SettingsController } from '@/controllers/settings.js';
import { withCloudflareDeadline } from '@/utils/cloudflare-http.js';
import { withSettingsChange } from '@/utils/settings-change.js';

const state = vi.hoisted(() => ({ config: {} as any }));
vi.mock('@config/index.js', () => ({ getConfig: () => state.config }));
let root: string, folder: string, controller: SettingsController;
let reply: {
  header: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
};
const media =
  '#EXTM3U\n#EXTINF:2,\nhttps://old.example/external/videos/video/adaptive/m3u8/720p/segments/one.ts\n';
const master =
  '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nhttps://old.example/external/videos/video/adaptive/m3u8/static/manifests/manifest-720p.m3u8\n';

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'moartube-fs-migration-'));
  folder = path.join(root, 'videos/video/adaptive/m3u8');
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, 'manifest-master.m3u8'), master);
  await writeFile(path.join(folder, 'manifest-720p.m3u8'), media);
  state.config = {
    paths: {
      nodeSettingsPath: path.join(root, 'settings.json'),
      videosDirectoryPath: path.join(root, 'videos'),
    },
    nodeSettings: {
      publicNodeProtocol: 'https',
      publicNodeAddress: 'old.example',
      publicNodePort: 443,
      isCloudflareCdnEnabled: false,
      isCloudflareTunnelEnabled: false,
      storageConfig: { storageMode: 'filesystem' },
    },
    updateNodeSettings: (patch: object) => {
      Object.assign(state.config.nodeSettings, patch);
    },
    reloadNodeSettings: vi.fn(),
    getExternalVideosBaseUrl: () => 'https://new.example',
  };
  controller = new SettingsController(
    { clearCloudflareConfig: vi.fn() } as never,
    {
      getAllVideosData: async () => [{ videoId: 'video', meta: {}, outputs: { m3u8: ['720p'] } }],
    } as never,
    {
      purgeAdaptiveVideos: vi.fn(),
      purgeWatchPages: vi.fn(),
      retryPendingPurges: vi.fn(),
    } as never,
    {} as never
  );
  reply = {
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('filesystem CDN migration failure paths', () => {
  it('does not publish a new master when a rendition rewrite fails and can be retried', async () => {
    const broken = media + 'x'.repeat(1024 ** 2 + 1);
    await writeFile(path.join(folder, 'manifest-720p.m3u8'), broken);
    await controller.cloudflareClear({} as never, reply as never);
    expect(reply.send).toHaveBeenLastCalledWith(expect.objectContaining({ isError: true }));
    expect(await readFile(path.join(folder, 'manifest-master.m3u8'), 'utf8')).toBe(master);
    expect(await readFile(path.join(folder, 'manifest-720p.m3u8'), 'utf8')).toBe(broken);
    expect(await readdir(folder)).toEqual(
      expect.arrayContaining(['manifest-master.m3u8', 'manifest-720p.m3u8'])
    );
    expect((await readdir(folder)).some((name) => name.endsWith('.part'))).toBe(false);
    await writeFile(path.join(folder, 'manifest-720p.m3u8'), media);
    await controller.cloudflareRetry(
      {
        body: {
          transitionId: (await readCdnJournal(state.config.paths.nodeSettingsPath)).current!.id,
        },
      } as never,
      reply as never
    );
    expect(reply.send).toHaveBeenLastCalledWith(expect.objectContaining({ isError: false }));
    expect(await readFile(path.join(folder, 'manifest-720p.m3u8'), 'utf8')).toContain('../');
    expect(await readFile(path.join(folder, 'manifest-master.m3u8'), 'utf8')).toContain(
      'manifest-720p.m3u8'
    );
  });
  it('honors an expired transition deadline, preserves complete files and releases admission', async () => {
    await withCloudflareDeadline(async () => {
      await delay(20);
      await controller.cloudflareClear({} as never, reply as never);
    }, 1);
    expect(reply.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ isError: true, message: expect.stringContaining('incomplete') })
    );
    expect(await readFile(path.join(folder, 'manifest-master.m3u8'), 'utf8')).toBe(master);
    expect(await readFile(path.join(folder, 'manifest-720p.m3u8'), 'utf8')).toBe(media);
    expect((await readdir(folder)).some((name) => name.endsWith('.part'))).toBe(false);
    await expect(
      withSettingsChange(state.config.paths.nodeSettingsPath, async () => true)
    ).resolves.toBe(true);
  });
  it('restores network settings and manifests using a fresh recovery deadline after cancellation', async () => {
    Object.assign(state.config.nodeSettings, {
      publicNodeProtocol: 'https',
      publicNodeAddress: 'old.example',
      publicNodePort: '443',
    });
    state.config.updateNodeSettings = (patch: unknown) => {
      state.config.nodeSettings = { ...state.config.nodeSettings, ...(patch as object) };
    };
    state.config.getExternalVideosBaseUrl = () =>
      `https://${state.config.nodeSettings.publicNodeAddress}`;
    controller = new SettingsController(
      {
        updateNetworkSettings: async (protocol: string, address: string, port: string) => {
          state.config.updateNodeSettings({
            publicNodeProtocol: protocol,
            publicNodeAddress: address,
            publicNodePort: port,
          });
        },
      } as never,
      {
        getAllVideosData: async () => [{ videoId: 'video', meta: {}, outputs: { m3u8: ['720p'] } }],
      } as never,
      {
        purgeAdaptiveVideos: vi.fn(),
        purgeWatchPages: vi.fn(),
        retryPendingPurges: vi.fn(),
      } as never,
      {} as never
    );
    await withCloudflareDeadline(async () => {
      await delay(20);
      await controller.networkExternal(
        {
          body: {
            publicNodeProtocol: 'https',
            publicNodeAddress: 'new.example',
            publicNodePort: '443',
          },
        } as never,
        reply as never
      );
    }, 1);
    expect(reply.send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isError: true,
        message: expect.not.stringContaining('recovery is incomplete'),
      })
    );
    expect(state.config.nodeSettings.publicNodeAddress).toBe('old.example');
    expect(await readFile(path.join(folder, 'manifest-master.m3u8'), 'utf8')).toContain(
      'manifest-720p.m3u8'
    );
    expect(await readFile(path.join(folder, 'manifest-720p.m3u8'), 'utf8')).toContain(
      '../../720p/segments/one.ts'
    );
    await expect(
      withSettingsChange(state.config.paths.nodeSettingsPath, async () => true)
    ).resolves.toBe(true);
  });
});
