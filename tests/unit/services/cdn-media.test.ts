import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import { siloFixture, type SiloFixture } from '../../support/silo.js';
import { CloudflareService } from '@/services/cloudflare.js';
import type { StorageConfig } from '@/types/config.js';

vi.mock('axios');
const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readdir: state.read }));

const config = {
  nodeSettings: {
    isCloudflareCdnEnabled: true,
    cloudflareEmailAddress: 'test',
    cloudflareZoneId: 'zone',
    cloudflareGlobalApiKey: 'test',
    storageConfig: { storageMode: 'filesystem' } as StorageConfig,
  },
  paths: { videosDirectoryPath: '/videos' },
  getExternalVideosBaseUrl: () => 'https://cdn.example.com',
  getNodeBaseUrl: () => 'https://example.com',
};
vi.mock('@config/index.js', () => ({ getConfig: () => config }));
let fixture: SiloFixture;
beforeAll(async () => {
  fixture = await siloFixture();
});
afterAll(async () => {
  await fixture.close();
});
let service: CloudflareService;
beforeEach(() => {
  vi.resetAllMocks();
  config.nodeSettings.isCloudflareCdnEnabled = true;
  config.nodeSettings.storageConfig = { storageMode: 'filesystem' };
  vi.mocked(axios.create).mockReturnValue({
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  } as never);
  service = new CloudflareService(
    { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() } as never
  );
});
describe('media invalidation inventories', () => {
  it('surfaces watch-page invalidation failures to migration callers', async () => {
    const client = vi.mocked(axios.create).mock.results[0].value;
    client.post.mockRejectedValue({ response: { status: 403 } });
    await expect(service.purgeWatchPages(['video'], true)).rejects.toThrow('incomplete');
  });
  it('reports incomplete per-video invalidation without losing failed URLs', async () => {
    state.read.mockResolvedValue([]);
    const client = vi.mocked(axios.create).mock.results[0].value;
    client.post.mockRejectedValue({ response: { status: 403 } });
    await expect(service.purgeVideo('video')).rejects.toThrow('invalidation incomplete');
  });
  it("does not report another video's pending cleanup as this video's failure", async () => {
    state.read.mockResolvedValue([]);
    const client = vi.mocked(axios.create).mock.results[0].value;
    client.post.mockRejectedValueOnce({ response: { status: 403 } });
    await expect(service.purgeVideo('another')).rejects.toThrow('incomplete');
    await expect(service.purgeVideo('video')).resolves.toBeUndefined();
  });
  it('captures valid filesystem segment names and tolerates missing resolutions', async () => {
    state.read.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    state.read.mockResolvedValueOnce(['segment-run-0.ts', 'notes.txt']);
    expect(await service.getAdaptiveVideoUrls('video')).toEqual([
      'https://cdn.example.com/external/videos/video/adaptive/m3u8/240p/segments/segment-run-0.ts',
    ]);
    state.read.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    await expect(service.getAdaptiveVideoUrls('video')).rejects.toThrow('denied');
  });
  it('does not enumerate storage when disabled or without an S3 configuration', async () => {
    config.nodeSettings.isCloudflareCdnEnabled = false;
    expect(await service.getAdaptiveVideoUrls('video')).toEqual([]);
    await expect(service.purgeVideo('video')).resolves.toBeUndefined();
    config.nodeSettings.isCloudflareCdnEnabled = true;
    config.nodeSettings.storageConfig = { storageMode: 's3provider' };
    expect(await service.getAdaptiveVideoUrls('video')).toEqual([]);
  });
  it.each([false, true])(
    'walks actual Silo listing pages (explicit endpoint: %s)',
    async (explicit) => {
      const provider = { ...fixture.config.s3ProviderClientConfig };
      const endpoint = provider.endpoint;
      if (!explicit) {
        delete (provider as { endpoint?: string }).endpoint;
      }
      vi.stubEnv('AWS_ENDPOINT_URL_S3', endpoint);
      try {
        config.nodeSettings.storageConfig = {
          storageMode: 's3provider',
          s3Config: { bucketName: fixture.config.bucketName, s3ProviderClientConfig: provider },
        };
        const expected = Array.from(
          { length: 1001 },
          (_, i) => `external/videos/video/adaptive/m3u8/720p/segments/run-${i}.ts`
        );
        for (let offset = 0; offset < expected.length; offset += 32) {
          await Promise.all(
            expected.slice(offset, offset + 32).map((key) => fixture.put(key, 'segment'))
          );
        }
        await fixture.put('external/videos/video/adaptive/m3u8/manifest.m3u8', '#EXTM3U');
        const urls = await service.getAdaptiveVideoUrls('video');
        expect(urls.sort()).toEqual(expected.map((key) => 'https://cdn.example.com/' + key).sort());
        expect(await service.getAdaptiveVideoUrls('empty-video')).toEqual([]);
        provider.credentials = {
          ...provider.credentials,
          secretAccessKey: 'incorrect-test-secret',
        };
        await expect(service.getAdaptiveVideoUrls('video')).rejects.toThrow();
      } finally {
        vi.unstubAllEnvs();
      }
    },
    20_000
  );
  it('purges all variants under the adaptive prefix after their source files are gone', async () => {
    await service.purgeAdaptiveVideos('video');
    const client = vi.mocked(axios.create).mock.results[0].value;
    expect(client.post).toHaveBeenCalledExactlyOnceWith('/zones/zone/purge_cache', {
      prefixes: ['cdn.example.com/external/videos/video/adaptive/'],
    });
    expect(state.read).not.toHaveBeenCalled();
  });
});
