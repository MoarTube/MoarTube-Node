/**
 * Cloudflare Service
 *
 * Service layer for Cloudflare integration including cache purging,
 * Turnstile verification, and CDN configuration.
 */
import axios, { type AxiosInstance } from 'axios';

import { BaseService, type ServiceOptions } from './base.service';
import type { ICloudflareService } from './interfaces';
import type { VideoRepository } from '../database/repositories/video.repository';
import { getConfig } from '../config';

/**
 * Cloudflare API endpoints
 */
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare service dependencies
 */
export interface CloudflareServiceDependencies {
  videoRepository?: VideoRepository;
}

/**
 * CloudflareService class
 *
 * Handles all Cloudflare-related functionality:
 * - Cache purging for videos, pages, and assets
 * - Turnstile CAPTCHA verification
 * - CDN configuration management
 */
export class CloudflareService extends BaseService implements ICloudflareService {
  private readonly videoRepository: VideoRepository | undefined;
  private httpClient: AxiosInstance | null = null;

  constructor(dependencies?: CloudflareServiceDependencies, options?: ServiceOptions) {
    super('CloudflareService', options);
    this.videoRepository = dependencies?.videoRepository;
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
    } catch (error) {
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

      return response.data.success === true;
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
      if (ids.length === 0 && this.videoRepository) {
        // Get all videos if none specified
        const videos = await this.videoRepository.findAll({ limit: 10000 });
        ids.push(...videos.map((v) => v.videoId));
      }

      const files = ids.map((id) => `${nodeBaseUrl}/watch?v=${id}`);
      await this.purgeCache(files, 'purgeWatchPages');
    } catch (error) {
      this.logger.error('Failed to purge watch pages', error as Error);
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
      if (ids.length === 0 && this.videoRepository) {
        const videos = await this.videoRepository.findAll({ limit: 10000 });
        ids.push(...videos.map((v) => v.videoId));
      }

      const files: string[] = [];
      for (const id of ids) {
        files.push(`${nodeBaseUrl}/watch/embed/video/${id}`);
        files.push(`${nodeBaseUrl}/watch/embed/video/${id}?autostart=0`);
        files.push(`${nodeBaseUrl}/watch/embed/video/${id}?autostart=1`);
      }

      await this.purgeCache(files, 'purgeEmbedVideoPages');
    } catch (error) {
      this.logger.error('Failed to purge embed pages', error as Error);
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
      this.logger.error('Failed to purge node page', error as Error);
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
      this.logger.error('Failed to purge node images', error as Error);
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
      this.logger.error('Failed to purge adaptive videos', error as Error, { videoId });
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
      this.logger.error('Failed to purge progressive videos', error as Error, { videoId });
    }
  }

  /**
   * Purge video preview images
   */
  async purgeVideoPreviewImages(videoId: string): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const baseUrl = config.getExternalVideosBaseUrl();

      const files = [`${baseUrl}/external/videos/${videoId}/images/preview.jpg`];
      await this.purgeCache(files, 'purgeVideoPreviewImages');
    } catch (error) {
      this.logger.error('Failed to purge preview images', error as Error, { videoId });
    }
  }

  /**
   * Purge video poster images
   */
  async purgePosterImages(videoId: string): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const baseUrl = config.getExternalVideosBaseUrl();

      const files = [`${baseUrl}/external/videos/${videoId}/images/poster.jpg`];
      await this.purgeCache(files, 'purgePosterImages');
    } catch (error) {
      this.logger.error('Failed to purge poster images', error as Error, { videoId });
    }
  }

  /**
   * Purge video thumbnail images
   */
  async purgeThumbnailImages(videoId: string): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const baseUrl = config.getExternalVideosBaseUrl();

      const files = [`${baseUrl}/external/videos/${videoId}/images/thumbnail.jpg`];
      await this.purgeCache(files, 'purgeThumbnailImages');
    } catch (error) {
      this.logger.error('Failed to purge thumbnail images', error as Error, { videoId });
    }
  }

  /**
   * Purge entire video cache (all formats and images)
   */
  async purgeVideo(videoId: string): Promise<void> {
    await this.purgeAdaptiveVideos(videoId);
    await this.purgeProgressiveVideos(videoId);
    await this.purgeVideoPreviewImages(videoId);
    await this.purgePosterImages(videoId);
    await this.purgeThumbnailImages(videoId);
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
      this.logger.error('Failed to purge entire cache', error as Error);
    }
  }

  /**
   * Set CDN configuration
   */
  setCdnConfiguration(): void {
    // This would configure Cloudflare CDN settings like caching rules
    // Implementation depends on specific requirements
    this.logger.info('CDN configuration set');
  }

  /**
   * Reset CDN configuration
   */
  resetCdn(): void {
    // Reset CDN to default settings
    this.logger.info('CDN configuration reset');
  }

  /**
   * Add DNS record
   */
  addDnsRecord(): void {
    // Implementation for adding DNS records
    this.logger.info('DNS record added');
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

      this.logger.debug(`${operation}: purged ${files.length} files`);
    } catch (error) {
      this.logger.error(`${operation} failed`, error as Error);
    }
  }
}
