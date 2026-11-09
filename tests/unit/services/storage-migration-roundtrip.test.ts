import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import dns from 'node:dns';
import {
  createServer as createTlsServer,
  request as httpsRequest,
  type Server as TlsServer,
} from 'node:https';
import { connect, type Socket } from 'node:net';
import { validateCdnSettings } from '@/utils/cdn-settings.js';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { nodeTlsOptions } from '@/utils/node-tls.js';
import { validatorCompiler } from 'fastify-type-provider-zod';
import { settingsRoutes } from '@/routes/settings.js';
import { externalVideosRoutes } from '@/routes/external-videos.js';
import { StorageService } from '@/services/storage.js';
import { VideosService } from '@/services/videos.js';
import { buildExternalVideosBaseUrl } from '@/config/urls.js';
import type { StorageConfig } from '@/types/config.js';
import type { StorageMigration } from '@/validators/storage-migration.js';
import { siloFixture, siloProxy, type SiloFixture } from '../../support/silo.js';

const state = vi.hoisted(() => ({
  config: {} as any,
  localAwsEndpoint: '',
  tlsCa: undefined as Buffer | undefined,
}));
// Native AWS addressing is exercised at the public URL boundary. Only its SDK
// transport is redirected to disposable Silo; commands, bytes, and signatures are real.
vi.mock('@aws-sdk/client-s3', async (original) => {
  const sdk = await original<typeof import('@aws-sdk/client-s3')>();
  const { Agent } = await import('node:https');
  return {
    ...sdk,
    S3Client: class extends sdk.S3Client {
      constructor(config: any) {
        if (state.tlsCa && config.endpoint?.startsWith('https://')) {
          config = {
            ...config,
            requestHandler: {
              httpsAgent: new Agent({ ca: state.tlsCa, rejectUnauthorized: true }),
            },
          };
        }
        super(
          state.localAwsEndpoint && !config.endpoint
            ? { ...config, endpoint: state.localAwsEndpoint, forcePathStyle: true }
            : config
        );
      }
    },
  };
});
vi.mock('@config/index.js', () => ({ getConfig: () => state.config }));

const run = promisify(execFile);
const realLookup = dns.lookup.bind(dns);
const ffmpeg = process.env['MOARTUBE_FFMPEG'] ?? process.env['FFMPEG_BIN'] ?? 'ffmpeg';
const id = 'roundtrip01';
const rootKey = `external/videos/${id}/adaptive/m3u8/`;
const resolutions = ['240p', '360p'];
const repeatedTrips = Number(process.env['MOARTUBE_HLS_ROUNDTRIPS'] ?? 5);
if (!Number.isInteger(repeatedTrips) || repeatedTrips < 1)
  throw new Error('MOARTUBE_HLS_ROUNDTRIPS must be a positive integer');
type Place = 'local' | 'a' | 'b';

