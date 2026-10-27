import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async (original) => ({
  ...(await original<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    send = state.send;
  },
}));
vi.mock('@config/index.js', () => ({
  getConfig: () => ({
    nodeSettings: {
      storageConfig: {
        storageMode: 's3provider',
        s3Config: { bucketName: 'test', s3ProviderClientConfig: {} },
      },
    },
  }),
}));
import { StorageService } from '@/services/storage.js';
describe('S3 storage memory budgets', () => {
  it('deletes each listing page before requesting the next one', async () => {
    state.send
      .mockResolvedValueOnce({
        Contents: [{ Key: 'a' }],
        IsTruncated: true,
        NextContinuationToken: 'next',
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Contents: [{ Key: 'b' }], IsTruncated: false })
      .mockResolvedValueOnce({});
    const service = new StorageService({ error: vi.fn() } as never);
    expect(await service.deleteDirectory('videos/')).toBe(2);
    expect(state.send.mock.calls.map(([command]) => command.constructor.name)).toEqual([
      'ListObjectsV2Command',
      'DeleteObjectsCommand',
      'ListObjectsV2Command',
      'DeleteObjectsCommand',
    ]);
  });
  beforeEach(() => state.send.mockReset());
  it('handles missing listings and entries without keys', async () => {
    state.send.mockResolvedValueOnce({});
    expect(await new StorageService({ error: vi.fn() } as never).deleteDirectory('a')).toBe(0);
    state.send.mockResolvedValueOnce({ Contents: [{}, { Key: '' }] });
    expect(await new StorageService({ error: vi.fn() } as never).deleteDirectory('a')).toBe(0);
  });
  it.each([undefined, 'repeated'])(
    'rejects truncated listings with an invalid cursor (%s)',
    async (token) => {
      state.send.mockResolvedValueOnce({ IsTruncated: true, NextContinuationToken: token });
      if (token)
        state.send.mockResolvedValueOnce({ IsTruncated: true, NextContinuationToken: token });
      await expect(
        new StorageService({ error: vi.fn() } as never).deleteDirectory('a')
      ).rejects.toThrow('continuation token');
    }
  );
});
