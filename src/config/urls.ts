/**
 * URL configuration module
 * Centralized management of all external service URLs
 */

import { isIP } from 'node:net';
import type { NodeSettings, StorageConfig } from '@/types/index.js';
import { validateCdnSettings } from '@/utils/cdn-settings.js';

/**
 * URL configuration interface
 */
export interface UrlConfig {
  readonly cloudflareZoneUrl: string;
}

/**
 * URL configuration singleton class
 */
class Urls {
  private static instance: Urls | null = null;

  private constructor() {}

  /**
   * Initialize the URLs singleton with service configurations
   */
  static initialize(): Urls {
    Urls.instance ??= new Urls();
    return Urls.instance;
  }

  /**
   * Get the singleton instance
   * @throws Error if not initialized
   */
  static getInstance(): Urls {
    if (!Urls.instance) {
      throw new Error('Urls not initialized. Call Urls.initialize() first.');
    }
    return Urls.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  static resetInstance(): void {
    Urls.instance = null;
  }

  /**
   * Get the Cloudflare Zone API URL
   */
  get cloudflareZoneUrl(): string {
    return 'https://api.cloudflare.com/client/v4/zones/';
  }

  /**
   * Get all URLs as a plain object
   */
  toObject(): UrlConfig {
    return {
      cloudflareZoneUrl: this.cloudflareZoneUrl,
    };
  }
}

/**
 * Build the node's public base URL from node settings
 */
export function buildNodeBaseUrl(nodeSettings: NodeSettings): string {
  const { publicNodeProtocol, publicNodeAddress, publicNodePort } = nodeSettings;

  if (!publicNodeProtocol || !publicNodeAddress) {
    return '';
  }

  const port = typeof publicNodePort === 'string' ? Number(publicNodePort) : publicNodePort;

  // Omit default ports
  let portSuffix = '';
  if (
    (publicNodeProtocol === 'http' && port !== 80) ||
    (publicNodeProtocol === 'https' && port !== 443)
  ) {
    portSuffix = `:${String(port)}`;
  }

  const address = publicNodeAddress.trim();
  const host = isIP(address) === 6 ? `[${address}]` : address;
  return `${publicNodeProtocol}://${host}${portSuffix}`;
}

/**
 * Build the external videos base URL based on storage configuration
 */
export function buildExternalVideosBaseUrl(nodeSettings: NodeSettings): string {
  const { storageConfig, isCloudflareCdnEnabled } = nodeSettings;

  if (isCloudflareCdnEnabled) {
    const hostname = validateCdnSettings(nodeSettings);
    if (storageConfig.storageMode === 's3provider') {
      return `https://${hostname}`;
    }
  }

  if (storageConfig.storageMode === 'filesystem') {
    return buildNodeBaseUrl(nodeSettings);
  }

  // S3 provider mode
  return buildS3ExternalUrl(storageConfig);
}

/**
 * Build S3 external URL based on configuration
 */
function buildCustomS3Url(endpoint: string, bucketName: string, forcePathStyle: boolean): string {
  if (forcePathStyle) {
    return `${endpoint}/${bucketName}`;
  }

  // Virtual-hosted style: bucket.endpoint
  const protocolMatch = /^(https?:\/\/)(.*)/.exec(endpoint);
  const protocol = protocolMatch?.[1];
  const rest = protocolMatch?.[2];

  if (protocol === undefined || protocol === '' || rest === undefined || rest === '') {
    throw new Error(`Invalid S3 endpoint format: ${endpoint}`);
  }

  const hostAndPort = rest;
  const colonIndex = hostAndPort.indexOf(':');

  if (colonIndex !== -1) {
    const host = hostAndPort.slice(0, colonIndex);
    const port = hostAndPort.slice(colonIndex + 1);
    return `${protocol}${bucketName}.${host}:${port}`;
  } else {
    return `${protocol}${bucketName}.${hostAndPort}`;
  }
}

function buildS3ExternalUrl(storageConfig: StorageConfig): string {
  if (storageConfig.storageMode !== 's3provider' || !storageConfig.s3Config) {
    throw new Error('S3 config required for s3provider storage mode');
  }

  const { bucketName, s3ProviderClientConfig } = storageConfig.s3Config;
  const { endpoint, region, forcePathStyle } = s3ProviderClientConfig;

  // Custom endpoint (non-AWS S3 provider)
  if (endpoint !== undefined && endpoint !== '') {
    return buildCustomS3Url(endpoint, bucketName, forcePathStyle);
  }

  // AWS S3 (no custom endpoint)
  if (forcePathStyle || bucketName.includes('.')) {
    // AWS wildcard TLS certificates cannot cover dotted virtual-hosted bucket names.
    return `https://s3.${region}.amazonaws.com/${bucketName}`;
  } else {
    // Virtual-hosted style AWS URL
    return `https://${bucketName}.s3.${region}.amazonaws.com`;
  }
}

/**
 * Build the external resources base URL (always uses node URL)
 */
export function buildExternalResourcesBaseUrl(nodeSettings: NodeSettings): string {
  return buildNodeBaseUrl(nodeSettings);
}

/**
 * Export initializer
 */
export function initializeUrls(): Urls {
  return Urls.initialize();
}

/**
 * Export the Urls class for testing purposes
 */
export { Urls };