// Opt in because these tests require FFmpeg with H.264/AAC support as well as real Silo.
// MOARTUBE_TEST_HLS=1 MOARTUBE_FFMPEG=/path/to/ffmpeg vitest run <this-file> --coverage.enabled=false
describe.skipIf(process.env['MOARTUBE_TEST_HLS'] !== '1')(
  'migration, storage switch, and decoded HLS playback round trips',
  () => {
    let root: string;
    let app: FastifyInstance;
    let storage: StorageService;
    let fixtures: Record<'a' | 'b', SiloFixture>;
    let remotes: Record<'a' | 'b', Extract<StorageMigration, { direction: 's3-to-s3' }>['source']>;
    let proxies: Awaited<ReturnType<typeof siloProxy>>[];
    let activeBase: string;
    let publicReads: string[];
    let forbiddenReads: string[];
    let expected: Map<string, string[]>;
    let forwardProxy: Server;
    let forwardProxyUrl: string;
    let video: any;
    let cdn: TlsServer | undefined;
    let cdnPort: number;
    let objectCount: number;
    let tunnels: Set<Socket>;
    let container: Parameters<typeof settingsRoutes>[1];
    let viewerOrigin: string;
    let publicGateways: (Server | TlsServer)[];
    let tlsCertificate: Buffer | undefined;
    let tlsKey: Buffer;
    let tlsCertificatePath: string;

    const configFor = (place: Place): StorageConfig =>
      place === 'local'
        ? { storageMode: 'filesystem' }
        : {
            storageMode: 's3provider',
            s3Config: {
              ...remotes[place],
              s3ProviderClientConfig: {
                ...remotes[place].s3ProviderClientConfig,
                credentials: {
                  accessKeyId: remotes[place].s3ProviderClientConfig.credentials.accessKeyId,
                  secretAccessKey:
                    remotes[place].s3ProviderClientConfig.credentials.secretAccessKey,
                },
              },
            },
          };

    function recordRead(url: string): void {
      publicReads.push(url);
      if (!url.startsWith(activeBase + '/external/videos/')) {
        forbiddenReads.push(url);
        throw new Error(`Playback tried to read an inactive source: ${url}`);
      }
    }

    beforeEach(async () => {
      state.localAwsEndpoint = '';
      tlsCertificate = undefined;
      state.tlsCa = undefined;
      publicGateways = [];
      objectCount = 5;
      mediaKeys.splice(5);
      cdn = undefined;
      tunnels = new Set();
      vi.spyOn(dns, 'lookup').mockImplementation(((hostname: string, ...args: any[]) =>
        realLookup(
          hostname === 'localhost' || hostname.endsWith('.localhost') ? '127.0.0.1' : hostname,
          ...(args as [any, any])
        )) as typeof dns.lookup);
      forwardProxy = createServer((request, reply) => {
        const url = new URL(request.url!);
        const upstream = httpRequest(
          {
            hostname: url.hostname.endsWith('.localhost') ? '127.0.0.1' : url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: request.method,
            headers: { ...request.headers, host: url.host },
          },
          (response) => {
            reply.writeHead(response.statusCode!, response.headers);
            response.pipe(reply);
          }
        );
        upstream.on('error', () => reply.destroy());
        request.pipe(upstream);
      });
      forwardProxy.on('connect', (_request, socket, head) => {
        const target = new URL('https://' + _request.url);
        const port =
          cdn && target.hostname !== 'localhost' && target.hostname !== '127.0.0.1'
            ? cdnPort
            : Number(target.port || 443);
        const allowed =
          target.hostname === 'localhost' ||
          target.hostname === '127.0.0.1' ||
          target.hostname.endsWith('.localhost') ||
          Boolean(cdn);
        if (!allowed) return socket.destroy();
        const upstream = connect(port, '127.0.0.1', () => {
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length) upstream.write(head);
          socket.pipe(upstream).pipe(socket);
        });
        tunnels.add(socket);
        tunnels.add(upstream);
        upstream.on('close', () => tunnels.delete(upstream));
        socket.on('close', () => tunnels.delete(socket));
        upstream.on('end', () => socket.end());
        socket.on('end', () => upstream.end());
        upstream.on('error', () => socket.destroy());
        socket.on('error', () => upstream.destroy());
        socket.on('close', () => upstream.destroy());
      });
      forwardProxy.listen(0, '127.0.0.1');
      await once(forwardProxy, 'listening');
      forwardProxyUrl = `http://127.0.0.1:${(forwardProxy.address() as { port: number }).port}`;
      root = await fs.mkdtemp(path.join(tmpdir(), 'moartube-roundtrip-'));
      proxies = [];
      publicReads = [];
      forbiddenReads = [];
      expected = new Map();
      fixtures = { a: await siloFixture(true), b: await siloFixture(true) };
      remotes = {} as typeof remotes;
      for (const name of ['a', 'b'] as const) {
        let endpoint = '';
        const proxy = await siloProxy(
          fixtures[name].config.s3ProviderClientConfig.endpoint,
          (request) => {
            // Signed SDK requests may read either store for migration. Viewer reads must use the active destination.
            if (request.method === 'GET' && request.headers.authorization === undefined) {
              recordRead(
                (request.headers['x-forwarded-proto'] ?? 'http') +
                  '://' +
                  request.headers.host +
                  request.url
              );
            }
          }
        );
        endpoint = proxy.endpoint;
        proxies.push(proxy);
        remotes[name] = {
          ...fixtures[name].config,
          s3ProviderClientConfig: {
            region: fixtures[name].config.s3ProviderClientConfig.region,
            forcePathStyle: true,
            credentials: fixtures[name].config.s3ProviderClientConfig.credentials,
            endpoint,
          },
        };
      }
      state.config = {
        paths: {
          dataDirectoryPath: root,
          nodeSettingsPath: path.join(root, 'settings.json'),
          videosDirectoryPath: path.join(root, 'videos'),
          certificatesDirectoryPath: path.join(root, 'certificates'),
        },
        nodeSettings: {
          isSecure: false,
          storageConfig: { storageMode: 'filesystem' },
          isCloudflareCdnEnabled: false,
          publicNodeAddress: '127.0.0.1',
          publicNodeProtocol: 'http',
          publicNodePort: '80',
        },
        reloadNodeSettings: () => {},
        updateNodeSettings: (patch: object) => Object.assign(state.config.nodeSettings, patch),
        getExternalVideosBaseUrl: () => buildExternalVideosBaseUrl(state.config.nodeSettings),
      };
      await fs.mkdir(state.config.paths.videosDirectoryPath, { recursive: true });
      video = {
        video_id: id,
        is_published: true,
        cdn: false,
        is_streaming: false,
        is_publishing: false,
        is_importing: false,
        outputs: JSON.stringify({ m3u8: resolutions, mp4: [], webm: [], ogv: [] }),
        meta: '{}',
      };
      const repository = { findAll: async () => [video], updateBandwidth: async () => {} };
      const cloudflare = {
        purgeAdaptiveVideos: vi.fn(),
        purgeVideo: vi.fn(),
        purgeHomePage: vi.fn(),
        purgeAllWatchPages: vi.fn(),
        purgeWatchPages: vi.fn(),
        validateCdnConfiguration: async (
          _email: string,
          _zone: string,
          _key: string,
          settings: any
        ) => validateCdnSettings(settings),
        withConfigurationRollback: async (
          _email: string,
          _zone: string,
          _key: string,
          operation: () => Promise<void>
        ) => operation(),
        addCdnDnsRecord: vi.fn(),
        purgeEntireCacheWithCredentials: vi.fn(),
      };
      const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      storage = new StorageService(logger as never);
      const videos = new VideosService(
        logger as never,
        repository as never,
        {} as never,
        storage,
        {} as never,
        cloudflare as never
      );
      const dependencies = {
        settingsService: {
          isDockerEnvironment: () => false,
          updateNetworkSettings: async (
            publicNodeProtocol: string,
            publicNodeAddress: string,
            publicNodePort: string
          ) => {
            Object.assign(state.config.nodeSettings, {
              publicNodeProtocol,
              publicNodeAddress,
              publicNodePort,
            });
          },
          updateStorageConfig: (value: StorageConfig) => {
            state.config.nodeSettings = { ...state.config.nodeSettings, storageConfig: value };
          },
        },
        videosService: videos,
        cloudflareService: cloudflare,
        websocketService: {},
      };
      container = { resolve: (key: keyof typeof dependencies) => dependencies[key] } as never;
      await startNode();
      state.config.nodeSettings.publicNodePort = String(
        (app.server.address() as { port: number }).port
      );
      viewerOrigin = app.listeningOrigin;
      activeBase = viewerOrigin;
    });

    async function startNode(port = 0): Promise<void> {
      app = Fastify({ https: nodeTlsOptions(), trustProxy: 'loopback' });
      await app.register(multipart);
      app.setValidatorCompiler(validatorCompiler);
      app.decorate(
        'authenticate',
        async (
          request: { headers: { authorization?: string } },
          reply: { code: (status: number) => { send: (data: unknown) => unknown } }
        ) => {
          if (request.headers.authorization !== 'Bearer test-token')
            return reply.code(401).send({ isError: true });
        }
      );
      app.decorate('optionalAuthenticate', async () => {});
      app.addHook('onRequest', async (request, reply) => {
        if (
          request.url.startsWith('/external/videos/') &&
          request.url !== '/external/videos/baseUrl'
        ) {
          try {
            recordRead(request.protocol + '://' + request.headers.host + request.url);
          } catch {
            return reply.code(503).send('Inactive local source');
          }
        }
      });
      await app.register(async (scope) => settingsRoutes(scope, container), {
        prefix: '/settings',
      });
      await app.register(async (scope) => externalVideosRoutes(scope, container), {
        prefix: '/external/videos',
      });
      await app.listen({ host: '127.0.0.1', port });
      state.config.nodeSettings.nodeListeningPort = (app.server.address() as { port: number }).port;
    }

    afterEach(async () => {
      vi.restoreAllMocks();
      for (const socket of tunnels ?? []) socket.destroy();
      for (const gateway of publicGateways ?? []) {
        gateway.closeAllConnections();
        if (gateway.listening) await new Promise<void>((resolve) => gateway.close(() => resolve()));
      }
      await app?.close();
      cdn?.closeAllConnections();
      if (cdn?.listening) await new Promise<void>((resolve) => cdn!.close(() => resolve()));
      forwardProxy?.closeAllConnections();
      if (forwardProxy?.listening)
        await new Promise<void>((resolve) => forwardProxy.close(() => resolve()));
      storage?.close();
      for (const proxy of proxies ?? []) await proxy.close();
      if (fixtures) for (const fixture of Object.values(fixtures)) await fixture.close();
      if (root) await fs.rm(root, { recursive: true, force: true });
      state.localAwsEndpoint = '';
      vi.restoreAllMocks();
    });

    async function post(route: string, body: unknown): Promise<Record<string, unknown>> {
      const response = await publicFetch(app.listeningOrigin + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json()) as Record<string, unknown>;
      expect(result, `${route}: ${JSON.stringify(result)}`).toMatchObject({ isError: false });
      expect(response.status).toBe(200);
      return result;
    }

    async function enableCdn(): Promise<void> {
      const openssl = process.env['MOARTUBE_OPENSSL'] ?? 'openssl';
      const key = path.join(root, 'cdn-key.pem');
      const certificate = path.join(root, 'cdn-cert.pem');
      await run(
        openssl,
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          key,
          '-out',
          certificate,
          '-days',
          '1',
          '-subj',
          '/CN=local-cdn-test',
        ],
        { windowsHide: true, timeout: 15_000 }
      );
      state.localAwsEndpoint = fixtures.a.config.s3ProviderClientConfig.endpoint;
      for (const name of ['a', 'b'] as const) {
        delete remotes[name].s3ProviderClientConfig.endpoint;
        remotes[name].s3ProviderClientConfig.forcePathStyle = false;
      }
      state.config.nodeSettings.isCloudflareCdnEnabled = true;
      state.config.nodeSettings.publicNodeAddress = fixtures.a.config.bucketName.slice(
        'externalvideos.'.length
      );
      state.config.nodeSettings.publicNodeProtocol = 'https';
      state.config.nodeSettings.publicNodePort = '443';
      cdn = createTlsServer(
        { key: await fs.readFile(key), cert: await fs.readFile(certificate) },
        (request, reply) => {
          try {
            recordRead('https://' + request.headers.host + request.url);
          } catch {
            reply.writeHead(503).end();
            return;
          }
          const target = new URL(fixtures.a.config.s3ProviderClientConfig.endpoint);
          const upstream = httpRequest(
            {
              hostname: target.hostname,
              port: target.port,
              path: '/' + request.headers.host + request.url,
              method: request.method,
              headers: { host: target.host },
            },
            (response) => {
              reply.writeHead(response.statusCode!, {
                ...response.headers,
                'access-control-allow-origin': '*',
              });
              response.pipe(reply);
            }
          );
          upstream.on('error', () => reply.destroy());
          request.pipe(upstream);
        }
      );
      cdn.listen(0, '127.0.0.1');
      await once(cdn, 'listening');
      cdnPort = (cdn.address() as { port: number }).port;
    }

    async function prepareTls(): Promise<void> {
      tlsCertificatePath = path.join(root, 'loopback-cert.pem');
      const keyPath = path.join(root, 'loopback-key.pem');
      await run(
        process.env['MOARTUBE_OPENSSL'] ?? 'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-keyout',
          keyPath,
          '-out',
          tlsCertificatePath,
          '-days',
          '1',
          '-subj',
          '/CN=localhost',
          '-addext',
          `subjectAltName=DNS:localhost,IP:127.0.0.1,DNS:${fixtures.a.config.bucketName}.localhost,DNS:${fixtures.b.config.bucketName}.localhost`,
        ],
        { windowsHide: true, timeout: 15_000 }
      );
      tlsKey = await fs.readFile(keyPath);
      tlsCertificate = await fs.readFile(tlsCertificatePath);
    }

    async function secureS3Endpoints(): Promise<void> {
      state.tlsCa = tlsCertificate;
      for (const name of ['a', 'b'] as const) {
        const target = new URL(remotes[name].s3ProviderClientConfig.endpoint!);
        const gateway = createTlsServer({ key: tlsKey, cert: tlsCertificate }, (request, reply) => {
          const upstream = httpRequest(
            {
              hostname: '127.0.0.1',
              port: target.port,
              path: request.url,
              method: request.method,
              headers: { ...request.headers, 'x-forwarded-proto': 'https' },
            },
            (response) => {
              reply.writeHead(response.statusCode!, response.headers);
              response.pipe(reply);
            }
          );
          upstream.on('error', () => reply.destroy());
          request.pipe(upstream);
        });
        publicGateways.push(gateway);
        gateway.listen(0, '127.0.0.1');
        await once(gateway, 'listening');
        remotes[name].s3ProviderClientConfig.endpoint =
          `https://${target.hostname}:${(gateway.address() as { port: number }).port}`;
      }
    }

    async function setNativeSecure(secure: boolean): Promise<void> {
      if (secure) {
        const boundary = 'moartube-test-certificates';
        const payload = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="keyFile"; filename="private_key.pem"\r\nContent-Type: application/x-pem-file\r\n\r\n`
          ),
          tlsKey,
          Buffer.from(
            `\r\n--${boundary}\r\nContent-Disposition: form-data; name="certFile"; filename="certificate.pem"\r\nContent-Type: application/x-pem-file\r\n\r\n`
          ),
          tlsCertificate!,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);
        const response = await app.inject({
          method: 'POST',
          url: '/settings/secure?isSecure=true',
          headers: {
            authorization: 'Bearer test-token',
            'content-type': `multipart/form-data; boundary=${boundary}`,
          },
          payload,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ isError: false });
        expect(
          await fs.readFile(
            path.join(state.config.paths.certificatesDirectoryPath, 'certificate.pem')
          )
        ).toEqual(tlsCertificate);
      } else await post('/settings/secure?isSecure=false', {});
      expect(state.config.nodeSettings.isSecure).toBe(secure);
      const port = state.config.nodeSettings.nodeListeningPort;
      await app.close();
      await startNode(port);
      expect(app.listeningOrigin.startsWith(secure ? 'https://' : 'http://')).toBe(true);
    }

    async function publicFetch(url: string, init: RequestInit = {}): Promise<Response> {
      if (!url.startsWith('https://')) return fetch(url, init);
      const target = new URL(url);
      const isCdn =
        Boolean(cdn) && target.hostname !== 'localhost' && target.hostname !== '127.0.0.1';
      return new Promise((resolve, reject) => {
        const request = httpsRequest(
          {
            hostname: isCdn ? '127.0.0.1' : target.hostname,
            port: isCdn ? cdnPort : target.port,
            path: target.pathname + target.search,
            method: init.method ?? 'GET',
            headers: { ...Object.fromEntries(new Headers(init.headers)), host: target.host },
            // CDN retains its separate logical-host fixture. Loopback TLS verifies the SAN and trust chain.
            ...(isCdn
              ? { rejectUnauthorized: false }
              : { ca: tlsCertificate, rejectUnauthorized: true }),
            signal: init.signal ?? AbortSignal.timeout(15_000),
          },
          (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('error', reject);
            response.on('end', () =>
              resolve(new Response(Buffer.concat(chunks), { status: response.statusCode! }))
            );
          }
        );
        request.on('error', reject);
        if (init.body) request.write(init.body);
        request.end();
      });
    }

    const mediaKeys = [
      rootKey + 'static/manifests/manifest-master.m3u8',
      ...resolutions.flatMap((resolution) => [
        rootKey + `static/manifests/manifest-${resolution}.m3u8`,
        rootKey + `${resolution}/segments/segment-0.ts`,
      ]),
    ];

    function localFile(key: string): string {
      // The public route maps manifests and segments to this encoder layout on disk.
      return path.join(
        state.config.paths.videosDirectoryPath,
        key
          .replace('external/videos/', '')
          .replace('/static/manifests/', '/')
          .replace(/\/(\d+p)\/segments\//, '/$1/')
      );
    }

    async function put(
      place: Place,
      key: string,
      body: string | Buffer,
      type: string
    ): Promise<void> {
      if (place !== 'local') await fixtures[place].put(key, body, type);
      else {
        const file = localFile(key);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, body);
      }
    }

    async function read(place: Place, key: string): Promise<Buffer> {
      if (place === 'local') return fs.readFile(localFile(key));
      const response = await fixtures[place].client.send(
        new GetObjectCommand({ Bucket: fixtures[place].config.bucketName, Key: key })
      );
      return Buffer.from(await response.Body!.transformToByteArray());
    }

    async function hashes(place: Place): Promise<string[]> {
      return Promise.all(
        mediaKeys.map(async (key) =>
          createHash('sha256')
            .update(await read(place, key))
            .digest('hex')
        )
      );
    }

    async function seed(place: Place): Promise<void> {
      state.config.nodeSettings.storageConfig = configFor(place);
      activeBase = place === 'local' ? viewerOrigin : state.config.getExternalVideosBaseUrl();
      for (const resolution of resolutions) {
        const width = resolution === '240p' ? 426 : 640;
        const height = resolution === '240p' ? 240 : 360;
        const generated = await run(
          ffmpeg,
          [
            '-nostdin',
            '-loglevel',
            'error',
            '-f',
            'lavfi',
            '-i',
            `testsrc2=size=${width}x${height}:rate=10:duration=2`,
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=440:sample_rate=48000:duration=2',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-pix_fmt',
            'yuv420p',
            '-g',
            '10',
            '-c:a',
            'aac',
            '-f',
            'mpegts',
            'pipe:1',
          ],
          { encoding: 'buffer', windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 ** 2 }
        );
        await put(
          place,
          rootKey + `${resolution}/segments/segment-0.ts`,
          generated.stdout,
          'video/mp2t'
        );
        const segment = `../../${resolution}/segments/segment-0.ts`;
        await put(
          place,
          rootKey + `static/manifests/manifest-${resolution}.m3u8`,
          `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:2,\n${segment}\n#EXT-X-ENDLIST\n`,
          'application/vnd.apple.mpegurl'
        );
      }
      const master =
        '#EXTM3U\n' +
        resolutions
          .map(
            (resolution, i) =>
              `#EXT-X-STREAM-INF:BANDWIDTH=${300000 + i * 300000},RESOLUTION=${i === 0 ? '426x240' : '640x360'}\nmanifest-${resolution}.m3u8\n`
          )
          .join('');
      await put(
        place,
        rootKey + 'static/manifests/manifest-master.m3u8',
        master,
        'application/vnd.apple.mpegurl'
      );
    }

    async function playback(): Promise<void> {
      publicReads.length = 0;
      const baseResponse = await publicFetch(viewerOrigin + '/external/videos/baseUrl', {
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(baseResponse.status).toBe(200);
      const viewer = (await baseResponse.json()) as { externalVideosBaseUrl: string };
      expect(viewer.externalVideosBaseUrl || viewerOrigin).toBe(activeBase);
      const masterUrl = `${activeBase}/${rootKey}static/manifests/manifest-master.m3u8`;
      const master = await publicFetch(masterUrl);
      expect(master.status).toBe(200);
      const variants = (await master.text())
        .split('\n')
        .filter((line) => line && !line.startsWith('#'));
      expect(variants).toHaveLength(2);
      // Decode through the master too, so a broken master-to-rendition link fails playback.
      const decode = async (url: string): Promise<string[]> => {
        const result = await run(
          ffmpeg,
          [
            '-nostdin',
            '-loglevel',
            'error',
            '-xerror',
            '-protocol_whitelist',
            'http,https,tcp,tls,crypto,httpproxy',
            '-http_proxy',
            forwardProxyUrl,
            // Windows FFmpeg uses Schannel and cannot trust a PEM CA via ca_file.
            // publicFetch verifies the certificate and hostname on these same HTTPS URLs.
            '-i',
            url,
            '-map',
            '0:v:0',
            '-map',
            '0:a:0',
            '-f',
            'framemd5',
            'pipe:1',
          ],
          { windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 ** 2 }
        );
        const frames = result.stdout.split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
        expect(frames.filter((line) => line.startsWith('0,'))).toHaveLength(20);
        expect(frames.filter((line) => line.startsWith('1,')).length).toBeGreaterThan(80);
        return frames;
      };
      await decode(masterUrl);
      for (let i = 0; i < variants.length; i++) {
        const url = new URL(variants[i]!, masterUrl).href;
        expect(url.startsWith(activeBase + '/external/videos/')).toBe(true);
        const response = await publicFetch(url);
        expect(response.status).toBe(200);
        const segments = (await response.text())
          .split('\n')
          .filter((line) => line && !line.startsWith('#'));
        expect(segments).toHaveLength(1);
        for (const segment of segments) {
          const segmentUrl = new URL(segment, url).href;
          expect(segmentUrl.startsWith(activeBase + '/external/videos/')).toBe(true);
          const bytes = await publicFetch(segmentUrl);
          expect(bytes.status).toBe(200);
          expect((await bytes.arrayBuffer()).byteLength).toBeGreaterThan(0);
        }
        const frames = await decode(url);
        const resolution = resolutions[i]!;
        if (expected.has(resolution)) expect(frames).toEqual(expected.get(resolution));
        else expected.set(resolution, frames);
      }
      expect(publicReads.length).toBeGreaterThan(5);
      expect(forbiddenReads).toEqual([]);
      expect(publicReads.every((url) => url.startsWith(activeBase + '/external/videos/'))).toBe(
        true
      );

      // Native TLS must also serve relative HLS directly, independently of the public proxy.
      if (
        state.config.nodeSettings.isSecure &&
        state.config.nodeSettings.storageConfig.storageMode === 'filesystem' &&
        viewerOrigin !== app.listeningOrigin
      ) {
        const savedViewer = viewerOrigin;
        const savedBase = activeBase;
        viewerOrigin = app.listeningOrigin;
        activeBase = viewerOrigin;
        try {
          await playback();
        } finally {
          viewerOrigin = savedViewer;
          activeBase = savedBase;
        }
      }
    }

    async function migrateAndSwitch(from: Place, to: Place): Promise<void> {
      const before = JSON.stringify(state.config.nodeSettings.storageConfig);
      const sourceHashes = await hashes(from);
      // Poison all matching destination objects, including the original source on the return leg.
      // Retained playable files therefore cannot hide a missed copy or a failed overwrite.
      for (const key of mediaKeys)
        await put(to, key, 'stale destination', 'application/octet-stream');
      const migration: StorageMigration =
        from === 'local'
          ? { direction: 'filesystem-to-s3', destination: remotes[to as 'a' | 'b'] }
          : to === 'local'
            ? { direction: 's3-to-filesystem', source: remotes[from] }
            : { direction: 's3-to-s3', source: remotes[from], destination: remotes[to] };
      const result = await post('/settings/storage/migrate', migration);
      expect(result['filesCopied']).toBe(objectCount);
      expect(await hashes(from)).toEqual(sourceHashes);
      expect(await hashes(to)).toEqual(sourceHashes);
      expect(JSON.stringify(state.config.nodeSettings.storageConfig)).toBe(before);
      await post('/settings/storage/config/toggle', { storageConfig: configFor(to) });
      expect(state.config.nodeSettings.storageConfig).toMatchObject(configFor(to));
      activeBase = to === 'local' ? viewerOrigin : state.config.getExternalVideosBaseUrl();
      expect(await hashes(from)).toEqual(sourceHashes);
      expect(await hashes(to)).toEqual(sourceHashes);
      await expect(fs.access(path.join(root, '_media_url_origins.json'))).rejects.toThrow();
      for (const key of mediaKeys.filter((key) => key.endsWith('.m3u8'))) {
        expect((await read(to, key)).toString('utf8')).not.toMatch(/^https?:\/\//m);
      }
      if (objectCount > 5 && to !== 'local') {
        const metadata = await fixtures[to].client.send(
          new HeadObjectCommand({
            Bucket: fixtures[to].config.bucketName,
            Key: rootKey + 'dynamic/manifests/manifest-master.m3u8',
          })
        );
        expect(metadata.CacheControl).toBe('no-store');
      }
      await playback();
    }

    async function publicGateway(secure = false): Promise<number> {
      const handler: import('node:http').RequestListener = (request, reply) => {
        const upstream = (state.config.nodeSettings.isSecure ? httpsRequest : httpRequest)(
          {
            ca: tlsCertificate,
            hostname: '127.0.0.1',
            port: (app.server.address() as { port: number }).port,
            path: request.url,
            method: request.method,
            headers: { ...request.headers, 'x-forwarded-proto': secure ? 'https' : 'http' },
          },
          (response) => {
            reply.writeHead(response.statusCode!, response.headers);
            response.pipe(reply);
          }
        );
        upstream.on('error', () => reply.destroy());
        request.pipe(upstream);
      };
      const gateway = secure
        ? createTlsServer({ key: tlsKey, cert: tlsCertificate }, handler)
        : createServer(handler);
      publicGateways.push(gateway);
      gateway.listen(0, '127.0.0.1');
      await once(gateway, 'listening');
      return (gateway.address() as { port: number }).port;
    }

    async function nextListeningPort(): Promise<number> {
      const reservation = createServer();
      reservation.listen(0, '127.0.0.1');
      await once(reservation, 'listening');
      const port = (reservation.address() as { port: number }).port;
      await new Promise<void>((resolve) => reservation.close(() => resolve()));
      return port;
    }

    function activateViewer(place: Place): void {
      viewerOrigin = `${state.config.nodeSettings.publicNodeProtocol}://${state.config.nodeSettings.publicNodeAddress}:${state.config.nodeSettings.publicNodePort}`;
      activeBase = place === 'local' ? viewerOrigin : state.config.getExternalVideosBaseUrl();
    }

    const repeatedScenarios = [
      { from: 'local', to: 'a', aPath: true, bPath: true },
      { from: 'local', to: 'a', aPath: false, bPath: false },
      { from: 'a', to: 'b', aPath: true, bPath: true },
      { from: 'a', to: 'b', aPath: true, bPath: false },
      { from: 'a', to: 'b', aPath: false, bPath: true },
      { from: 'a', to: 'b', aPath: false, bPath: false },
      { from: 'a', to: 'local', aPath: true, bPath: true },
      { from: 'a', to: 'local', aPath: false, bPath: false },
    ] as const;
    it.each(
      repeatedScenarios.flatMap((scenario) =>
        ['http', 'terminated', 'native'].map((transport) => ({ ...scenario, transport }))
      )
    )(
      `repeats ${repeatedTrips} round trips with sporadic host/public/listening/protocol changes ($transport): $from -> $to (path-style A=$aPath B=$bPath)`,
      async ({ from, to, aPath, bPath, transport }) => {
        for (const [name, pathStyle] of [
          ['a', aPath],
          ['b', bPath],
        ] as const) {
          remotes[name].s3ProviderClientConfig.forcePathStyle = pathStyle;
          if (!pathStyle)
            remotes[name].s3ProviderClientConfig.endpoint = remotes[
              name
            ].s3ProviderClientConfig.endpoint!.replace('127.0.0.1', 'localhost');
        }
        if (transport !== 'http') {
          await prepareTls();
          await secureS3Endpoints();
        }
        const ports = [await publicGateway(), await publicGateway()];
        const securePorts =
          transport !== 'http' ? [await publicGateway(true), await publicGateway(true)] : [];
        const portsFor = (protocol: string) => (protocol === 'https' ? securePorts : ports);
        expect(new Set([...ports, state.config.nodeSettings.nodeListeningPort]).size).toBe(3);
        await post('/settings/network/external', {
          publicNodeProtocol: 'http',
          publicNodeAddress: '127.0.0.1',
          publicNodePort: ports[0],
        });
        await seed(from);
        activateViewer(from);
        await playback();
        const changes: {
          kind: string;
          protocol: string;
          host: string;
          publicPort: number;
          listeningPort: number;
        }[] = [];
        const listeningPorts = new Set<number>([state.config.nodeSettings.nodeListeningPort]);
        let random =
          0x5eed1234 ^
          (from === 'local' ? 1 : 2) ^
          (to === 'b' ? 16 : 32) ^
          (aPath ? 256 : 0) ^
          (bPath ? 4096 : 0);
        const next = () => {
          random ^= random << 13;
          random ^= random >>> 17;
          random ^= random << 5;
          return random >>> 0;
        };
        async function sporadicChange(place: Place, step: number): Promise<void> {
          // Every cycle toggles protocol for TLS cases; remaining changes are reproducibly sporadic.
          const kinds = ['host', 'public', 'listening'];
          const kind =
            step % 4 === 3
              ? transport === 'http'
                ? undefined
                : 'protocol'
              : step < 3
                ? kinds[step]
                : next() % 4 === 0
                  ? undefined
                  : kinds[next() % 3];
          if (!kind) return;
          const before = await hashes(place);
          const storageBefore = JSON.stringify(state.config.nodeSettings.storageConfig);
          if (kind === 'listening') {
            const previous = app.listeningOrigin;
            const previousPort = state.config.nodeSettings.nodeListeningPort;
            const publicPort = state.config.nodeSettings.publicNodePort;
            const nextPort = await nextListeningPort();
            expect(nextPort).not.toBe(previousPort);
            await post('/settings/network/internal', { nodeListeningPort: nextPort });
            expect(state.config.nodeSettings.nodeListeningPort).toBe(nextPort);
            // The Client activates a listening-port setting by restarting the Node.
            // Recreate the isolated HTTP app, retaining the same settings and media stores.
            await app.close();
            await startNode(nextPort);
            expect((app.server.address() as { port: number }).port).toBe(nextPort);
            expect(state.config.nodeSettings.publicNodePort).toBe(publicPort);
            await expect(
              publicFetch(previous + '/external/videos/baseUrl', {
                signal: AbortSignal.timeout(1000),
              })
            ).rejects.toThrow();
            listeningPorts.add(nextPort);
          } else {
            const protocol =
              kind === 'protocol'
                ? state.config.nodeSettings.publicNodeProtocol === 'http'
                  ? 'https'
                  : 'http'
                : state.config.nodeSettings.publicNodeProtocol;
            if (kind === 'protocol' && transport === 'native')
              await setNativeSecure(protocol === 'https');
            const availablePorts = portsFor(protocol);
            const host =
              kind === 'host'
                ? state.config.nodeSettings.publicNodeAddress === '127.0.0.1'
                  ? 'localhost'
                  : '127.0.0.1'
                : state.config.nodeSettings.publicNodeAddress;
            const publicPort =
              kind === 'protocol'
                ? availablePorts[0]
                : kind === 'public'
                  ? Number(state.config.nodeSettings.publicNodePort) === availablePorts[0]
                    ? availablePorts[1]
                    : availablePorts[0]
                  : state.config.nodeSettings.publicNodePort;
            const listeningPort = state.config.nodeSettings.nodeListeningPort;
            await post('/settings/network/external', {
              publicNodeProtocol: protocol,
              publicNodeAddress: host,
              publicNodePort: publicPort,
            });
            expect(state.config.nodeSettings.nodeListeningPort).toBe(listeningPort);
          }
          activateViewer(place);
          expect(JSON.stringify(state.config.nodeSettings.storageConfig)).toBe(storageBefore);
          expect(await hashes(place)).toEqual(before);
          changes.push({
            kind,
            protocol: state.config.nodeSettings.publicNodeProtocol,
            host: state.config.nodeSettings.publicNodeAddress,
            publicPort: Number(state.config.nodeSettings.publicNodePort),
            listeningPort: state.config.nodeSettings.nodeListeningPort,
          });
          await playback();
        }
        for (let cycle = 0; cycle < repeatedTrips; cycle++) {
          await sporadicChange(from, cycle * 4);
          await migrateAndSwitch(from, to);
          await sporadicChange(to, cycle * 4 + 1);
          await migrateAndSwitch(to, from);
          await sporadicChange(from, cycle * 4 + 2);
          await sporadicChange(from, cycle * 4 + 3);
        }
        expect(new Set(changes.map((change) => change.kind))).toEqual(
          new Set(['host', 'public', 'listening', ...(transport === 'http' ? [] : ['protocol'])])
        );
        expect(listeningPorts.size).toBeGreaterThan(1);
        expect(changes.some((change) => change.host === 'localhost')).toBe(true);
        expect(new Set(changes.map((change) => change.publicPort)).size).toBeGreaterThanOrEqual(2);
        if (transport !== 'http')
          expect(new Set(changes.map((change) => change.protocol))).toEqual(
            new Set(['http', 'https'])
          );
        expect(state.config.nodeSettings.isSecure).toBe(
          transport === 'native' && state.config.nodeSettings.publicNodeProtocol === 'https'
        );
        expect(forbiddenReads).toEqual([]);
      },
      Math.max(60_000, repeatedTrips * 30_000)
    );

    const routes = [
      ['local', 'a'],
      ['a', 'b'],
      ['a', 'local'],
    ] as const;
    const addressing = [
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ] as const;
    const scenarios = routes.flatMap(([from, to]) =>
      addressing
        .filter(([aPath, bPath]) => to === 'b' || aPath === bPath)
        .map(([aPath, bPath]) => ({
          from,
          to,
          aPath,
          bPath,
          published: true,
          cdn: false,
          recorded: false,
        }))
    );
    scenarios.push({
      from: 'a',
      to: 'b',
      aPath: true,
      bPath: true,
      published: false,
      cdn: false,
      recorded: false,
    });
    for (const [from, to] of [
      ['local', 'a'],
      ['a', 'local'],
    ] as const)
      scenarios.push({
        from,
        to,
        aPath: false,
        bPath: false,
        published: true,
        cdn: true,
        recorded: false,
      });
    for (const pathStyle of [false, true])
      scenarios.push({
        from: 'a',
        to: 'local',
        aPath: pathStyle,
        bPath: pathStyle,
        published: true,
        cdn: false,
        recorded: true,
      });
    it.each(scenarios)(
      '$from -> $to -> source (path-style A=$aPath B=$bPath; published=$published; CDN=$cdn; recorded=$recorded)',
      async ({ from, to, aPath, bPath, published, cdn, recorded }) => {
        for (const [name, pathStyle] of [
          ['a', aPath],
          ['b', bPath],
        ] as const) {
          remotes[name].s3ProviderClientConfig.forcePathStyle = pathStyle;
          if (!pathStyle)
            remotes[name].s3ProviderClientConfig.endpoint = remotes[
              name
            ].s3ProviderClientConfig.endpoint!.replace('127.0.0.1', 'localhost');
        }
        if (cdn) await enableCdn();
        video.is_published = published;
        await seed(from);
        if (recorded) {
          video.is_live = true;
          video.is_streamed = true;
          const snapshots = mediaKeys.filter((key) => key.endsWith('.m3u8'));
          for (const key of snapshots) {
            const dynamicKey = key.replace('/static/', '/dynamic/');
            await put(
              from,
              dynamicKey,
              (await read(from, key)).toString('utf8').replaceAll('/static/', '/dynamic/'),
              'application/vnd.apple.mpegurl'
            );
            mediaKeys.push(dynamicKey);
          }
          objectCount = mediaKeys.length;
        }
        await playback();
        if (!cdn && aPath && bPath && !recorded) {
          const before = await hashes(from);
          await post('/settings/network/external', {
            publicNodeProtocol: 'https',
            publicNodeAddress: 'fresh-public.example.test',
            publicNodePort: 443,
          });
          expect(await hashes(from)).toEqual(before);
          await playback();
        }
        await migrateAndSwitch(from, to);
        await migrateAndSwitch(to, from);
      },
      60_000
    );
  }
);
