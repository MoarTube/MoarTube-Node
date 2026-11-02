import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { StorageService } from '@/services/storage.js';
import { siloFixture, siloProxy, type SiloFixture } from '../../support/silo.js';

let fixture: SiloFixture;
const state = vi.hoisted(() => ({ storage: {} as unknown }));
vi.mock('@config/index.js', () => ({
  getConfig: () => ({ nodeSettings: { storageConfig: state.storage } }),
}));
let service: StorageService;
beforeEach(async () => {
  fixture = await siloFixture();
  state.storage = { storageMode: 's3provider', s3Config: fixture.config };
  service = new StorageService({ error: vi.fn(), debug: vi.fn() } as never);
});
afterEach(async () => {
  service.close();
  await fixture.close();
});

describe('S3 deletion pagination protocol regressions', () => {
  it.each(['missing', 'empty', 'repeated', 'cycle'])(
    'rejects %s continuation cursors without looping or deleting another prefix',
    async (mode) => {
      await Promise.all(
        ['guard/1', 'guard/2', 'guard/3', 'keep/value'].map((key) => fixture.put(key, key))
      );
      const first = await fixture.client.send(
        new ListObjectsV2Command({
          Bucket: fixture.config.bucketName,
          Prefix: 'guard/',
          MaxKeys: 1,
        })
      );
      const second = await fixture.client.send(
        new ListObjectsV2Command({
          Bucket: fixture.config.bucketName,
          Prefix: 'guard/',
          MaxKeys: 1,
          ContinuationToken: first.NextContinuationToken,
        })
      );
      expect(first.NextContinuationToken).toBeTruthy();
      expect(second.NextContinuationToken).toBeTruthy();
      const firstToken = first.NextContinuationToken;
      const secondToken = second.NextContinuationToken;
      if (firstToken === undefined || secondToken === undefined) {
        throw new Error('Expected two real S3 pagination cursors');
      }
      const tokens =
        mode === 'cycle'
          ? [firstToken, secondToken, firstToken]
          : mode === 'repeated'
            ? [firstToken, firstToken]
            : [mode === 'empty' ? '' : undefined];
      let pages = 0;
      const proxy = await siloProxy(
        fixture.config.s3ProviderClientConfig.endpoint,
        () => {},
        (req, incoming, output) => {
          if (req.method !== 'GET') return;
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('end', () => {
            let body = Buffer.concat(chunks).toString();
            const token = tokens[pages++];
            if (pages <= tokens.length) {
              body = body
                .replace(/<IsTruncated>[^<]*<\/IsTruncated>/, '<IsTruncated>true</IsTruncated>')
                .replace(/<NextContinuationToken>[^<]*<\/NextContinuationToken>/g, '');
              if (token !== undefined)
                body = body.replace(
                  '</ListBucketResult>',
                  `<NextContinuationToken>${token.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</NextContinuationToken></ListBucketResult>`
                );
            }
            const headers = { ...incoming.headers };
            delete headers['content-length'];
            output.writeHead(incoming.statusCode ?? 502, headers);
            output.end(body);
          });
          return true;
        }
      );
      try {
        const config = {
          ...fixture.config,
          s3ProviderClientConfig: {
            ...fixture.config.s3ProviderClientConfig,
            endpoint: proxy.endpoint,
          },
        };
        state.storage = { storageMode: 's3provider', s3Config: config };
        await expect(service.deleteDirectory('guard/')).rejects.toThrow('continuation token');
        expect(pages).toBe(tokens.length);
        expect(await fixture.text('keep/value')).toBe('keep/value');
      } finally {
        await proxy.close();
      }
    }
  );
});
