/**
 * Cloudflare Client
 *
 * API client for Cloudflare CDN operations including cache purging,
 * DNS management, and Turnstile validation.
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { Logger } from '@utils/logger.js';

/**
 * Cloudflare API error
 */
export class CloudflareError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'CloudflareError';
  }
}

/**
 * Cloudflare credentials
 */
export interface CloudflareCredentials {
  emailAddress: string;
  zoneId: string;
  globalApiKey: string;
}

/**
 * Cloudflare client configuration
 */
export interface CloudflareClientConfig {
  credentials: CloudflareCredentials;
  logger?: Logger;
}

/**
 * Cloudflare API response
 */
export interface CloudflareApiResponse<T = unknown> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: string[];
  result?: T;
}

/**
 * Cache settings rule
 */
interface CacheSettingsRule {
  description: string;
  action: string;
  enabled: boolean;
  expression: string;
  action_parameters: {
    cache?: boolean;
    edge_ttl?: {
      mode: string;
      default?: number;
    };
    browser_ttl?: {
      mode: string;
      default?: number;
    };
  };
}

/**
 * DNS record
 */
export interface DnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

/**
 * Cloudflare API Client
 *
 * Handles all Cloudflare API operations for the MoarTube node.
 */
export class CloudflareClient {
  private readonly client: AxiosInstance;
  private readonly credentials: CloudflareCredentials;
  private readonly logger: Logger | undefined;

