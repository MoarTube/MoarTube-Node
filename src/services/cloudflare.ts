/**
 * Cloudflare Service
 *
 * Service layer for Cloudflare integration including cache purging,
 * Turnstile verification, and CDN configuration.
 */
import {
  cloudflareOptions,
  distributionSignal,
  withCloudflareDeadline,
  withCloudflareRecovery,
} from '@/utils/cloudflare-http.js';
import axios, { type AxiosInstance } from 'axios';
import { setTimeout as delay } from 'node:timers/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { purgeOutbox, type PurgeEntry } from '@/utils/purge-outbox.js';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { validateCdnSettings, cdnDnsTarget } from '@/utils/cdn-settings.js';
import type { NodeSettings, StorageConfig } from '@/types/config.js';

import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import type {
  IVideosRepository,
  SQLiteVideo,
  SQLiteNewVideo,
  PostgresVideo,
  PostgresNewVideo,
} from '@database/index.js';

// Common interface for video objects (both SQLite and PostgreSQL types have the same structure)
interface VideoWithId {
  video_id: string;
}
import { getConfig } from '@config/index.js';

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
export class CloudflareService extends BaseService {
  private readonly videosRepository:
    | IVideosRepository<SQLiteVideo, SQLiteNewVideo>
    | IVideosRepository<PostgresVideo, PostgresNewVideo>;
  private httpClient: AxiosInstance | null = null;
  private httpClientSettings: { email: string; key: string } | null = null;
  private readonly pendingPurges = new Map<string, Set<string>>();
  private readonly purgeVersions = new Map<string, Map<string, number>>();
  private purgeGeneration = 0;
  private readonly pendingAdaptiveInventories = new Map<string, Set<string>>();
  private readonly purgeNotBefore = new Map<string, number>();
  private retrying = false;

  private outbox(): ReturnType<typeof purgeOutbox> | undefined {
    const config: { paths?: { nodeSettingsPath?: string } } = getConfig();
    const settingsPath = config.paths?.nodeSettingsPath;
    return settingsPath ? purgeOutbox(settingsPath + '.purges.sqlite') : undefined;
  }

