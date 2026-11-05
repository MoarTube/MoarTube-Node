import type { FastifyRequest } from 'fastify';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import type { NodeSettings } from '@/types/config.js';
import type { TunnelSnapshot } from '@/types/cloudflare-tunnel.js';
import { buildNodeBaseUrl, buildExternalVideosBaseUrl } from '@/config/urls.js';
import { getConfig } from '@/config/index.js';
import { requestTunnelOperation } from '@/services/cloudflare-tunnel-runtime.js';

type ViewerSettings = ReturnType<typeof getConfig>['nodeSettings'];

export function viewerMediaBase(settings: ViewerSettings): string {
  return settings.storageConfig.storageMode === 'filesystem'
    ? ''
    : buildExternalVideosBaseUrl(settings as NodeSettings);
}

function origin(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return /^(http|https):$/.test(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

export function localHostname(host: string): boolean {
  const value = host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value.endsWith('.local') ||
    value === '::1' ||
    value === '::' ||
    /^fe[89ab][0-9a-f]:/.test(value) ||
    /^(fc|fd)[0-9a-f]{2}:/.test(value)
  ) {
    return true;
  }
  if (isIP(value) === 4) {
    const parts = value.split('.').map(Number) as [number, number, number, number];
    return (
      parts[0] === 0 ||
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice(7);
    if (isIP(mapped) === 4) {
      return localHostname(mapped);
    }
    const pair = mapped.split(':');
    if (pair.length === 2) {
      const [high, low] = pair as [string, string];
      const first = Number.parseInt(high, 16),
        last = Number.parseInt(low, 16);
      return localHostname([first >> 8, first & 255, last >> 8, last & 255].join('.'));
    }
  }
  return false;
}

export function canonicalNodeOrigin(
  settings: ViewerSettings,
  tunnel: TunnelSnapshot,
  request?: Pick<FastifyRequest, 'headers'>
): string {
  const configured = origin(buildNodeBaseUrl(settings as NodeSettings));
  if (configured && !localHostname(configured.hostname)) {
    if (settings.isCloudflareCdnEnabled) {
      configured.protocol = 'https:';
    }
    return configured.origin;
  }
  const quick =
    settings.isCloudflareTunnelEnabled &&
    !settings.isCloudflareCdnEnabled &&
    tunnel.mode === 'quick' &&
    tunnel.status === 'running'
      ? origin(tunnel.publicUrl ?? '')
      : undefined;
  if (quick?.protocol === 'https:' && /^[a-z0-9-]+\.trycloudflare\.com$/.test(quick.hostname)) {
    return quick.origin;
  }
  // Raw Host only: arbitrary forwarded headers are never used to build a public link.
  const host = request?.headers.host;
  if (host === undefined || host === '' || /[\s,\\/@?#]/.test(host)) {
    return '';
  }
  const configuredRequest = origin(`${configured?.protocol ?? 'http:'}//${host}`);
  if (configuredRequest && configuredRequest.origin === configured?.origin) {
    return configured.origin;
  }
  const direct = origin(`http://${host}`);
  if (!direct) {
    return '';
  }
  const interfaces = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .map((entry) => entry.address);
  const hostname = direct.hostname.replace(/^\[|\]$/g, '');
  const knownLocal =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    /^127\./.test(hostname) ||
    interfaces.includes(hostname);
  return knownLocal ? direct.origin : '';
}

/** Snapshot IPC is read-only; failure never starts a connector or blocks local rendering. */
export async function pageCanonicalOrigin(request: FastifyRequest): Promise<string> {
  const settings = getConfig().nodeSettings;
  let tunnel: TunnelSnapshot = { mode: 'none', status: 'stopped', name: '' };
  const configured = origin(buildNodeBaseUrl(settings as NodeSettings));
  if (configured !== undefined && !localHostname(configured.hostname)) {
    return canonicalNodeOrigin(settings, tunnel, request);
  }
  if (settings.isCloudflareTunnelEnabled && !settings.isCloudflareCdnEnabled) {
    try {
      tunnel = await requestTunnelOperation('snapshot');
    } catch {
      /* No ready public tunnel. */
    }
  }
  return canonicalNodeOrigin(settings, tunnel, request);
}
