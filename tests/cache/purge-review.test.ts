import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
import { purgeOutbox } from '@/utils/purge-outbox.js';

const config = vi.hoisted(() => ({ current: {} as any }));
vi.mock('@/config/index.js', () => ({ getConfig: () => config.current }));
vi.mock('axios');
const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  config.current = {
    paths: {},
    nodeSettings: {
      isCloudflareCdnEnabled: true,
      cloudflareZoneId: 'zone',
      cloudflareEmailAddress: 'test',
      cloudflareGlobalApiKey: 'test',
    },
    getNodeBaseUrl: () => 'https://node.example',
    getExternalVideosBaseUrl: () => 'https://media.example',
  };
});
afterEach(() => vi.restoreAllMocks());
function service(post: ReturnType<typeof vi.fn>) {
  vi.mocked(axios.create).mockReturnValue({ post } as never);
  const cdn = new CloudflareService(logger as never, {} as never);
  cdn.isEnabled();
  return cdn;
}

it('acknowledges mixed targets covered by a successful whole-zone purge without separate requests', async () => {
  const post = vi.fn().mockResolvedValue({ data: { success: true } });
  const cdn = service(post);
  await (cdn as any).purgeCache(
    [
      'https://media.example/external/videos/one/file.mp4',
      'prefix:media.example/external/videos/one/',
      'tag:moartube-video-one',
      'everything',
    ],
    'review'
  );
  expect(post.mock.calls.map((call) => call[1])).toEqual([{ purge_everything: true }]);
});

it('acknowledges exact URL and Origin variants covered by a successful prefix without file requests', async () => {
  const post = vi.fn().mockResolvedValue({ data: { success: true } });
  const cdn = service(post);
  await (cdn as any).purgeCache(
    [
      'https://media.example/external/videos/one/file.mp4',
      'prefix:media.example/external/videos/one/',
    ],
    'review'
  );
  expect(post.mock.calls.map((call) => call[1])).toEqual([
    { prefixes: ['media.example/external/videos/one/'] },
  ]);
});

it('still dispatches exact-file work when the broader pending invalidation is throttled', async () => {
  const post = vi
    .fn()
    .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '120' } } })
    .mockResolvedValue({ data: { success: true } });
  const cdn = service(post);
  await expect(
    (cdn as any).purgeCache(
      [
        'https://media.example/external/videos/one/file.mp4',
        'prefix:media.example/external/videos/one/',
      ],
      'review'
    )
  ).rejects.toThrow();
  expect(post.mock.calls[0]![1]).toEqual({ prefixes: ['media.example/external/videos/one/'] });
  expect(post.mock.calls[1]![1]).toHaveProperty('files');
  await expect(
    cdn.purgeFiles(['https://media.example/external/videos/two/file.mp4'], true)
  ).resolves.toBeUndefined();
  expect(post).toHaveBeenCalledTimes(3);
});

it('shares token reservations across database handles, zones, and worker restarts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'moartube-purge-review-'));
  const target = { dialect: 'sqlite' as const, filepath: path.join(directory, 'queue.sqlite') };
  const a = purgeOutbox(target),
    b = purgeOutbox(target);
  try {
    const now = Date.now();
    const reservations = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        (index % 2 ? a : b).reserve('account:broad', 1, 12_000, 25, now)
      )
    );
    expect(reservations.filter(Boolean)).toHaveLength(25);
    expect(await a.reserve('account:broad', 1, 12_000, 25, now + 11_999)).toBe(false);
    expect(await b.reserve('account:broad', 1, 12_000, 25, now + 12_000)).toBe(true);
    await a.close();
    await b.close();
    const restarted = purgeOutbox(target);
    try {
      expect(await restarted.reserve('account:broad', 1, 12_000, 25, now + 12_000)).toBe(false);
      expect(await restarted.reserve('account:files', 100, 1.25, 800, now + 12_000)).toBe(true);
    } finally {
      await restarted.close();
    }
  } finally {
    await a.close();
    await b.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it('renews a dispatch lease and prevents a stale owner from releasing its replacement', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'moartube-purge-lease-'));
  const target = { dialect: 'sqlite' as const, filepath: path.join(directory, 'queue.sqlite') };
  const a = purgeOutbox(target),
    b = purgeOutbox(target);
  let now = 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const original = (await a.claim('zone:broad'))!;
    now += 110_000;
    expect(await original.renew()).toBe(true);
    now += 20_000;
    expect(await b.claim('zone:broad')).toBeUndefined();
    now += 110_000;
    const replacement = (await b.claim('zone:broad'))!;
    expect(await original.renew()).toBe(false);
    await original.release();
    expect(await a.claim('zone:broad')).toBeUndefined();
    await replacement.release();
    const next = (await a.claim('zone:broad'))!;
    expect(next).toBeDefined();
    await next.release();
  } finally {
    await a.close();
    await b.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it('skips disabled/no-client purges and reports strict failures while retaining best-effort work', async () => {
  const post = vi.fn().mockRejectedValue({ response: { status: 400 } });
  const cdn = service(post);
  await cdn.purgeFiles([]);
  config.current.nodeSettings.isCloudflareCdnEnabled = false;
  await cdn.purgeComments('video'); await cdn.purgeFiles(['file']);
  config.current.nodeSettings.isCloudflareCdnEnabled = true;
  await expect(cdn.purgeFiles(['file'], false)).resolves.toBeUndefined();
  await expect(cdn.purgeHomePage([], true, true)).rejects.toThrow();
  (cdn as any).httpClient = null;
  await expect((cdn as any).purgeCache(['file'], 'review')).resolves.toBeUndefined();
});
it('a broad watch-tag purge subsumes per-video tags', async () => {
  const post = vi.fn().mockResolvedValue({ data: { success: true } });
  await (service(post) as any).purgeCache(['tag:moartube-watch', 'tag:moartube-video-id'], 'review');
  expect(post.mock.calls.map(([, body]) => body)).toEqual([{ tags: ['moartube-watch'] }]);
});
it('defers an exhausted in-memory file lane instead of exceeding its burst budget', async () => {
  const post = vi.fn().mockResolvedValue({ data: { success: true } });
  await expect((service(post) as any).purgeCache(Array.from({ length: 1000 }, (_, i) => 'file-' + i), 'review')).rejects.toThrow();
  expect(post.mock.calls.length).toBeLessThan(10);
});
it('uses the documented global quota fallback when reset time is missing', async () => {
  const post = vi.fn().mockRejectedValue({ response: { status: 429, headers: { 'ratelimit': '"default";r=0' } } });
  await expect((service(post) as any).purgeCache(['file'], 'review')).rejects.toThrow();
});
it('retries transient failures with an explicit zero Retry-After', async () => {
  const post = vi.fn().mockRejectedValueOnce({ response: { status: 503, headers: { 'retry-after': '0' } } }).mockResolvedValue({ data: { success: true } });
  await expect((service(post) as any).purgeCache(['file'], 'review')).resolves.toBeUndefined();
  expect(post).toHaveBeenCalledTimes(2);
});