  constructor(config: CloudflareClientConfig) {
    this.credentials = config.credentials;
    this.logger = config.logger;

    this.client = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4',
      headers: {
        'X-Auth-Email': config.credentials.emailAddress,
        'X-Auth-Key': config.credentials.globalApiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  // ============================================
  // Validation
  // ============================================

  /**
   * Validate Cloudflare credentials
   */
  async validate(): Promise<CloudflareApiResponse> {
    try {
      const response = await this.client.get<CloudflareApiResponse>(
        `/zones/${this.credentials.zoneId}`
      );
      return response.data;
    } catch (error) {
      this.handleAxiosError(error as AxiosError, 'validate');
      throw error;
    }
  }

  // ============================================
  // Cache Purging
  // ============================================

  /**
   * Purge entire cache
   */
  async purgeEntireCache(): Promise<CloudflareApiResponse> {
    try {
      const response = await this.client.post<CloudflareApiResponse>(
        `/zones/${this.credentials.zoneId}/purge_cache`,
        { purge_everything: true }
      );
      return response.data;
    } catch (error) {
      this.handleAxiosError(error as AxiosError, 'purgeEntireCache');
      throw error;
    }
  }

  /**
   * Purge specific files from cache
   * @param files - Array of URLs to purge (max 30 per request)
   */
  async purgeCache(files: string[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    // Cloudflare limits to 30 files per purge request
    const batches = this.batchArray(files, 30);

    for (const batch of batches) {
      try {
        const response = await this.client.post<CloudflareApiResponse>(
          `/zones/${this.credentials.zoneId}/purge_cache`,
          { files: batch }
        );

        if (response.data.success) {
          this.logger?.debug('Cache purge successful', { count: batch.length });
        } else {
          this.logger?.warn('Cache purge failed', { errors: response.data.errors });
        }
      } catch (error) {
        this.handleAxiosError(error as AxiosError, 'purgeCache');
      }
    }
  }

  /**
   * Purge watch pages for specific videos
   * @param videoIds - Video IDs to purge
   * @param nodeBaseUrl - Base URL of the node
   */
  async purgeWatchPages(videoIds: string[], nodeBaseUrl: string): Promise<void> {
    const files = videoIds.map((videoId) => `${nodeBaseUrl}/watch?v=${videoId}`);
    await this.purgeCache(files);
  }

  /**
   * Purge embed video pages
   * @param videoIds - Video IDs to purge
   * @param nodeBaseUrl - Base URL of the node
   */
  async purgeEmbedVideoPages(videoIds: string[], nodeBaseUrl: string): Promise<void> {
    const files: string[] = [];

    for (const videoId of videoIds) {
      const temp1 = `${nodeBaseUrl}/watch/embed/video/${videoId}`;
      const temp2 = `${nodeBaseUrl}/watch/embed/video/${videoId}?autostart=0`;
      const temp3 = `${nodeBaseUrl}/watch/embed/video/${videoId}?autostart=1`;

      files.push(temp1, temp2, temp3);
    }

    await this.purgeCache(files);
  }

  /**
   * Purge node page variations
   * @param nodeBaseUrl - Base URL of the node
   * @param tags - Tags to include in purge
   */
  async purgeNodePage(nodeBaseUrl: string, tags: string[] = []): Promise<void> {
    const files: string[] = [];

    // Base node page
    files.push(`${nodeBaseUrl}/node`);

    // Sort variations without tags
    const sortTerms = ['latest', 'popular', 'oldest'];
    for (const sortTerm of sortTerms) {
      const temp1 = `${nodeBaseUrl}/node?searchTerm=&sortTerm=${sortTerm}&tagTerm=`;
      const temp2 = `${nodeBaseUrl}/node/search?searchTerm=&sortTerm=${sortTerm}&tagTerm=`;

      files.push(temp1, temp2);
    }

    // Tag variations
    for (const tag of tags) {
      for (const sortTerm of sortTerms) {
        const temp1 = `${nodeBaseUrl}/node?searchTerm=&sortTerm=${sortTerm}&tagTerm=${tag}`;
        const temp2 = `${nodeBaseUrl}/node/search?searchTerm=&sortTerm=${sortTerm}&tagTerm=${tag}`;

        files.push(temp1, temp2);
      }
    }

    await this.purgeCache(files);
  }

  /**
   * Purge node images
   * @param externalResourcesBaseUrl - External resources base URL
   */
  async purgeNodeImages(externalResourcesBaseUrl: string): Promise<void> {
    const files = [
      `${externalResourcesBaseUrl}/external/resources/images/icon.png`,
      `${externalResourcesBaseUrl}/external/resources/images/avatar.png`,
      `${externalResourcesBaseUrl}/external/resources/images/banner.png`,
    ];

    await this.purgeCache(files);
  }

  /**
   * Purge video thumbnail images
   * @param videoIds - Video IDs to purge
   * @param externalVideosBaseUrl - External videos base URL
   */
  async purgeVideoThumbnailImages(
    videoIds: string[],
    externalVideosBaseUrl: string
  ): Promise<void> {
    const files = videoIds.map(
      (videoId) => `${externalVideosBaseUrl}/external/videos/${videoId}/images/thumbnail.jpg`
    );
    await this.purgeCache(files);
  }

  /**
   * Purge video preview images
   * @param videoIds - Video IDs to purge
   * @param externalVideosBaseUrl - External videos base URL
   */
  async purgeVideoPreviewImages(videoIds: string[], externalVideosBaseUrl: string): Promise<void> {
    const files = videoIds.map(
      (videoId) => `${externalVideosBaseUrl}/external/videos/${videoId}/images/preview.jpg`
    );
    await this.purgeCache(files);
  }

  /**
   * Purge video poster images
   * @param videoIds - Video IDs to purge
   * @param externalVideosBaseUrl - External videos base URL
   */
  async purgeVideoPosterImages(videoIds: string[], externalVideosBaseUrl: string): Promise<void> {
    const files = videoIds.map(
      (videoId) => `${externalVideosBaseUrl}/external/videos/${videoId}/images/poster.jpg`
    );
    await this.purgeCache(files);
  }

  // ============================================
  // CDN Configuration
  // ============================================

  /**
   * Set up CDN configuration for MoarTube
   */
  async setCdnConfiguration(): Promise<void> {
    this.logger?.info('Setting Cloudflare CDN configuration');

    // Create cache settings rules
    await this.createCacheSettingsRules();

    // Set Browser Cache TTL to "Respect Existing Headers"
    await this.setBrowserCacheTtl(0);

    // Enable Always Use HTTPS
    await this.setSetting('always_use_https', 'on');

    // Enable Argo Tiered Caching
    await this.setArgoTieredCaching(true);

    // Enable Tiered Cache Smart Topology
    await this.setTieredCacheSmartTopology(true);

    this.logger?.info('Cloudflare CDN configuration complete');
  }

  /**
   * Reset CDN configuration
   */
  async resetCdnConfiguration(): Promise<void> {
    this.logger?.info('Resetting Cloudflare CDN configuration');

    // Delete cache settings rule sets
    await this.deleteCacheSettingsRuleSets();

    // Disable Argo Tiered Caching
    await this.setArgoTieredCaching(false);

    // Disable Tiered Cache Smart Topology
    await this.setTieredCacheSmartTopology(false);

    // Remove CDN-related DNS records
    await this.removeCdnDnsRecords();

    this.logger?.info('Cloudflare CDN configuration reset complete');
  }

  /**
   * Create cache settings rules for MoarTube
   */
  private async createCacheSettingsRules(): Promise<void> {
    const rules: CacheSettingsRule[] = [
      {
        description: 'Node External - Video',
        action: 'set_cache_settings',
        enabled: true,
        expression: '(starts_with(http.request.uri, "/external/videos"))',
        action_parameters: {
          cache: true,
          edge_ttl: { mode: 'override_origin', default: 31536000 },
          browser_ttl: { mode: 'bypass' },
        },
      },
      {
        description: 'Node External - JavaScript, CSS',
        action: 'set_cache_settings',
        enabled: true,
        expression:
          '(starts_with(http.request.uri, "/external/resources/javascript")) or (starts_with(http.request.uri, "/external/resources/css"))',
        action_parameters: {
          cache: true,
          edge_ttl: { mode: 'override_origin', default: 86400 },
          browser_ttl: { mode: 'override_origin', default: 28800 },
        },
      },
      {
        description: 'Node External - Images',
        action: 'set_cache_settings',
        enabled: true,
        expression: '(starts_with(http.request.uri, "/external/resources/images"))',
        action_parameters: {
          cache: true,
          edge_ttl: { mode: 'override_origin', default: 86400 },
          browser_ttl: { mode: 'bypass' },
        },
      },
      {
        description: 'Node Watch - Watch Page',
        action: 'set_cache_settings',
        enabled: true,
        expression: '(starts_with(http.request.uri, "/watch"))',
        action_parameters: {
          cache: true,
          edge_ttl: { mode: 'respect_origin' },
          browser_ttl: { mode: 'bypass' },
        },
      },
      {
        description: 'Node Search - Cache Searches',
        action: 'set_cache_settings',
        enabled: true,
        expression: '(starts_with(http.request.uri, "/node/search?searchTerm=&sortTerm"))',
        action_parameters: {
          cache: true,
          edge_ttl: { mode: 'override_origin', default: 86400 },
          browser_ttl: { mode: 'bypass' },
        },
      },
      {
        description: 'Node Page - Cache Variations',
        action: 'set_cache_settings',
        enabled: true,
        expression:
          '(starts_with(http.request.uri, "/node")) or (starts_with(http.request.uri, "/node?searchTerm=&sortTerm"))',
        action_parameters: {
          cache: true,
          edge_ttl: { mode: 'override_origin', default: 86400 },
          browser_ttl: { mode: 'bypass' },
        },
      },
      {
        description: 'Node External - Bypass Live HLS',
        action: 'set_cache_settings',
        enabled: true,
        expression:
          '(http.request.uri.path contains "/adaptive/m3u8/dynamic/") and (http.request.method == "GET")',
        action_parameters: {
          cache: false,
        },
      },
    ];

    try {
      await this.client.put(
        `/zones/${this.credentials.zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`,
        { rules }
      );
      this.logger?.debug('Created cache settings rules');
    } catch (error) {
      this.handleAxiosError(error as AxiosError, 'createCacheSettingsRules');
      throw error;
    }
  }

  /**
   * Delete cache settings rule sets
   */
  private async deleteCacheSettingsRuleSets(): Promise<void> {
    try {
      const response = await this.client.get<
        CloudflareApiResponse<Array<{ id: string; phase: string }>>
      >(`/zones/${this.credentials.zoneId}/rulesets`);

      if (response.data.result === undefined) {
        return;
      }

      for (const ruleSet of response.data.result) {
        if (ruleSet.phase === 'http_request_cache_settings') {
          await this.client.delete(`/zones/${this.credentials.zoneId}/rulesets/${ruleSet.id}`);
          this.logger?.debug('Deleted cache settings rule set', { id: ruleSet.id });
        }
      }
    } catch (error) {
      this.handleAxiosError(error as AxiosError, 'deleteCacheSettingsRuleSets');
    }
  }

  /**
   * Set Browser Cache TTL
   */
  private async setBrowserCacheTtl(value: number): Promise<void> {
    try {
      await this.client.patch(`/zones/${this.credentials.zoneId}/settings/browser_cache_ttl`, {
        value,
      });
      this.logger?.debug('Set browser cache TTL', { value });
    } catch (error) {
      this.handleAxiosError(error as AxiosError, 'setBrowserCacheTtl');
    }
  }

  /**
   * Set a zone setting
   */
  private async setSetting(setting: string, value: string): Promise<void> {
    try {
      await this.client.patch(`/zones/${this.credentials.zoneId}/settings/${setting}`, { value });
      this.logger?.debug(`Set ${setting}`, { value });
    } catch (error) {
      this.handleAxiosError(error as AxiosError, `setSetting:${setting}`);
    }
  }

  /**
   * Set Argo Tiered Caching
   */
  private async setArgoTieredCaching(enabled: boolean): Promise<void> {
    try {
      await this.client.patch(`/zones/${this.credentials.zoneId}/argo/tiered_caching`, {
        value: enabled ? 'on' : 'off',
      });
      this.logger?.debug('Set Argo tiered caching', { enabled });
    } catch (error) {
      this.handleAxiosError(error as AxiosError, 'setArgoTieredCaching');
    }
  }

  /**
   * Set Tiered Cache Smart Topology
   */
  private async setTieredCacheSmartTopology(enabled: boolean): Promise<void> {
    try {
      await this.client.patch(
        `/zones/${this.credentials.zoneId}/cache/tiered_cache_smart_topology_enable`,
        { value: enabled ? 'on' : 'off' }
      );
      this.logger?.debug('Set tiered cache smart topology', { enabled });
    } catch (error) {
      this.handleAxiosError(error as AxiosError, 'setTieredCacheSmartTopology');
    }
  }

  // ============================================
  // DNS Management
  // ============================================

  /**
   * Get DNS records
   */
  async getDnsRecords(): Promise<DnsRecord[]> {
    try {
      const response = await this.client.get<CloudflareApiResponse<DnsRecord[]>>(
        `/zones/${this.credentials.zoneId}/dns_records`
      );
      return response.data.result ?? [];
    } catch (error) {
      this.handleAxiosError(error as AxiosError, 'getDnsRecords');
      return [];
    }
  }

  /**
   * Add a DNS record
   */
  async addDnsRecord(type: string, name: string, content: string, proxied = true): Promise<void> {
    try {
      await this.client.post(`/zones/${this.credentials.zoneId}/dns_records`, {
        type,
        name,
        content,
        ttl: 1,
        proxied,
      });
      this.logger?.debug('Added DNS record', { type, name, content });
    } catch (error) {
      this.handleAxiosError(error as AxiosError, 'addDnsRecord');
      throw error;
    }
  }

  /**
   * Delete a DNS record
   */
  async deleteDnsRecord(recordId: string): Promise<void> {
    try {
      await this.client.delete(`/zones/${this.credentials.zoneId}/dns_records/${recordId}`);
      this.logger?.debug('Deleted DNS record', { recordId });
    } catch (error) {
      this.handleAxiosError(error as AxiosError, 'deleteDnsRecord');
    }
  }

  /**
   * Remove CDN-related DNS records
   */
  private async removeCdnDnsRecords(): Promise<void> {
    const records = await this.getDnsRecords();

    for (const record of records) {
      if (record.name.includes('externalvideos') || record.name.includes('testingexternalvideos')) {
        await this.deleteDnsRecord(record.id);
      }
    }
  }

  /**
   * Add CDN DNS record for S3 storage
   */
  async addCdnDnsRecord(storageConfig: {
    storageMode: 'filesystem' | 's3provider';
    s3Config?: {
      bucketName: string;
      s3ProviderClientConfig: {
        endpoint?: string;
        region?: string;
      };
    };
  }): Promise<void> {
    if (storageConfig.storageMode === 'filesystem') {
      // Remove any existing CDN DNS records for filesystem mode
      await this.removeCdnDnsRecords();
      return;
    }

    if (storageConfig.s3Config === undefined) {
      throw new CloudflareError('S3 config required for s3provider storage mode');
    }

    const { bucketName, s3ProviderClientConfig } = storageConfig.s3Config;
    let recordContent: string;

    if (s3ProviderClientConfig.endpoint !== undefined) {
      // Non-AWS S3 provider
      const url = new URL(s3ProviderClientConfig.endpoint);
      recordContent = `${bucketName}.${url.hostname}`;
    } else {
      // AWS S3
      const region = s3ProviderClientConfig.region ?? 'us-east-1';
      recordContent = `${bucketName}.s3.${region}.amazonaws.com`;
    }

    // Remove existing CDN DNS records
    await this.removeCdnDnsRecords();

    // Add new CNAME record
    await this.addDnsRecord('CNAME', bucketName, recordContent, true);
  }

  // ============================================
  // Turnstile Validation
  // ============================================

  /**
   * Validate a Turnstile token
   * @param token - Turnstile token to validate
   * @param secretKey - Turnstile secret key
   * @param remoteIp - Client IP address (optional)
   */
  async validateTurnstileToken(
    token: string,
    secretKey: string,
    remoteIp?: string
  ): Promise<boolean> {
    try {
      const data: Record<string, string> = {
        secret: secretKey,
        response: token,
      };

      if (remoteIp !== undefined) {
        data['remoteip'] = remoteIp;
      }

      const response = await axios.post<{ success: boolean }>(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        data
      );

      return response.data.success;
    } catch (error) {
      this.logger?.error('Turnstile validation failed', error);
      return false;
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Batch an array into chunks
   */
  private batchArray<T>(array: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      batches.push(array.slice(i, i + size));
    }
    return batches;
  }

  /**
   * Handle Axios errors
   */
  private handleAxiosError(error: AxiosError, operation: string): void {
    const response = error.response;
    const statusCode = response?.status;
    const data = response?.data as CloudflareApiResponse | undefined;

    this.logger?.error(`Cloudflare ${operation} failed`, error, {
      statusCode,
      errors: data?.errors,
    });
  }
}

/**
 * Create a Cloudflare client
 */
export function createCloudflareClient(config: CloudflareClientConfig): CloudflareClient {
  return new CloudflareClient(config);
}
