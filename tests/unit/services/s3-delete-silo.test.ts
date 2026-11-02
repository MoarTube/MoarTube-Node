import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  S3Client,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
  DeleteBucketPolicyCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { deleteS3Objects } from '../../../src/utils/s3-delete.js';
import { siloFixture, siloProxy, type SiloFixture } from '../../support/silo.js';

let fixture: SiloFixture;
beforeEach(async () => {
  fixture = await siloFixture();
});
afterEach(async () => {
  await fixture.close();
});
describe('real Silo bucket policies and per-object deletion failures', () => {
  it('reads back a public-read policy and revokes anonymous access when it is deleted', async () => {
    await fixture.put('public.txt', 'public object');
    const url = `${fixture.config.s3ProviderClientConfig.endpoint}/${fixture.config.bucketName}/public.txt`;
    const anonymousRead = async (): Promise<Response> =>
      fetch(url, { signal: AbortSignal.timeout(5000) });
    const privateResponse = await anonymousRead();
    expect(privateResponse.status).toBe(403);
    await privateResponse.arrayBuffer();
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${fixture.config.bucketName}/*`],
        },
      ],
    };
    await fixture.client.send(
      new PutBucketPolicyCommand({
        Bucket: fixture.config.bucketName,
        Policy: JSON.stringify(policy),
      })
    );
    const stored = await fixture.client.send(
      new GetBucketPolicyCommand({ Bucket: fixture.config.bucketName })
    );
    expect(JSON.parse(stored.Policy ?? 'null')).toEqual(policy);
    const publicResponse = await anonymousRead();
    expect(publicResponse.status).toBe(200);
    expect(await publicResponse.text()).toBe('public object');
    await fixture.client.send(new DeleteBucketPolicyCommand({ Bucket: fixture.config.bucketName }));
    const revoked = await anonymousRead();
    expect(revoked.status).toBe(403);
    await revoked.arrayBuffer();
    expect(await fixture.text('public.txt')).toBe('public object');
  });
  it('reports a partial AccessDenied response without losing the rejected object', async () => {
    await fixture.put('allowed', 'one');
    await fixture.put('denied', 'two');
    await fixture.client.send(
      new PutBucketPolicyCommand({
        Bucket: fixture.config.bucketName,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: ['s3:DeleteObject'],
              Resource: [`arn:aws:s3:::${fixture.config.bucketName}/allowed`],
            },
          ],
        }),
      })
    );
    // A genuine anonymous S3 request; Silo evaluates the fixture bucket's per-object policy.
    const anonymous = new S3Client({
      ...fixture.config.s3ProviderClientConfig,
      signer: { sign: (request) => Promise.resolve(request) },
    });
    try {
      const response = await anonymous.send(
        new DeleteObjectsCommand({
          Bucket: fixture.config.bucketName,
          Delete: { Objects: [{ Key: 'allowed' }, { Key: 'denied' }], Quiet: true },
        })
      );
      expect(response.$metadata.httpStatusCode).toBe(200);
      expect(response.Errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ Key: 'denied', Code: 'AccessDenied' })])
      );
      await expect(
        deleteS3Objects(anonymous, fixture.config.bucketName, ['allowed', 'denied'])
      ).rejects.toThrow('deletion incomplete');
      await expect(fixture.text('allowed')).rejects.toThrow();
      expect(await fixture.text('denied')).toBe('two');
      expect(await deleteS3Objects(fixture.client, fixture.config.bucketName, ['denied'])).toBe(1);
      await expect(fixture.text('denied')).rejects.toThrow();
    } finally {
      anonymous.destroy();
    }
  });
});

describe('bounded retries over the real Silo transport', () => {
  it.each([false, true])(
    'retries only failed keys and stops at three attempts (persistent=%s)',
    async (persistent) => {
      await fixture.put('ok', 'one');
      await fixture.put('retry', 'two');
      const requests: string[] = [];
      let attempts = 0;
      const proxy = await siloProxy(
        fixture.config.s3ProviderClientConfig.endpoint,
        (req) => {
          req.on('data', (chunk: Buffer) => {
            requests.push(chunk.toString());
          });
        },
        (req, incoming, res) => {
          if (req.method !== 'POST') {
            return;
          }
          attempts++;
          const reject = persistent || attempts < 3;
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('end', () => {
            const original = Buffer.concat(chunks).toString();
            const body = reject
              ? original.replace(
                  '</DeleteResult>',
                  '<Error><Key>retry</Key><Code>SlowDown</Code></Error></DeleteResult>'
                )
              : original;
            const headers = { ...incoming.headers };
            delete headers['content-length'];
            res.writeHead(incoming.statusCode ?? 502, headers);
            res.end(body);
          });
          return true;
        }
      );
      const client = new S3Client({
        ...fixture.config.s3ProviderClientConfig,
        endpoint: proxy.endpoint,
      });
      try {
        const operation = deleteS3Objects(client, fixture.config.bucketName, ['ok', 'retry']);
        if (persistent) {
          await expect(operation).rejects.toThrow('deletion incomplete');
        } else {
          expect(await operation).toBe(2);
        }
        expect(attempts).toBe(3);
        expect(requests.filter((body) => body.includes('<Key>ok</Key>'))).toHaveLength(1);
      } finally {
        client.destroy();
        await proxy.close();
      }
    }
  );
  it.each(['<Error><Code>InternalError</Code></Error>', '<Error><Key>missing</Key></Error>'])(
    'reports incomplete malformed error details: %s',
    async (error) => {
      const proxy = await siloProxy(
        fixture.config.s3ProviderClientConfig.endpoint,
        () => {},
        (req, incoming, res) => {
          if (req.method !== 'POST') {
            return;
          }
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('end', () => {
            const body = Buffer.concat(chunks)
              .toString()
              .replace('</DeleteResult>', error + '</DeleteResult>');
            const headers = { ...incoming.headers };
            delete headers['content-length'];
            res.writeHead(incoming.statusCode ?? 502, headers);
            res.end(body);
          });
          return true;
        }
      );
      const client = new S3Client({
        ...fixture.config.s3ProviderClientConfig,
        endpoint: proxy.endpoint,
      });
      try {
        await expect(
          deleteS3Objects(client, fixture.config.bucketName, ['missing'])
        ).rejects.toThrow('deletion incomplete');
      } finally {
        client.destroy();
        await proxy.close();
      }
    }
  );
});
