import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

const image =
  'pgsty/silo:RELEASE.2026-10-26T00-00-00Z@sha256:7bb2aff6b89efe1cb1303c10fc21d579447434ed06649ac9ec05a5e2dbf30ad7';

function docker(args) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Silo test container command failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export default async function setup(project) {
  let endpoint = process.env.MOARTUBE_SILO_ENDPOINT;
  let accessKeyId = process.env.MOARTUBE_SILO_ACCESS_KEY;
  let secretAccessKey = process.env.MOARTUBE_SILO_SECRET_KEY;
  let name;
  let started = false;
  const cleanup = () => {
    if (started) {
      docker(['stop', '--time', '5', name]);
      started = false;
    }
  };
  try {
    if (!endpoint) {
      if (accessKeyId || secretAccessKey) {
        throw new Error(
          'Set all Silo connection variables together, or none for automatic Docker setup'
        );
      }
      name = `moartube-silo-tests-${randomBytes(8).toString('hex')}`;
      accessKeyId = 'moartube-s3-tests';
      secretAccessKey = randomBytes(24).toString('hex');
      docker([
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '--label',
        'moartube.test=s3',
        '-p',
        '127.0.0.1::9000',
        '-e',
        `MINIO_ROOT_USER=${accessKeyId}`,
        '-e',
        `MINIO_ROOT_PASSWORD=${secretAccessKey}`,
        '-e',
        'MINIO_BROWSER=off',
        '-e',
        'MINIO_DOMAIN=localhost',
        process.env.MOARTUBE_SILO_IMAGE ?? image,
        'server',
        '/tmp/moartube-s3-data',
        '--address',
        ':9000',
      ]);
      started = true;
      const binding = docker(['port', name, '9000/tcp']);
      if (!/^127\.0\.0\.1:\d+$/.test(binding)) {
        throw new Error('Expected a loopback-only Silo binding');
      }
      endpoint = `http://${binding}`;
    }
    const url = new URL(endpoint);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !accessKeyId ||
      !secretAccessKey
    ) {
      throw new Error('Silo tests require a loopback HTTP endpoint and explicit test credentials');
    }
    endpoint = url.origin;
    const client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 1,
    });
    try {
      const deadline = Date.now() + 30_000;
      for (;;) {
        try {
          // Check signed S3 access, not just liveness; credentials must actually work.
          await client.send(new ListBucketsCommand({}), { abortSignal: AbortSignal.timeout(1000) });
          break;
        } catch {
          /* Wait for the isolated Silo server to start. */
        }
        if (Date.now() >= deadline) {
          throw new Error('Silo test server did not become ready with the supplied credentials');
        }
        await setTimeout(100);
      }
    } finally {
      client.destroy();
    }
    project.provide('silo', { endpoint, accessKeyId, secretAccessKey });
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
