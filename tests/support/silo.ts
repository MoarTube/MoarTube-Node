import { inject } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { once } from 'node:events';
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';

interface Connection {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}
declare module 'vitest' {
  export interface ProvidedContext {
    silo: Connection | undefined;
  }
}

export interface SiloFixture {
  publicBase: string | undefined;
  config: {
    bucketName: string;
    s3ProviderClientConfig: {
      endpoint: string;
      region: string;
      forcePathStyle: boolean;
      credentials: { accessKeyId: string; secretAccessKey: string };
      maxAttempts: number;
    };
  };
  client: S3Client;
  put(key: string, body: string | Buffer, contentType?: string): Promise<void>;
  text(key: string): Promise<string>;
  close(): Promise<void>;
}
interface SiloProxy {
  endpoint: string;
  close(): Promise<void>;
}

export async function siloFixture(publicRead = false): Promise<SiloFixture> {
  const connection = inject('silo');
  if (connection === undefined) {
    throw new Error('Run with the Silo global setup; S3 mocks are not supported');
  }
  const bucketName = `externalvideos.${randomBytes(8).toString('hex')}.test`;
  const config = {
    bucketName,
    s3ProviderClientConfig: {
      endpoint: connection.endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: connection.accessKeyId,
        secretAccessKey: connection.secretAccessKey,
      },
      maxAttempts: 1,
    },
  };
  const client = new S3Client(config.s3ProviderClientConfig);
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    if (publicRead) {
      await client.send(
        new PutBucketPolicyCommand({
          Bucket: bucketName,
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: '*',
                Action: 's3:GetObject',
                Resource: `arn:aws:s3:::${bucketName}/*`,
              },
            ],
          }),
        })
      );
    }
  } catch (error) {
    try {
      await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    } catch {
      /* Preserve the setup failure if bucket creation itself failed. */
    }
    client.destroy();
    throw error;
  }
  return {
    publicBase: publicRead ? `${connection.endpoint}/${bucketName}` : undefined,
    config,
    client,
    async put(key: string, body: string | Buffer, contentType = 'text/plain'): Promise<void> {
      await client.send(
        new PutObjectCommand({ Bucket: bucketName, Key: key, Body: body, ContentType: contentType })
      );
    },
    async text(key: string): Promise<string> {
      const result = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
      if (!result.Body) {
        throw new Error('Missing Silo response body');
      }
      return result.Body.transformToString();
    },
    async close(): Promise<void> {
      try {
        for (;;) {
          const page = await client.send(new ListObjectsV2Command({ Bucket: bucketName }));
          const objects = (page.Contents ?? []).flatMap((object) =>
            object.Key !== undefined && object.Key !== '' ? [{ Key: object.Key }] : []
          );
          if (objects.length === 0) {
            break;
          }
          const deleted = await client.send(
            new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: objects } })
          );
          if ((deleted.Errors?.length ?? 0) > 0) {
            throw new Error('Silo fixture cleanup failed');
          }
        }
        await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
      } finally {
        client.destroy();
      }
    },
  };
}

/** A real HTTP hop to Silo: observe/backpressure requests, or corrupt a signature for a genuine 403. */
export async function siloProxy(
  endpoint: string,
  intercept: (req: IncomingMessage) => void | Promise<void>,
  response?: (req: IncomingMessage, upstream: IncomingMessage, output: ServerResponse) => unknown
): Promise<SiloProxy> {
  const server = createServer((req, res) => {
    req.pause();
    void (async (): Promise<void> => {
      await intercept(req);
      if (req.destroyed || res.destroyed) {
        return;
      }
      const upstream = httpRequest(
        new URL(req.url ?? '/', endpoint),
        { method: req.method, headers: req.headers },
        (incoming) => {
          if (response?.(req, incoming, res) === true) {
            return;
          }
          if (!res.headersSent) {
            res.writeHead(incoming.statusCode ?? 502, incoming.headers);
          }
          incoming.pipe(res);
        }
      );
      upstream.on('error', () => {
        res.destroy();
      });
      res.on('close', () => {
        upstream.destroy();
      });
      req.pipe(upstream);
    })().catch(() => res.destroy());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Missing proxy port');
  }
  return {
    endpoint: `http://127.0.0.1:${String(address.port)}`,
    async close(): Promise<void> {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
