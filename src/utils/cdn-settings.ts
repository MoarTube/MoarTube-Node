import { isIP } from 'node:net';
import type { NodeSettings, StorageConfig } from '@/types/config.js';

/** Storage identity excludes credentials so a draining origin can receive repaired credentials. */
export function storageIdentity(storage: StorageConfig): string {
  if (storage.storageMode === 'filesystem') {
    return 'filesystem';
  }
  const provider = storage.s3Config?.s3ProviderClientConfig;
  const bucket = storage.s3Config?.bucketName;
  const region = provider?.region.trim().toLowerCase();
  const partition = (value: string | undefined): string =>
    value?.startsWith('cn-') === true
      ? 'aws-cn'
      : value?.startsWith('us-gov-') === true
        ? 'aws-us-gov'
        : 'aws';
  if (!provider?.endpoint) {
    return JSON.stringify(['aws-s3', partition(region), bucket]);
  }
  const endpoint = new URL(provider.endpoint);
  const hostname = endpoint.hostname.toLowerCase().replace(/\.$/, '');
  // SDK defaults, regional, dualstack, FIPS and accelerated AWS endpoints address
  // the same bucket. Transport, signing region and path style do not change data.
  const aws =
    /^(?:s3(?:[.-](?:dualstack|fips))*(?:[.-]([a-z]{2}(?:-gov)?-[a-z]+-\d))?|s3-accelerate(?:\.dualstack)?)\.amazonaws\.com(?:\.cn)?$/.exec(
      hostname
    );
  if (aws && (endpoint.pathname === '/' || endpoint.pathname === '')) {
    return JSON.stringify([
      'aws-s3',
      hostname.endsWith('.com.cn') ? 'aws-cn' : partition(aws[1] ?? region),
      bucket,
    ]);
  }
  endpoint.hostname = hostname;
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') || '/';
  // Custom providers can use the region solely for request signing. Do not let
  // changing it bypass the active-destination guard for an unchanged endpoint.
  return JSON.stringify(['s3', bucket, endpoint.host, endpoint.pathname, endpoint.search]);
}

export function mediaHostname(address: string): string {
  const host = address.trim().toLowerCase().replace(/\.$/, '');
  const hostname = `externalvideos.${host}`;
  if (
    isIP(host.replace(/^\[|\]$/g, '')) ||
    hostname.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)
  ) {
    throw new Error(
      'Cloudflare CDN requires a domain name for the public Node address; IP addresses are not supported.'
    );
  }
  return hostname;
}

export function validateCdnSettings(
  settings: { publicNodeAddress: NodeSettings['publicNodeAddress']; storageConfig: StorageConfig },
  zoneName?: string
): string {
  const hostname = mediaHostname(settings.publicNodeAddress);
  const host = hostname.slice('externalvideos.'.length);
  if (zoneName) {
    const zone = zoneName.trim().toLowerCase().replace(/\.$/, '');
    if (host !== zone) {
      throw new Error(
        'Cloudflare CDN requires the public Node domain to match the selected Cloudflare zone root exactly; subdomains are not supported.'
      );
    }
  }
  if (settings.storageConfig.storageMode === 's3provider') {
    const s3 = settings.storageConfig.s3Config;
    if (hostname.length > 63) {
      throw new Error(
        'The derived CDN media hostname exceeds the 63-character S3 bucket name limit.'
      );
    }
    if (s3?.bucketName !== hostname) {
      throw new Error(`Cloudflare CDN requires the bucket name ${hostname} for this Node address.`);
    }
    cdnDnsTarget(settings.storageConfig);
  }
  return hostname;
}

export function cdnDnsTarget(storage: StorageConfig): string | undefined {
  if (storage.storageMode !== 's3provider' || !storage.s3Config) {
    return undefined;
  }
  const { bucketName, s3ProviderClientConfig: provider } = storage.s3Config;
  if (provider.endpoint) {
    const endpoint = new URL(provider.endpoint);
    if (
      provider.forcePathStyle ||
      endpoint.protocol !== 'https:' ||
      endpoint.port ||
      endpoint.pathname !== '/' ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.username ||
      endpoint.password
    ) {
      throw new Error(
        'Cloudflare CDN requires an HTTPS virtual-hosted S3 endpoint without a custom port or path.'
      );
    }
    return `${bucketName}.${endpoint.hostname}`;
  }
  return `${bucketName}.s3.${provider.region}.amazonaws.com`;
}