  /** Prefix purges include every query variant and all embed routes below /watch. */
  async purgePublicPages(strict = false): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }
    await this.purgePrefixes(
      ['/watch', '/videos', '/node/search'].map((route) => getConfig().getNodeBaseUrl() + route),
      strict
    );
  }

  async purgePrefixes(urls: string[], strict = false): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }
    try {
      const targets = this.prefixTargets(urls);
      await this.purgeCache(targets, 'purgePrefixes');
    } catch (error) {
      this.logger.error('Prefix invalidation incomplete; retained for retry', error);
      if (strict) {
        throw error;
      }
    }
  }

  private prefixTargets(urls: string[]): string[] {
    return urls.map((value) => {
      const url = new URL(value);
      return 'prefix:' + url.host + url.pathname;
    });
  }

  /** Called by the master, including after restart, to drain all workers' durable work. */
  async retryPendingPurges(): Promise<void> {
    if (this.retrying) {
      return;
    }
    this.retrying = true;
    try {
      const enabled = this.isEnabled() && this.httpClient !== null;
      const failures: unknown[] = [];
      if (enabled) {
        try {
          await this.purgeCache([], 'retryPendingPurges');
        } catch (error) {
          failures.push(error);
        }
      }
      const journal = this.outbox();
      const previous = journal?.pendingCredentials() ?? [];
      journal?.close();
      for (const credentials of previous) {
        if (enabled && credentials.zone === getConfig().nodeSettings.cloudflareZoneId) {
          continue;
        }
        try {
          await this.purgeEntireCacheWithCredentials(
            credentials.email,
            credentials.zone,
            credentials.key
          );
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length) {
        throw new AggregateError(failures, 'Pending invalidation incomplete');
      }
    } finally {
      this.retrying = false;
    }
  }

  async validateCdnConfiguration(
    email: string,
    zoneId: string,
    key: string,
    settings: Pick<NodeSettings, 'publicNodeAddress' | 'storageConfig'>
  ): Promise<void> {
    validateCdnSettings(settings);
    const response = await axios.get<{ success: boolean; result: { name: string } }>(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}`,
      {
        ...cloudflareOptions({ 'X-Auth-Email': email, 'X-Auth-Key': key }),
      }
    );
    if (!response.data.success || response.data.result.name === '') {
      throw new Error('Could not validate the Cloudflare zone.');
    }
    const hostname = validateCdnSettings(settings, response.data.result.name);
    if (
      settings.storageConfig.storageMode === 's3provider' &&
      hostname.split('.').length > response.data.result.name.split('.').length + 1
    ) {
      let covered = false;
      for (const endpoint of ['ssl/certificate_packs', 'custom_certificates']) {
        for (let page = 1; ; page++) {
          const packs = await axios.get<{
            success: boolean;
            result?: Array<{ status?: string; hosts?: string[]; expires_on?: string }>;
            result_info?: { total_pages: number };
          }>(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/${endpoint}`, {
            ...cloudflareOptions({ 'X-Auth-Email': email, 'X-Auth-Key': key }),
            params: { page, per_page: 50, status: 'active' },
          });
          if (!packs.data.success) {
            throw new Error('Could not verify Cloudflare certificate coverage.');
          }
          const certificates = packs.data.result ?? [];
          covered ||= certificates.some(
            (pack) =>
              pack.status === 'active' &&
              (pack.expires_on === undefined || Date.parse(pack.expires_on) > Date.now()) &&
              (pack.hosts ?? []).some(
                (host) =>
                  host.toLowerCase() === hostname ||
                  (host.startsWith('*.') &&
                    hostname.slice(hostname.indexOf('.') + 1) === host.slice(2).toLowerCase())
              )
          );
          const complete = packs.data.result_info
            ? page >= packs.data.result_info.total_pages
            : certificates.length < 50;
          if (covered || complete) {
            break;
          }
        }
        if (covered) {
          break;
        }
      }
      if (!covered) {
        throw new Error(
          `Cloudflare requires an active edge certificate covering ${hostname}; standard Universal SSL for this zone does not cover that hostname.`
        );
      }
    }
  }

  /** Snapshot before touching a dedicated zone, and restore it on any required-step failure. */
  async withConfigurationRollback<T>(
    email: string,
    zone: string,
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return withCloudflareDeadline(() => this.changeWithRollback(email, zone, key, operation));
  }

  private async changeWithRollback<T>(
    email: string,
    zone: string,
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const headers = { 'X-Auth-Email': email, 'X-Auth-Key': key };
    const base = `${CLOUDFLARE_API_BASE}/zones/${zone}`;
    const options = cloudflareOptions(headers);
    const rulesUrl = `${base}/rulesets/phases/http_request_cache_settings/entrypoint`;
    let rules: { id: string; rules: unknown[] } | undefined;
    try {
      rules = (await axios.get<{ result: typeof rules }>(rulesUrl, options)).data.result;
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status !== 404) {
        throw error;
      }
    }
    const settings = await Promise.all(
      [
        'settings/browser_cache_ttl',
        'settings/cache_level',
        'settings/always_use_https',
        'argo/tiered_caching',
        'cache/tiered_cache_smart_topology_enable',
      ].map(async (endpoint) => ({
        endpoint,
        value: (await axios.get<{ result: { value: unknown } }>(`${base}/${endpoint}`, options))
          .data.result.value,
      }))
    );
    const dns = await this.listDnsRecords(email, zone, key);
    try {
      return await operation();
    } catch (failure) {
      return withCloudflareRecovery(async () => {
        const options = cloudflareOptions(headers);
        const recovery: unknown[] = [];
        const restore = async (work: () => Promise<unknown>): Promise<void> => {
          try {
            await work();
          } catch (error) {
            recovery.push(error);
          }
        };
        if (rules) {
          await restore(() => axios.put(rulesUrl, { rules: rules.rules }, options));
        } else {
          await restore(async () => {
            try {
              const current = await axios.get<{ result: { id: string } }>(rulesUrl, options);
              await axios.delete(`${base}/rulesets/${current.data.result.id}`, options);
            } catch (error) {
              if ((error as { response?: { status?: number } }).response?.status !== 404) {
                throw error;
              }
            }
          });
        }
        for (const setting of settings) {
          await restore(() =>
            axios.patch(`${base}/${setting.endpoint}`, { value: setting.value }, options)
          );
        }
        await restore(async () => {
          const current = await this.listDnsRecords(email, zone, key);
          for (const record of current) {
            if (!dns.some((old) => old.id === record.id)) {
              await axios.delete(`${base}/dns_records/${record.id}`, options);
            }
          }
          for (const record of dns) {
            const existing = current.find((item) => item.id === record.id);
            const { id } = record;
            // Cloudflare responses also contain read-only timestamps and zone metadata.
            const body = Object.fromEntries(
              Object.entries(record as unknown as Record<string, unknown>).filter(([field]) =>
                [
                  'name',
                  'type',
                  'content',
                  'ttl',
                  'proxied',
                  'priority',
                  'data',
                  'comment',
                  'tags',
                  'settings',
                ].includes(field)
              )
            );
            if (existing) {
              await axios.put(`${base}/dns_records/${id}`, body, options);
            } else {
              await axios.post(`${base}/dns_records`, body, options);
            }
          }
        });
        if (recovery.length) {
          throw new AggregateError(
            [failure, ...recovery],
            'Cloudflare change failed and recovery is incomplete; reapply the previous configuration.'
          );
        }
        throw new Error('Cloudflare change failed; the previous zone configuration was restored.', {
          cause: failure,
        });
      });
    }
  }

  constructor(
    logger: Logger,
    videosRepository:
      | IVideosRepository<SQLiteVideo, SQLiteNewVideo>
      | IVideosRepository<PostgresVideo, PostgresNewVideo>
  ) {
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
        if (
          this.httpClientSettings?.email === nodeSettings.cloudflareEmailAddress &&
          this.httpClientSettings.key === nodeSettings.cloudflareGlobalApiKey
        ) {
          return;
        }
        this.httpClient = axios.create({
          baseURL: CLOUDFLARE_API_BASE,
          timeout: 10_000,
          headers: {
            'X-Auth-Email': nodeSettings.cloudflareEmailAddress,
            'X-Auth-Key': nodeSettings.cloudflareGlobalApiKey,
            'Content-Type': 'application/json',
          },
        });
        this.httpClientSettings = {
          email: nodeSettings.cloudflareEmailAddress,
          key: nodeSettings.cloudflareGlobalApiKey,
        };
      } else {
        this.httpClient = null;
        this.httpClientSettings = null;
      }
    } catch {
      this.httpClient = null;
      this.httpClientSettings = null;
      this.logger.debug('Cloudflare client not configured');
    }
  }

  /**
   * Check if Cloudflare is enabled
   */
  isEnabled(): boolean {
    this.initializeHttpClient();
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
   * Purge watch pages and their shared comment freshness markers
   */
  async purgeWatchPages(videoIds?: string[], strict = false): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      const config = getConfig();
      const nodeBaseUrl = config.getNodeBaseUrl();

      const prefixes = this.prefixTargets([nodeBaseUrl + '/watch', nodeBaseUrl + '/videos']);

      if (videoIds?.length) {
        for (let offset = 0; offset < videoIds.length; offset += 100) {
          await this.purgeCache(
            [
              ...prefixes,
              ...videoIds
                .slice(offset, offset + 100)
                .flatMap((id) => [
                  nodeBaseUrl + '/watch?v=' + id,
                  nodeBaseUrl + '/videos/' + id + '/comments/state',
                ]),
            ],
            'purgeWatchPages'
          );
        }
      } else {
        for (let offset = 0; ; offset += 100) {
          const videos = await this.videosRepository.findAll({ limit: 100, offset });
          await this.purgeCache(
            [
              ...prefixes,
              ...videos.flatMap((video: VideoWithId) => [
                nodeBaseUrl + '/watch?v=' + video.video_id,
                nodeBaseUrl + '/videos/' + video.video_id + '/comments/state',
              ]),
            ],
            'purgeWatchPages'
          );
          if (videos.length < 100) {
            break;
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to purge watch pages', error);
      if (strict) {
        throw error;
      }
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

      for (let offset = 0; ; offset += 100) {
        const ids = videoIds?.length
          ? videoIds.slice(offset, offset + 100)
          : (await this.videosRepository.findAll({ limit: 100, offset })).map(
              (video: VideoWithId) => video.video_id
            );
        const files = ids.flatMap((id) => [
          nodeBaseUrl + '/watch/embed/video/' + id,
          nodeBaseUrl + '/watch/embed/video/' + id + '?autostart=0',
          nodeBaseUrl + '/watch/embed/video/' + id + '?autostart=1',
        ]);
        await this.purgeCache(files, 'purgeEmbedVideoPages');
        if (ids.length < 100 || (videoIds?.length && offset + 100 >= videoIds.length)) {
          break;
        }
      }
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
        `${nodeBaseUrl}/videos`,
        `${nodeBaseUrl}/videos/`,
        `${nodeBaseUrl}/videos?searchTerm=&sortTerm=latest&tagTerm=`,
        `${nodeBaseUrl}/videos?searchTerm=&sortTerm=popular&tagTerm=`,
        `${nodeBaseUrl}/videos?searchTerm=&sortTerm=oldest&tagTerm=`,
        `${nodeBaseUrl}/node/search?searchTerm=&sortTerm=latest&tagTerm=`,
        `${nodeBaseUrl}/node/search?searchTerm=&sortTerm=popular&tagTerm=`,
        `${nodeBaseUrl}/node/search?searchTerm=&sortTerm=oldest&tagTerm=`,
      ];

      await this.purgeCache(
        [
          ...files,
          ...this.prefixTargets(
            ['/watch', '/videos', '/node/search'].map((route) => nodeBaseUrl + route)
          ),
        ],
        'purgeNodePage'
      );
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

      await this.purgeCache([...files, ...this.prefixTargets(files)], 'purgeNodeImages');
    } catch (error) {
      this.logger.error('Failed to purge node images', error);
    }
  }

  /**
   * Purge video content (adaptive streams)
   */
  async getAdaptiveVideoUrls(videoId: string): Promise<string[]> {
    if (!this.isEnabled()) {
      return [];
    }
    const config = getConfig();
    const base = config.getExternalVideosBaseUrl();
    const storage = config.nodeSettings.storageConfig;
    const urls: string[] = [];
    if (storage.storageMode === 'filesystem') {
      for (const resolution of ['240p', '360p', '480p', '720p', '1080p', '1440p', '2160p']) {
        try {
          const names = await readdir(
            path.join(config.paths.videosDirectoryPath, videoId, 'adaptive', 'm3u8', resolution)
          );
          for (const name of names) {
            if (/^[a-zA-Z0-9_-]+\.ts$/.test(name)) {
              urls.push(
                `${base}/external/videos/${videoId}/adaptive/m3u8/${resolution}/segments/${name}`
              );
            }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
      }
    } else if (storage.s3Config) {
      const { endpoint, ...provider } = storage.s3Config.s3ProviderClientConfig;
      const client = new S3Client({
        ...provider,
        ...(endpoint ? { endpoint } : {}),
        requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
      });
      let token: string | undefined;
      const seen = new Set<string>();
      const signal = distributionSignal();
      try {
        do {
          const page = await client.send(
            new ListObjectsV2Command({
              Bucket: storage.s3Config.bucketName,
              Prefix: `external/videos/${videoId}/adaptive/m3u8/`,
              ContinuationToken: token,
            }),
            signal ? { abortSignal: signal } : {}
          );
          for (const object of page.Contents ?? []) {
            if (object.Key?.endsWith('.ts')) {
              urls.push(`${base}/${object.Key}`);
            }
          }
          token = page.IsTruncated ? page.NextContinuationToken : undefined;
          if (page.IsTruncated) {
            if (token === undefined || token === '' || seen.has(token)) {
              throw new Error('Invalid S3 inventory continuation token');
            }
            seen.add(token);
          }
        } while (token);
      } finally {
        client.destroy();
      }
    }
    return urls;
  }

  async purgeAdaptiveVideos(
    videoId: string,
    capturedUrls?: string[],
    strict = false
  ): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }
    const config = getConfig();
    const zone = config.nodeSettings.cloudflareZoneId;
    const pending = this.pendingAdaptiveInventories.get(zone) ?? new Set<string>();
    this.pendingAdaptiveInventories.set(zone, pending);
    const failures: unknown[] = [];
    let base: string;
    try {
      base = config.getExternalVideosBaseUrl();
    } catch (error) {
      pending.add(videoId);
      this.logger.error('Failed to purge adaptive videos', error, { videoId });
      if (strict) {
        throw error;
      }
      return;
    }
    const manifests = ['static', 'dynamic'].flatMap((type) =>
      ['master', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p'].map(
        (resolution) =>
          `${base}/external/videos/${videoId}/adaptive/m3u8/${type}/manifests/manifest-${resolution}.m3u8`
      )
    );
    try {
      await this.purgePrefixes([base + '/external/videos/' + videoId + '/adaptive/'], true);
    } catch (error) {
      failures.push(error);
    }
    try {
      await this.purgeCache(manifests, 'purgeAdaptiveVideos');
    } catch (error) {
      failures.push(error);
    }
    let segments: string[] | undefined;
    try {
      pending.add(videoId);
      segments = capturedUrls ?? (await this.getAdaptiveVideoUrls(videoId));
      pending.delete(videoId);
    } catch (error) {
      failures.push(error);
    }
    if (segments !== undefined) {
      try {
        await this.purgeCache(segments, 'purgeAdaptiveVideos');
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      const error = new AggregateError(
        failures,
        `Cache invalidation incomplete for video ${videoId}; retry invalidation.`
      );
      this.logger.error('Failed to purge adaptive videos', error, { videoId });
      if (strict) {
        throw error;
      }
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

      await this.purgeCache(
        [
          ...files,
          ...this.prefixTargets([baseUrl + '/external/videos/' + videoId + '/progressive/']),
        ],
        'purgeProgressiveVideos'
      );
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
      await this.purgeCache([...files, ...this.prefixTargets(files)], 'purgeVideoPreviewImages');
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
      await this.purgeCache([...files, ...this.prefixTargets(files)], 'purgeVideoPosterImages');
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
      await this.purgeCache([...files, ...this.prefixTargets(files)], 'purgeVideoThumbnailImages');
    } catch (error) {
      this.logger.error('Failed to purge thumbnail images', error, { videoIds });
    }
  }

  /**
   * Purge entire video cache (all formats and images)
   */
  async purgeVideo(videoId: string): Promise<void> {
    await this.purgePrefixes(
      [getConfig().getExternalVideosBaseUrl() + '/external/videos/' + videoId + '/'],
      true
    );
    const adaptive = await Promise.allSettled([this.purgeAdaptiveVideos(videoId, undefined, true)]);
    await this.purgeProgressiveVideos(videoId);
    await this.purgeVideoPreviewImages([videoId]);
    await this.purgeVideoPosterImages([videoId]);
    await this.purgeVideoThumbnailImages([videoId]);
    const pending = this.pendingPurges.get(getConfig().nodeSettings.cloudflareZoneId);
    if (
      adaptive[0].status === 'rejected' ||
      this.pendingAdaptiveInventories
        .get(getConfig().nodeSettings.cloudflareZoneId)
        ?.has(videoId) === true ||
      [...(pending ?? [])].some((url) => url.includes(`/external/videos/${videoId}/`))
    ) {
      throw new Error(
        `Cache invalidation incomplete for video ${videoId}; failed URLs remain queued.`
      );
    }
  }

  /**
   * Purge entire cache
   */
  async purgeEntireCache(): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      await this.purgeCache(['everything'], 'purgeEntireCache');

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
    const journal = this.outbox();
    let entries: PurgeEntry[] = [];
    try {
      journal?.enqueue(cloudflareZoneId, ['everything'], {
        zone: cloudflareZoneId,
        email: cloudflareEmailAddress,
        key: cloudflareGlobalApiKey,
      });
      if ((journal?.notBefore(cloudflareZoneId) ?? 0) > Date.now()) {
        throw new Error('Cloudflare purge deferred until Retry-After expires');
      }
      entries = journal?.snapshot(cloudflareZoneId) ?? [];
      const response = await axios.post(
        `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/purge_cache`,
        { purge_everything: true },
        {
          ...cloudflareOptions({
            'X-Auth-Email': cloudflareEmailAddress,
            'X-Auth-Key': cloudflareGlobalApiKey,
            'Content-Type': 'application/json',
          }),
        }
      );
      const result = response as { data?: { success?: boolean } } | undefined;
      if (result?.data?.success === false) {
        throw new Error('Cloudflare rejected whole-zone purge');
      }
      journal?.acknowledge(cloudflareZoneId, entries);

      this.logger.info('Entire cache purged with explicit credentials');
    } catch (error) {
      const header = (error as { response?: { headers?: Record<string, string> } }).response
        ?.headers?.['retry-after'];
      const seconds = Number(header);
      const until = Number.isFinite(seconds)
        ? Date.now() + seconds * 1000
        : Date.parse(header ?? '');
      if (Number.isFinite(until) && until > Date.now()) {
        journal?.defer(cloudflareZoneId, until);
      }
      this.logger.error('Failed to purge entire cache with credentials', error);
      throw error;
    } finally {
      journal?.close();
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
          description: 'Node External - Legacy Public Media Freshness',
          action: 'set_cache_settings',
          enabled: true,
          expression:
            '(starts_with(http.request.uri.path, "/external/videos/")) and (http.request.uri.path.extension in {"ts" "mp4" "webm" "ogv" "jpg"})',
          action_parameters: {
            cache: true,
            edge_ttl: {
              mode: 'override_origin',
              default: 30,
              status_code_ttl: [
                { status_code_range: { to: 199 }, value: -1 },
                { status_code_range: { from: 201, to: 599 }, value: -1 },
              ],
            },
            browser_ttl: { mode: 'bypass_by_default' },
          },
        },
        {
          description: 'Node External - Video',
          action: 'set_cache_settings',
          enabled: true,
          expression:
            '(starts_with(http.request.uri.path, "/external/videos/")) and (not http.request.uri.path.extension in {"ts" "mp4" "webm" "ogv" "jpg"})',
          action_parameters: {
            cache: true,
            edge_ttl: { mode: 'bypass_by_default' },
            browser_ttl: { mode: 'bypass_by_default' },
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
            edge_ttl: { mode: 'bypass_by_default' },
            browser_ttl: { mode: 'respect_origin' },
          },
        },
        {
          description: 'Node External - Images',
          action: 'set_cache_settings',
          enabled: true,
          expression: '(starts_with(http.request.uri, "/external/resources/images"))',
          action_parameters: {
            cache: true,
            edge_ttl: { mode: 'bypass_by_default' },
            browser_ttl: { mode: 'bypass_by_default' },
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
            browser_ttl: { mode: 'bypass_by_default' },
          },
        },
        {
          description: 'Node Search - Cache Searches on the Node Page',
          action: 'set_cache_settings',
          enabled: true,
          expression: '(starts_with(http.request.uri, "/node/search?searchTerm=&sortTerm"))',
          action_parameters: {
            cache: true,
            edge_ttl: { mode: 'bypass_by_default' },
            browser_ttl: { mode: 'bypass_by_default' },
          },
        },
        {
          description: 'Node Page - Cache for Different Variations of the Node Page',
          action: 'set_cache_settings',
          enabled: true,
          expression:
            '(http.request.uri.path eq "/videos") or (http.request.uri.path eq "/videos/")',
          action_parameters: {
            cache: true,
            edge_ttl: { mode: 'bypass_by_default' },
            browser_ttl: { mode: 'bypass_by_default' },
          },
        },
        {
          description: 'Node Comments - Revisioned Reads and Freshness State',
          action: 'set_cache_settings',
          enabled: true,
          expression:
            '(starts_with(http.request.uri.path, "/videos/")) and (http.request.uri.path contains "/comments") and (http.request.method in {"GET" "HEAD" "PURGE"})',
          action_parameters: {
            cache: true,
            edge_ttl: { mode: 'bypass_by_default' },
            browser_ttl: { mode: 'respect_origin' },
          },
        },
        {
          description: 'Node External - HLS Playlists Respect Origin Freshness',
          action: 'set_cache_settings',
          enabled: true,
          expression:
            '(http.request.uri.path contains "/adaptive/m3u8/") and (ends_with(http.request.uri.path, ".m3u8")) and (http.request.method in {"GET" "HEAD" "PURGE"})',
          action_parameters: {
            cache: true,
            edge_ttl: {
              mode: 'bypass_by_default',
              status_code_ttl: [{ status_code_range: { from: 400, to: 599 }, value: -1 }],
            },
            browser_ttl: { mode: 'respect_origin' },
          },
        },
        {
          description: 'Node - Bypass Mutations, Authorization and Explicit Comment Refresh',
          action: 'set_cache_settings',
          enabled: true,
          expression:
            '(not http.request.method in {"GET" "HEAD" "PURGE"}) or (any(http.request.headers["authorization"][*] ne "")) or (http.request.uri.query contains "fresh=1")',
          action_parameters: { cache: false },
        },
      ],
    };

    await axios.put(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/rulesets/phases/http_request_cache_settings/entrypoint`,
      newZoneRuleSet,
      cloudflareOptions(headers)
    );

    this.logger.info('Created zone http_request_cache_settings phase ruleset');
    // Set Browser Cache TTL to "Respect Existing Headers"
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/settings/browser_cache_ttl`,
      { value: 0 },
      cloudflareOptions(headers)
    );

    this.logger.info('Set Browser Cache TTL to Respect Existing Headers');

    // Keep complete query strings in cache keys (video ID, cursor, epoch, revision).
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/settings/cache_level`,
      { value: 'aggressive' },
      cloudflareOptions(headers)
    );

    // Enable Always Use HTTPS
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/settings/always_use_https`,
      { value: 'on' },
      cloudflareOptions(headers)
    );

    this.logger.info('Enabled Always Use HTTPS');

    // Enable Argo Tiered Caching
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/argo/tiered_caching`,
      { value: 'on' },
      cloudflareOptions(headers)
    );

    this.logger.info('Enabled Argo Tiered Caching');

    // Enable Tiered Cache Smart Topology
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/cache/tiered_cache_smart_topology_enable`,
      { value: 'on' },
      cloudflareOptions(headers)
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
    }>(`${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/rulesets`, cloudflareOptions(headers));

    if (response.data.success) {
      // Delete http_request_cache_settings phase rulesets
      for (const ruleSet of response.data.result) {
        if (ruleSet.phase === 'http_request_cache_settings') {
          this.logger.info(`Deleting ruleset: ${ruleSet.id}`);
          await axios.delete(
            `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/rulesets/${ruleSet.id}`,
            cloudflareOptions(headers)
          );
        }
      }
    }

    // Disable Argo Tiered Caching
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/argo/tiered_caching`,
      { value: 'off' },
      cloudflareOptions(headers)
    );

    this.logger.info('Disabled Argo Tiered Caching');

    // Disable Tiered Cache Smart Topology
    await axios.patch(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/cache/tiered_cache_smart_topology_enable`,
      { value: 'off' },
      cloudflareOptions(headers)
    );

    this.logger.info('Disabled Tiered Cache Smart Topology');

    // Retain media DNS for existing manifests and in-flight viewers.

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

    if (storageConfig.storageMode === 's3provider' && storageConfig.s3Config) {
      const recordName = validateCdnSettings({
        publicNodeAddress: getConfig().nodeSettings.publicNodeAddress,
        storageConfig: storageConfig as StorageConfig,
      });
      const recordContent = cdnDnsTarget(storageConfig as StorageConfig);

      this.logger.info(`Adding DNS record: ${recordName} -> ${String(recordContent)}`);

      const records = await this.listDnsRecords(
        cloudflareEmailAddress,
        cloudflareZoneId,
        cloudflareGlobalApiKey
      );
      const existing = records.find((record) => record.name === recordName);
      const url = `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/dns_records`;
      const body = {
        type: 'CNAME',
        name: recordName,
        content: recordContent,
        ttl: 1,
        proxied: true,
      };
      if (existing) {
        await axios.put(`${url}/${existing.id}`, body, cloudflareOptions(headers));
      } else {
        await axios.post(url, body, cloudflareOptions(headers));
      }

      this.logger.info('DNS record added successfully');
    }
  }

  private async listDnsRecords(
    email: string,
    zone: string,
    key: string
  ): Promise<
    Array<{ id: string; name: string; type: string; content: string; proxied?: boolean }>
  > {
    const records: Array<{
      id: string;
      name: string;
      type: string;
      content: string;
      proxied?: boolean;
    }> = [];
    for (let page = 1; ; page++) {
      const response = await axios.get<{
        success: boolean;
        result: typeof records;
        result_info?: { total_pages: number };
      }>(`${CLOUDFLARE_API_BASE}/zones/${zone}/dns_records`, {
        ...cloudflareOptions({ 'X-Auth-Email': email, 'X-Auth-Key': key }),
        params: { page, per_page: 100 },
        timeout: 10_000,
      });
      if (!response.data.success) {
        throw new Error('Cloudflare DNS lookup failed');
      }
      records.push(...response.data.result);
      if (
        response.data.result_info
          ? page >= response.data.result_info.total_pages
          : response.data.result.length < 100
      ) {
        break;
      }
    }
    return records;
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
        cloudflareOptions(headers)
      );

      return response.data.success;
    } catch (error) {
      this.logger.error('Failed to validate Cloudflare credentials', error);
      return false;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Purge specific files from Cloudflare cache
   */
  private async purgeCache(files: string[], operation: string): Promise<void> {
    if (!this.httpClient) {
      return;
    }

    const client = this.httpClient;
    const zoneId = getConfig().nodeSettings.cloudflareZoneId;
    const outbox = this.outbox();
    let durable: PurgeEntry[];
    try {
      const settings = getConfig().nodeSettings;
      outbox?.enqueue(zoneId, files, {
        zone: zoneId,
        email: settings.cloudflareEmailAddress,
        key: settings.cloudflareGlobalApiKey,
      });
      durable = outbox?.snapshot(zoneId) ?? [];
      this.purgeNotBefore.set(
        zoneId,
        Math.max(this.purgeNotBefore.get(zoneId) ?? 0, outbox?.notBefore(zoneId) ?? 0)
      );
    } finally {
      outbox?.close();
    }
    const versions = this.purgeVersions.get(zoneId) ?? new Map<string, number>();
    this.purgeVersions.set(zoneId, versions);
    const pending = this.pendingPurges.get(zoneId) ?? new Set<string>();
    this.pendingPurges.set(zoneId, pending);
    files.forEach((file) => {
      pending.add(file);
      versions.set(file, ++this.purgeGeneration);
    });
    durable.forEach(({ target }) => {
      if (!pending.has(target)) {
        pending.add(target);
        versions.set(target, ++this.purgeGeneration);
      }
    });
    const failures: unknown[] = [];
    const kind = (target: string): number =>
      target === 'everything' ? 2 : target.startsWith('prefix:') ? 1 : 0;
    const snapshot = [...pending];
    const capturedVersions = new Map(versions);
    for (const type of [0, 1, 2]) {
      const targets = snapshot.filter((target) => kind(target) === type);
      for (let offset = 0; offset < targets.length; offset += 30) {
        if (Number(this.purgeNotBefore.get(zoneId)) > Date.now()) {
          failures.push(new Error('Cloudflare purge deferred until Retry-After expires'));
          break;
        }
        // Keep file and prefix requests separate: Cloudflare accepts one purge type per body.
        const batch = targets.slice(offset, offset + 30);
        const body =
          type === 2
            ? { purge_everything: true }
            : type === 1
              ? { prefixes: batch.map((target) => target.slice(7)) }
              : { files: batch };
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const signal = distributionSignal();
            const response = signal
              ? await client.post(`/zones/${zoneId}/purge_cache`, body, { signal })
              : await client.post(`/zones/${zoneId}/purge_cache`, body);
            const result = response as { data?: { success?: boolean } } | undefined;
            if (result?.data?.success === false) {
              throw new Error('Cloudflare rejected purge');
            }
            batch.forEach((file) => {
              if (versions.get(file) === capturedVersions.get(file)) {
                pending.delete(file);
                versions.delete(file);
              }
            });
            const journal = this.outbox();
            try {
              journal?.acknowledge(
                zoneId,
                durable.filter((entry) => batch.includes(entry.target))
              );
            } finally {
              journal?.close();
            }
            break;
          } catch (error) {
            const status = (error as { response?: { status?: number } }).response?.status;
            if (attempt === 2 || (status !== undefined && status !== 429 && status < 500)) {
              failures.push(error);
              break;
            }
            const retryHeader = (error as { response?: { headers?: Record<string, string> } })
              .response?.headers?.['retry-after'];
            const seconds = Number(retryHeader);
            const retryAfter = Number.isFinite(seconds)
              ? seconds
              : (Date.parse(retryHeader ?? '') - Date.now()) / 1000;
            if (Number.isFinite(retryAfter) && retryAfter > 1) {
              this.purgeNotBefore.set(zoneId, Date.now() + retryAfter * 1000);
              const journal = this.outbox();
              try {
                journal?.defer(zoneId, Date.now() + retryAfter * 1000);
              } finally {
                journal?.close();
              }
              failures.push(error);
              break;
            }
            await delay(
              Math.min(1000, Number.isFinite(retryAfter) ? retryAfter * 1000 : 100 * 2 ** attempt)
            );
          }
        }
      }
    }
    if (failures.length) {
      this.logger.error(`${operation} failed`, new AggregateError(failures));
      this.logger.warn(`${String(pending.size)} URLs remain queued for retry`);
      throw new AggregateError(failures, `${operation}: cache invalidation incomplete`);
    }
    this.logger.debug(`${operation}: purged ${String(snapshot.length)} files`);
  }
}
