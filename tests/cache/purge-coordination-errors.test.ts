import { beforeEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
vi.mock('axios');
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/config/index.js', () => ({
  getConfig: () => ({
    paths: {},
    nodeSettings: {
      isCloudflareCdnEnabled: true,
      cloudflareZoneId: 'zone',
      cloudflareEmailAddress: 'test',
      cloudflareGlobalApiKey: 'test',
    },
    getNodeBaseUrl: () => 'https://node.test',
  }),
}));
let cdn: any, journal: any, lease: any, post: any;
beforeEach(() => {
  post = vi.fn().mockResolvedValue({ data: { success: true } });
  vi.mocked(axios.create).mockReturnValue({ post } as never);
  cdn = new CloudflareService(
    { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    {} as never
  );
  cdn.isEnabled();
  lease = { renew: vi.fn().mockResolvedValue(true), release: vi.fn() };
  journal = {
    enqueue: vi.fn(),
    snapshot: vi.fn().mockResolvedValue([{ target: 'file', token: 'token', zone: 'zone' }]),
    close: vi.fn(),
    claim: vi.fn().mockResolvedValue(lease),
    notBefore: vi.fn().mockResolvedValue(0),
    reserve: vi.fn().mockResolvedValue(true),
    acknowledge: vi.fn(),
  };
  cdn.outbox = () => journal;
});
it('joins a competing foreground lease and releases ownership after dispatch', async () => {
  let misses = 0;
  journal.claim.mockImplementation(async (key: string) =>
    key.endsWith(':files') && misses++ === 0 ? undefined : lease
  );
  await cdn.purgeCache(['file'], 'test', undefined, true);
  expect(journal.claim).toHaveBeenCalledTimes(5);
  expect(post).toHaveBeenCalledOnce();
  expect(lease.release).toHaveBeenCalled();
});
it.each(['local', 'remote'])(
  'bounds foreground waiting for a busy %s dispatch lane',
  async (mode) => {
    if (mode === 'local') cdn.dispatching.add('zone:files');
    else journal.claim.mockResolvedValue(undefined);
    await expect(cdn.purgeCache(['file'], 'test', undefined, true)).rejects.toThrow('incomplete');
    expect(post).not.toHaveBeenCalled();
  }
);
it('drops local work already acknowledged by another owner', async () => {
  journal.snapshot
    .mockResolvedValueOnce([{ target: 'file', token: 'token', zone: 'zone' }])
    .mockResolvedValue([]);
  await cdn.purgeCache(['file'], 'test');
  expect(post).not.toHaveBeenCalled();
});
it('keeps pending work when its lease expires before the provider request', async () => {
  lease.renew.mockResolvedValue(false);
  await expect(cdn.purgeCache(['file'], 'test')).rejects.toThrow('incomplete');
  expect(post).not.toHaveBeenCalled();
  expect(journal.acknowledge).not.toHaveBeenCalled();
});
