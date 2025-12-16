/**
 * Cloudflare Service
 *
 * Service layer for Cloudflare integration including cache purging,
 * Turnstile verification, and CDN configuration.
 */
import axios, { type AxiosInstance } from 'axios';

import { BaseService } from './base.js';
import type { Logger } from '../utils/logger.js';
import type { ICloudflareService } from './interfaces.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import { getConfig } from '../config/index.js';

/**
 * Cloudflare API endpoints
 */
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * CloudflareService class
 *
 * Handles all Cloudflare-related functionality:
 * - Cache purging for videos, pages, and assets
 * - Turnstile CAPTCHA verification
 * - CDN configuration management
 */
export class CloudflareService extends BaseService implements ICloudflareService {
  private readonly videosRepository: VideosRepository;
  private httpClient: AxiosInstance | null = null;

  constructor(logger: Logger, videosRepository: VideosRepository) {
    super('CloudflareService', logger);
    this.videosRepository = videosRepository;
    this.initializeHttpClient();
  }

  /**
   * Initialize HTTP client with Cloudflare credentials
   */
  private initializeHttpClient(): void {
    try {
      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      if (nodeSettings.isCloudflareCdnEnabled && nodeSettings.cloudflareGlobalApiKey) {
        this.httpClient = axios.create({
          baseURL: CLOUDFLARE_API_BASE,
          headers: {
            'X-Auth-Email': nodeSettings.cloudflareEmailAddress,
            'X-Auth-Key': nodeSettings.cloudflareGlobalApiKey,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch {
      this.logger.debug('Cloudflare client not configured');
    }
  }

  /**
   * Check if Cloudflare is enabled
   */
  isEnabled(): boolean {
    const config = getConfig();
    return config.nodeSettings.isCloudflareCdnEnabled;
  }

  /**
   * Validate Cloudflare Turnstile token
   */
  async validateTurnstileToken(token: string, ip: string): Promise<boolean> {
    return this.withErrorLogging('validateTurnstileToken', async () => {
      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      if (!nodeSettings.isCloudflareTurnstileEnabled) {
        // Turnstile not enabled - always pass
        return true;
      }

      if (!nodeSettings.cloudflareTurnstileSecretKey) {
        this.logger.warn('Turnstile enabled but secret key not configured');
        return false;
      }

      const response = await axios.post<{ success: boolean }>(TURNSTILE_VERIFY_URL, {
        secret: nodeSettings.cloudflareTurnstileSecretKey,
        response: token,
        remoteip: ip,
      });

      return response.data.success;
    });
  }

  /**
   * Purge watch pages cache
   */
  async purgeWatchPages(videoIds?: string[]): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const nodeBaseUrl = config.getNodeBaseUrl();

      const ids = videoIds ?? [];
      if (ids.length === 0) {
        // Get all videos if none specified
        const videos = await this.videosRepository.findAll({ limit: 10000 });
        ids.push(...videos.map((v) => v.video_id));
      }

      const files = ids.map((id) => `${nodeBaseUrl}/watch?v=${id}`);
      await this.purgeCache(files, 'purgeWatchPages');
    } catch (error) {
      this.logger.error('Failed to purge watch pages', error);
    }
  }

  /**
   * Purge all watch pages
   */
  async purgeAllWatchPages(): Promise<void> {
    await this.purgeWatchPages();
  }

  /**
   * Purge embed video pages
   */
  async purgeEmbedVideoPages(videoIds?: string[]): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const nodeBaseUrl = config.getNodeBaseUrl();

      const ids = videoIds ?? [];
      if (ids.length === 0) {
        const videos = await this.videosRepository.findAll({ limit: 10000 });
        ids.push(...videos.map((v) => v.video_id));
      }

      const files: string[] = [];
      for (const id of ids) {
        files.push(
          `${nodeBaseUrl}/watch/embed/video/${id}`,
          `${nodeBaseUrl}/watch/embed/video/${id}?autostart=0`,
          `${nodeBaseUrl}/watch/embed/video/${id}?autostart=1`
        );
      }

      await this.purgeCache(files, 'purgeEmbedVideoPages');
    } catch (error) {
      this.logger.error('Failed to purge embed pages', error);
    }
  }

  /**
   * Purge all embed video pages
   */
  async purgeAllEmbedVideoPages(): Promise<void> {
    await this.purgeEmbedVideoPages();
  }

  /**
   * Purge node page cache
   */
  async purgeNodePage(): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const nodeBaseUrl = config.getNodeBaseUrl();

      const files = [
        `${nodeBaseUrl}/node`,
        `${nodeBaseUrl}/node?searchTerm=&sortTerm=latest&tagTerm=`,
        `${nodeBaseUrl}/node?searchTerm=&sortTerm=popular&tagTerm=`,
        `${nodeBaseUrl}/node?searchTerm=&sortTerm=oldest&tagTerm=`,
        `${nodeBaseUrl}/node/search?searchTerm=&sortTerm=latest&tagTerm=`,
        `${nodeBaseUrl}/node/search?searchTerm=&sortTerm=popular&tagTerm=`,
        `${nodeBaseUrl}/node/search?searchTerm=&sortTerm=oldest&tagTerm=`,
      ];

      await this.purgeCache(files, 'purgeNodePage');
    } catch (error) {
      this.logger.error('Failed to purge node page', error);
    }
  }

  /**
   * Purge node images cache
   */
  async purgeNodeImages(): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const baseUrl = config.getExternalResourcesBaseUrl();

      const files = [
        `${baseUrl}/external/resources/images/icon.png`,
        `${baseUrl}/external/resources/images/avatar.png`,
        `${baseUrl}/external/resources/images/banner.png`,
      ];

      await this.purgeCache(files, 'purgeNodeImages');
    } catch (error) {
      this.logger.error('Failed to purge node images', error);
    }
  }

  /**
   * Purge video content (adaptive streams)
   */
  async purgeAdaptiveVideos(videoId: string): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const baseUrl = config.getExternalVideosBaseUrl();

      // Would need to query outputs to get all resolution files
      const files = [
        `${baseUrl}/external/videos/${videoId}/adaptive/m3u8/static/manifests/manifest-master.m3u8`,
      ];

      await this.purgeCache(files, 'purgeAdaptiveVideos');
    } catch (error) {
      this.logger.error('Failed to purge adaptive videos', error, { videoId });
    }
  }

  /**
   * Purge video content (progressive downloads)
   */
  async purgeProgressiveVideos(videoId: string): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const baseUrl = config.getExternalVideosBaseUrl();

      const formats = ['mp4', 'webm', 'ogv'];
      const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];

      const files: string[] = [];
      for (const format of formats) {
        for (const resolution of resolutions) {
          files.push(
            `${baseUrl}/external/videos/${videoId}/progressive/${format}/${resolution}.${format}`
          );
        }
      }

      await this.purgeCache(files, 'purgeProgressiveVideos');
    } catch (error) {
      this.logger.error('Failed to purge progressive videos', error, { videoId });
    }
  }

  /**
   * Purge video preview images
   */
  async purgeVideoPreviewImages(videoIds: string[]): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const baseUrl = config.getExternalVideosBaseUrl();

      const files = videoIds.map(
        (videoId) => `${baseUrl}/external/videos/${videoId}/images/preview.jpg`
      );
      await this.purgeCache(files, 'purgeVideoPreviewImages');
    } catch (error) {
      this.logger.error('Failed to purge preview images', error, { videoIds });
    }
  }

  /**
   * Purge video poster images
   */
  async purgeVideoPosterImages(videoIds: string[]): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const baseUrl = config.getExternalVideosBaseUrl();

      const files = videoIds.map(
        (videoId) => `${baseUrl}/external/videos/${videoId}/images/poster.jpg`
      );
      await this.purgeCache(files, 'purgeVideoPosterImages');
    } catch (error) {
      this.logger.error('Failed to purge poster images', error, { videoIds });
    }
  }

  /**
   * Purge video thumbnail images
   */
  async purgeVideoThumbnailImages(videoIds: string[]): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const baseUrl = config.getExternalVideosBaseUrl();

      const files = videoIds.map(
        (videoId) => `${baseUrl}/external/videos/${videoId}/images/thumbnail.jpg`
      );
      await this.purgeCache(files, 'purgeVideoThumbnailImages');
    } catch (error) {
      this.logger.error('Failed to purge thumbnail images', error, { videoIds });
    }
  }

  /**
   * Purge entire video cache (all formats and images)
   */
  async purgeVideo(videoId: string): Promise<void> {
    await this.purgeAdaptiveVideos(videoId);
    await this.purgeProgressiveVideos(videoId);
    await this.purgeVideoPreviewImages([videoId]);
    await this.purgeVideoPosterImages([videoId]);
    await this.purgeVideoThumbnailImages([videoId]);
  }

  /**
   * Purge entire cache
   */
  async purgeEntireCache(): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const zoneId = config.nodeSettings.cloudflareZoneId;

      await this.httpClient.post(`/zones/${zoneId}/purge_cache`, {
        purge_everything: true,
      });

      this.logger.info('Entire cache purged');
    } catch (error) {
      this.logger.error('Failed to purge entire cache', error);
    }
  }

  /**
   * Purge entire cache with explicit credentials (for configuration changes)
   */
  async purgeEntireCacheWithCredentials(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string
  ): Promise<void> {
    try {
      await axios.post(
        `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/purge_cache`,
        { purge_everything: true },
        {
          headers: {
            'X-Auth-Email': cloudflareEmailAddress,
            'X-Auth-Key': cloudflareGlobalApiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      this.logger.info('Entire cache purged with explicit credentials');
    } catch (error) {
      this.logger.error('Failed to purge entire cache with credentials', error);
      throw error;
    }
  }

  /**
   * Set CDN configuration - creates cache rules, enables tiered caching, etc.
   */
  async setCdnConfiguration(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string
  ): Promise<void> {
    const headers = {
      'X-Auth-Email': cloudflareEmailAddress,
      'X-Auth-Key': cloudflareGlobalApiKey,
      'Content-Type': 'application/json',
    };

    this.logger.info('Setting Cloudflare CDN configuration for MoarTube Node');

    // Create http_request_cache_settings phase ruleset
    const newZoneRuleSet = {
      rules: [
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
          description: 'Node Watch - Watch Page for Displaying a Video',
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
          description: 'Node Search - Cache Searches on the Node Page',
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
          description: 'Node Page - Cache for Different Variations of the Node Page',
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
          description: 'Node External - Cache Bypass for Live (dynamic) HLS stream manifests',
          action: 'set_cache_settings',
          enabled: true,
          expression:
            '(http.request.uri.path contains "/adaptive/m3u8/dynamic/") and (http.request.method == "GET")',
          action_parameters: { cache: false },
        },
      ],
    };

    await axios.put(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/rulesets/phases/http_request_cache_settings/entrypoint`,
      newZoneRuleSet,
      { headers }
    );

    this.logger.info('Created zone http_request_cache_settings phase ruleset');

    // Set Browser Cache TTL to "Respect Existing Headers"
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/settings/browser_cache_ttl`,
      { value: 0 },
      { headers }
    );

    this.logger.info('Set Browser Cache TTL to Respect Existing Headers');

    // Enable Always Use HTTPS
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/settings/always_use_https`,
      { value: 'on' },
      { headers }
    );

    this.logger.info('Enabled Always Use HTTPS');

    // Enable Argo Tiered Caching
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/argo/tiered_caching`,
      { value: 'on' },
      { headers }
    );

    this.logger.info('Enabled Argo Tiered Caching');

    // Enable Tiered Cache Smart Topology
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/cache/tiered_cache_smart_topology_enable`,
      { value: 'on' },
      { headers }
    );

    this.logger.info('Enabled Tiered Cache Smart Topology');
    this.logger.info('Successfully set Cloudflare CDN configuration');
  }

  /**
   * Reset CDN configuration - removes cache rules, disables tiered caching
   */
  async resetCdn(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string
  ): Promise<void> {
    const headers = {
      'X-Auth-Email': cloudflareEmailAddress,
      'X-Auth-Key': cloudflareGlobalApiKey,
      'Content-Type': 'application/json',
    };

    this.logger.info('Resetting Cloudflare CDN configuration');

    // Get all rulesets in the zone
    const response = await axios.get<{
      success: boolean;
      result: Array<{ id: string; phase: string }>;
    }>(`${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/rulesets`, { headers });

    if (response.data.success) {
      // Delete http_request_cache_settings phase rulesets
      for (const ruleSet of response.data.result) {
        if (ruleSet.phase === 'http_request_cache_settings') {
          this.logger.info(`Deleting ruleset: ${ruleSet.id}`);
          await axios.delete(
            `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/rulesets/${ruleSet.id}`,
            { headers }
          );
        }
      }
    }

    // Disable Argo Tiered Caching
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/argo/tiered_caching`,
      { value: 'off' },
      { headers }
    );

    this.logger.info('Disabled Argo Tiered Caching');

    // Disable Tiered Cache Smart Topology
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/cache/tiered_cache_smart_topology_enable`,
      { value: 'off' },
      { headers }
    );

    this.logger.info('Disabled Tiered Cache Smart Topology');

    // Remove CDN related DNS records
    await this.removeCdnDnsRecords(
      cloudflareEmailAddress,
      cloudflareZoneId,
      cloudflareGlobalApiKey
    );

    this.logger.info('Successfully reset Cloudflare CDN configuration');
  }

  /**
   * Add CDN DNS record for storage configuration
   */
  async addCdnDnsRecord(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string,
    storageConfig: {
      storageMode: 'filesystem' | 's3provider';
      s3Config?:
        | {
            bucketName: string;
            s3ProviderClientConfig: {
              endpoint?: string | undefined;
              region: string;
              forcePathStyle?: boolean;
              credentials?: {
                accessKeyId: string;
                secretAccessKey: string;
              };
            };
          }
        | undefined;
    }
  ): Promise<void> {
    const headers = {
      'X-Auth-Email': cloudflareEmailAddress,
      'X-Auth-Key': cloudflareGlobalApiKey,
      'Content-Type': 'application/json',
    };

    // First remove existing CDN DNS records
    await this.removeCdnDnsRecords(
      cloudflareEmailAddress,
      cloudflareZoneId,
      cloudflareGlobalApiKey
    );

    if (storageConfig.storageMode === 's3provider' && storageConfig.s3Config) {
      const bucketName = storageConfig.s3Config.bucketName;
      const recordName = bucketName;
      let recordContent: string;

      const endpoint = storageConfig.s3Config.s3ProviderClientConfig.endpoint;

      if (endpoint !== undefined && endpoint !== '') {
        // Non-AWS S3 provider
        const url = new URL(endpoint);
        recordContent = `${bucketName}.${url.hostname}`;
      } else {
        // AWS S3
        const region = storageConfig.s3Config.s3ProviderClientConfig.region;
        recordContent = `${bucketName}.s3.${region}.amazonaws.com`;
      }

      this.logger.info(`Adding DNS record: ${recordName} -> ${recordContent}`);

      await axios.post(
        `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/dns_records`,
        {
          type: 'CNAME',
          name: recordName,
          content: recordContent,
          ttl: 1,
          proxied: true,
        },
        { headers }
      );

      this.logger.info('DNS record added successfully');
    }
  }

  /**
   * Validate Cloudflare credentials by making an API call
   */
  async validateCredentials(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string
  ): Promise<boolean> {
    try {
      const headers = {
        'X-Auth-Email': cloudflareEmailAddress,
        'X-Auth-Key': cloudflareGlobalApiKey,
        'Content-Type': 'application/json',
      };

      const response = await axios.get<{ success: boolean }>(
        `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}`,
        { headers }
      );

      return response.data.success;
    } catch (error) {
      this.logger.error('Failed to validate Cloudflare credentials', error);
      return false;
    }
  }

  /**
   * Remove CDN-related DNS records
   */
  private async removeCdnDnsRecords(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string
  ): Promise<void> {
    const headers = {
      'X-Auth-Email': cloudflareEmailAddress,
      'X-Auth-Key': cloudflareGlobalApiKey,
      'Content-Type': 'application/json',
    };

    const response = await axios.get<{
      success: boolean;
      result: Array<{ id: string; name: string }>;
    }>(`${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/dns_records`, { headers });

    if (response.data.success) {
      for (const dnsRecord of response.data.result) {
        if (
          dnsRecord.name.includes('externalvideos') ||
          dnsRecord.name.includes('testingexternalvideos')
        ) {
          this.logger.info(`Removing DNS record: ${dnsRecord.name}`);
          await axios.delete(
            `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/dns_records/${dnsRecord.id}`,
            { headers }
          );
        }
      }
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Purge specific files from Cloudflare cache
   */
  private async purgeCache(files: string[], operation: string): Promise<void> {
    if (!this.httpClient || files.length === 0) {
      return;
    }

    try {
      const config = getConfig();
      const zoneId = config.nodeSettings.cloudflareZoneId;

      // Cloudflare allows up to 30 files per request
      const batchSize = 30;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);

        await this.httpClient.post(`/zones/${zoneId}/purge_cache`, {
          files: batch,
        });
      }

      this.logger.debug(`${operation}: purged ${String(files.length)} files`);
    } catch (error) {
      this.logger.error(`${operation} failed`, error);
    }
  }
}
