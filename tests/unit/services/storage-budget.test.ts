import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { siloFixture, siloProxy, type SiloFixture } from '../../support/silo.js';
import { StorageService } from '@/services/storage.js';

const state = vi.hoisted(() => ({ storage: {} as unknown }));
vi.mock('@config/index.js', () => ({
  getConfig: () => ({ nodeSettings: { storageConfig: state.storage } }),
}));
let fixture: SiloFixture;
let service: StorageService | undefined;
beforeAll(async () => {
  fixture = await siloFixture();
  const keys = [
    ...Array.from({ length: 1001 }, (_, i) => 'pages/' + String(i).padStart(4, '0')),
    ...['missing', 'repeated'].flatMap((mode) =>
      Array.from({ length: 1001 }, (_, i) => 'cursor/' + mode + '/' + String(i).padStart(4, '0'))
    ),
    'broken/entry',
  ];
  for (let offset = 0; offset < keys.length; offset += 32)
    await Promise.all(keys.slice(offset, offset + 32).map((key) => fixture.put(key, 'value')));
}, 30_000);
afterAll(async () => {
  await fixture.close();
});
beforeEach(() => {
  state.storage = { storageMode: 's3provider', s3Config: fixture.config };
});
afterEach(() => {
  (service as unknown as { s3Client?: { destroy(): void } } | undefined)?.s3Client?.destroy();
  service = undefined;
});
const logger = { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

function through(endpoint: string) {
  state.storage = {
    storageMode: 's3provider',
    s3Config: {
      ...fixture.config,
      s3ProviderClientConfig: { ...fixture.config.s3ProviderClientConfig, endpoint },
    },
  };
  service = new StorageService(logger as never);
  return service;
}
describe('S3 listing and deletion budgets against Silo', () => {
  it('deletes each real 1000-object page before reading the next', async () => {
    const events: string[] = [];
    const proxy = await siloProxy(fixture.config.s3ProviderClientConfig.endpoint, (req) => {
      const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
      if (req.method === 'GET' && query.has('list-type')) events.push('list');
      if (req.method === 'POST' && query.has('delete')) events.push('delete');
    });
    try {
      expect(await through(proxy.endpoint).deleteDirectory('pages/')).toBe(1001);
      expect(events).toEqual(['list', 'delete', 'list', 'delete']);
    } finally {
      await proxy.close();
    }
  }, 20_000);
  it('handles a real empty prefix', async () => {
    service = new StorageService(logger as never);
    expect(await service.deleteDirectory('empty/')).toBe(0);
  });
  it.each(['missing-key', 'empty-key'])(
    'handles malformed listing entries over a real HTTP hop: %s',
    async (mode) => {
      const proxy = await siloProxy(
        fixture.config.s3ProviderClientConfig.endpoint,
        () => {},
        (req, incoming, res) => {
          if (req.method !== 'GET') return;
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('end', () => {
            const original = Buffer.concat(chunks).toString();
            const body = original.replace(
              /<Key>[^<]*<\/Key>/g,
              mode === 'missing-key' ? '' : '<Key></Key>'
            );
            const headers = { ...incoming.headers };
            delete headers['content-length'];
            res.writeHead(incoming.statusCode ?? 502, headers);
            res.end(body);
          });
          return true;
        }
      );
      try {
        expect(await through(proxy.endpoint).deleteDirectory('broken/')).toBe(0);
      } finally {
        await proxy.close();
      }
    }
  );
  it.each(['missing', 'repeated'])(
    'rejects a damaged Silo continuation cursor: %s',
    async (mode) => {
      const proxy = await siloProxy(
        fixture.config.s3ProviderClientConfig.endpoint,
        () => {},
        (req, incoming, res) => {
          if (req.method !== 'GET') return;
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('end', () => {
            let body = Buffer.concat(chunks).toString();
            const cursor = new URL(req.url ?? '/', 'http://localhost').searchParams.get(
              'continuation-token'
            );
            if (mode === 'missing')
              body = body.replace(/<NextContinuationToken>[^<]*<\/NextContinuationToken>/g, '');
            else if (cursor !== null)
              body = body.replace(
                '<IsTruncated>false</IsTruncated>',
                '<IsTruncated>true</IsTruncated><NextContinuationToken>' +
                  cursor.replaceAll('&', '&amp;').replaceAll('<', '&lt;') +
                  '</NextContinuationToken>'
              );
            const headers = { ...incoming.headers };
            delete headers['content-length'];
            res.writeHead(incoming.statusCode ?? 502, headers);
            res.end(body);
          });
          return true;
        }
      );
      try {
        await expect(
          through(proxy.endpoint).deleteDirectory('cursor/' + mode + '/')
        ).rejects.toThrow('continuation token');
      } finally {
        await proxy.close();
      }
    },
    20_000
  );
});
