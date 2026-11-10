import { operationalConfig } from '@/database/operational.js';
import { mediaPurgeTargets, mediaVariantBypass } from '@/utils/media-cache.js';
import { isDeepStrictEqual } from 'node:util';
import {
  providerSnapshotSchema,
  type ProviderSnapshot,
  type CdnCredentials,
} from '@/utils/cdn-journal.js';
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
import { purgeOutbox, type PurgeEntry, type PurgeCredentials } from '@/utils/purge-outbox.js';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { validateCdnSettings, cdnDnsTarget } from '@/utils/cdn-settings.js';
import type { NodeSettings, StorageConfig } from '@/types/config.js';

import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import { getConfig } from '@config/index.js';

/**
 * Cloudflare API endpoints
 */
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** A mutation must not report success when its invalidation was never durably queued. */
export class PurgePersistenceError extends Error {}

/**
 * CloudflareService class
 *
 * Handles all Cloudflare-related functionality:
 * - Cache purging for videos, pages, and assets
 * - Turnstile CAPTCHA verification
 * - CDN configuration management
 */
export class CloudflareService extends BaseService {
  private httpClient: AxiosInstance | null = null;
  private httpClientSettings: { email: string; key: string } | null = null;
  private readonly pendingPurges = new Map<string, Set<string>>();
  private readonly purgeVersions = new Map<string, Map<string, number>>();
  private purgeGeneration = 0;
  private readonly purgeNotBefore = new Map<string, number>();
  private readonly dispatching = new Set<string>();
  private readonly purgeBudgets = new Map<string, number>();
  private retrying = false;

  private outbox(): ReturnType<typeof purgeOutbox> | undefined {
    const config = getConfig();
    const settingsPath = (config as { paths?: { nodeSettingsPath?: string } }).paths
      ?.nodeSettingsPath;
    return settingsPath ? purgeOutbox(operationalConfig(config)) : undefined;
  }

  /** Prefix purges include every query variant and all embed routes below /watch. */
  async purgePublicPages(strict = false): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }
    await this.purgeHomePage();
    await this.purgePrefixes(
      ['/watch', '/videos', '/home'].map((route) => getConfig().getNodeBaseUrl() + route),
      strict
    );
  }

  async purgePrefixes(urls: string[], strict = false): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }
    try {
      const targets = this.prefixTargets(urls);
      await this.purgeCache(targets, 'purgePrefixes', undefined, strict);
    } catch (error) {
      this.logger.error('Prefix invalidation incomplete', error);
      if (strict || error instanceof PurgePersistenceError) {
        throw error;
      }
    }
  }

  /** Exact identities use the separate Free-plan single-file purge allowance. */
  async purgeFiles(urls: string[], strict = false): Promise<void> {
    if (!this.isEnabled() || !this.httpClient || !urls.length) {
      return;
    }
    try {
      await this.purgeCache(urls, 'purgeFiles', undefined, strict);
    } catch (error) {
      this.logger.error('File invalidation incomplete', error);
      if (strict || error instanceof PurgePersistenceError) {
        throw error;
      }
    }
  }

  /** Include historical revisions and legacy entries which predate cache tags. */
  async purgeComments(videoId?: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.purgePrefixes([
      getConfig().getNodeBaseUrl() +
        (videoId === undefined ? '/videos/' : `/videos/${videoId}/comments`),
    ]);
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
      const previous = (await journal?.pendingCredentials()) ?? [];
      await journal?.close();
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

  /** Resolve and validate the selected zone root as the CDN public address. */
  async resolveCdnPublicAddress(email: string, zoneId: string, key: string): Promise<string> {
    const response = await axios.get<{ success: boolean; result?: { name?: string } }>(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}`,
      cloudflareOptions({ 'X-Auth-Email': email, 'X-Auth-Key': key })
    );
    const name = response.data.result?.name;
    if (!response.data.success || typeof name !== 'string' || name.trim() === '') {
      throw new Error('Could not validate the Cloudflare zone.');
    }
    const zone = name.trim().toLowerCase().replace(/\.$/, '');
    // Validate provider data before using it as a persisted public address.
    validateCdnSettings({ publicNodeAddress: zone, storageConfig: { storageMode: 'filesystem' } });
    return zone;
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
    validateCdnSettings(settings, response.data.result.name);
  }

  /** Persist the values we change before activation; no DNS ownership is transferred here. */
  async captureCdnSnapshot(credentials: CdnCredentials): Promise<ProviderSnapshot> {
    const base = `${CLOUDFLARE_API_BASE}/zones/${credentials.zone}`;
    const options = cloudflareOptions({
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.key,
    });
    let rules: Array<Record<string, unknown>> | null = null;
    try {
      const result = await axios.get<{
        success: boolean;
        result: { rules: Array<Record<string, unknown>> };
      }>(`${base}/rulesets/phases/http_request_cache_settings/entrypoint`, options);
      if (!result.data.success) {
        throw new Error('Could not read CDN cache rules.');
      }
      rules = result.data.result.rules.map((rule) => this.editableCdnRule(rule));
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status !== 404) {
        throw error;
      }
    }
    const responseRules = await this.readResponseRules(base, options);
    const settings = [];
    for (const endpoint of [
      'settings/browser_cache_ttl',
      'settings/cache_level',
      'settings/always_use_https',
      'argo/tiered_caching',
      'cache/tiered_cache_smart_topology_enable',
    ]) {
      const response = await axios.get<{ success: boolean; result: { value: unknown } }>(
        `${base}/${endpoint}`,
        options
      );
      if (!response.data.success) {
        throw new Error('Could not read CDN zone settings.');
      }
      settings.push({ endpoint, value: response.data.result.value });
    }
    return providerSnapshotSchema.parse({ rules, responseRules, settings });
  }

  private async readResponseRules(
    base: string,
    options: ReturnType<typeof cloudflareOptions>
  ): Promise<Array<Record<string, unknown>> | null> {
    try {
      const response = await axios.get<{
        success: boolean;
        result: { rules: Array<Record<string, unknown>> };
      }>(`${base}/rulesets/phases/http_response_cache_settings/entrypoint`, options);
      if (!response.data.success) {
        throw new Error('Could not read CDN response cache rules.');
      }
      return response.data.result.rules.map((rule) => this.editableCdnRule(rule));
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /** Upgrade a saved baseline before first managing the new phase. */
  async upgradeCdnSnapshot(
    credentials: CdnCredentials,
    original: { before: ProviderSnapshot; applied: ProviderSnapshot }
  ): Promise<void> {
    if (original.before.responseRules === undefined) {
      const current = await this.captureCdnSnapshot(credentials);
      original.before.responseRules = current.responseRules ?? null;
      original.applied.responseRules = current.responseRules ?? null;
    }
  }

  private editableCdnRule(rule: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(rule).filter(([field]) =>
        [
          'action',
          'action_parameters',
          'expression',
          'description',
          'enabled',
          'logging',
          'ref',
        ].includes(field)
      )
    );
  }

  /** Refuse to overwrite a provider edit made outside this transition. */
  async verifyCdnSnapshot(credentials: CdnCredentials, expected: ProviderSnapshot): Promise<void> {
    if (!isDeepStrictEqual(await this.captureCdnSnapshot(credentials), expected)) {
      throw new Error(
        'Cloudflare settings changed outside MoarTube. Resolve the zone conflict before retrying.'
      );
    }
  }

  /** Each value is conditional and restart-idempotent: already-restored fields are skipped. */
  async restoreCdnSnapshot(
    credentials: CdnCredentials,
    before: ProviderSnapshot,
    applied: ProviderSnapshot
  ): Promise<void> {
    const current = await this.captureCdnSnapshot(credentials);
    const base = `${CLOUDFLARE_API_BASE}/zones/${credentials.zone}`;
    const options = cloudflareOptions({
      'X-Auth-Email': credentials.email,
      'X-Auth-Key': credentials.key,
    });
    const check = (actual: unknown, original: unknown, managed: unknown): void => {
      if (!isDeepStrictEqual(actual, original) && !isDeepStrictEqual(actual, managed)) {
        throw new Error(
          'Cloudflare settings changed outside MoarTube. Resolve the zone conflict before retrying.'
        );
      }
    };
    // Validate every field before making the first restoring write.
    check(current.rules, before.rules, applied.rules);
    if (before.responseRules !== undefined) {
      check(current.responseRules, before.responseRules, applied.responseRules);
    }
    for (const setting of before.settings) {
      check(
        current.settings.find((item) => item.endpoint === setting.endpoint)?.value,
        setting.value,
        applied.settings.find((item) => item.endpoint === setting.endpoint)?.value
      );
    }
    if (!isDeepStrictEqual(current.rules, before.rules)) {
      if (before.rules === null) {
        const response = await axios.get<{ success: boolean; result: { id: string } }>(
          `${base}/rulesets/phases/http_request_cache_settings/entrypoint`,
          options
        );
        if (!response.data.success) {
          throw new Error('Could not locate managed CDN rules.');
        }
        const removed = await axios.delete<{ success: boolean }>(
          `${base}/rulesets/${response.data.result.id}`,
          options
        );
        if (!removed.data.success) {
          throw new Error('Could not restore CDN rules.');
        }
      } else {
        const response = await axios.put<{ success: boolean }>(
          `${base}/rulesets/phases/http_request_cache_settings/entrypoint`,
          { rules: before.rules },
          options
        );
        if (!response.data.success) {
          throw new Error('Could not restore CDN rules.');
        }
      }
    }
    if (
      before.responseRules !== undefined &&
      !isDeepStrictEqual(current.responseRules, before.responseRules)
    ) {
      const endpoint = `${base}/rulesets/phases/http_response_cache_settings/entrypoint`;
      if (before.responseRules === null) {
        const found = await axios.get<{ success: boolean; result: { id: string } }>(
          endpoint,
          options
        );
        if (!found.data.success) {
          throw new Error('Could not locate managed CDN response cache rules.');
        }
        const removed = await axios.delete<{ success: boolean }>(
          `${base}/rulesets/${found.data.result.id}`,
          options
        );
        if (!removed.data.success) {
          throw new Error('Could not restore CDN response cache rules.');
        }
      } else {
        const restored = await axios.put<{ success: boolean }>(
          endpoint,
          { rules: before.responseRules },
          options
        );
        if (!restored.data.success) {
          throw new Error('Could not restore CDN response cache rules.');
        }
      }
    }
    for (const setting of before.settings) {
      if (
        !isDeepStrictEqual(
          current.settings.find((item) => item.endpoint === setting.endpoint)?.value,
          setting.value
        )
      ) {
        const response = await axios.patch<{ success: boolean }>(
          `${base}/${setting.endpoint}`,
          { value: setting.value },
          options
        );
        if (!response.data.success) {
          throw new Error('Could not restore CDN zone settings.');
        }
      }
    }
    await this.verifyCdnSnapshot(credentials, before);
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
    const responseRules = await this.readResponseRules(base, options);
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
        await restore(async () => {
          const endpoint = `${base}/rulesets/phases/http_response_cache_settings/entrypoint`;
          if (responseRules !== null) {
            const result = await axios.put<{ success: boolean }>(
              endpoint,
              { rules: responseRules },
              options
            );
            if (!result.data.success) {
              throw new Error('Could not restore CDN response cache rules.');
            }
          } else {
            try {
              const current = await axios.get<{ success: boolean; result: { id: string } }>(
                endpoint,
                options
              );
              if (!current.data.success) {
                throw new Error('Could not locate CDN response cache rules.');
              }
              const result = await axios.delete<{ success: boolean }>(
                `${base}/rulesets/${current.data.result.id}`,
                options
              );
              if (!result.data.success) {
                throw new Error('Could not restore CDN response cache rules.');
              }
            } catch (error) {
              if ((error as { response?: { status?: number } }).response?.status !== 404) {
                throw error;
              }
            }
          }
        });
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

  constructor(logger: Logger) {
    super('CloudflareService', logger);
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
   * Purge HTML variants without discarding revisioned comment bodies
   */
  async purgeWatchPages(videoIds?: string[], strict = false): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      // Tags cover every query/Origin variant without evicting revisioned bodies.
      await this.purgeCache(
        videoIds?.length
          ? videoIds.map((id) => 'tag:moartube-video-' + id)
          : ['tag:moartube-watch'],
        'purgeWatchPages',
        undefined,
        strict
      );
    } catch (error) {
      this.logger.error('Failed to purge watch pages', error);
      if (strict || error instanceof PurgePersistenceError) {
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
      await this.purgeWatchPages(videoIds, true);
    } catch (error) {
      this.logger.error('Failed to purge embed pages', error);
      if (error instanceof PurgePersistenceError) {
        throw error;
      }
    }
  }

  /**
   * Purge all embed video pages
   */
  async purgeAllEmbedVideoPages(): Promise<void> {
    await this.purgeEmbedVideoPages();
  }

  /**
   * Purge homepage cache
   */
  async purgeHomePage(
    videoIds: string[] = [],
    includeAllWatch = false,
    strict = false
  ): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }

    try {
      await this.purgeCache(
        [
          'tag:moartube-home',
          ...(includeAllWatch
            ? ['tag:moartube-watch']
            : videoIds.map((id) => 'tag:moartube-video-' + id)),
        ],
        'purgeHomePage',
        undefined,
        strict
      );
    } catch (error) {
      this.logger.error('Failed to purge homepage', error);
      if (strict || error instanceof PurgePersistenceError) {
        throw error;
      }
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

      await this.purgeCache(this.prefixTargets(files), 'purgeNodeImages');
    } catch (error) {
      this.logger.error('Failed to purge node images', error);
      if (error instanceof PurgePersistenceError) {
        throw error;
      }
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
    _capturedUrls?: string[],
    strict = false
  ): Promise<void> {
    if (!this.isEnabled() || !this.httpClient) {
      return;
    }
    try {
      await this.purgePrefixes(
        [getConfig().getExternalVideosBaseUrl() + '/external/videos/' + videoId + '/adaptive/'],
        strict
      );
    } catch (error) {
      this.logger.error('Adaptive invalidation incomplete', error, { videoId });
      if (strict || error instanceof PurgePersistenceError) {
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

      await this.purgeCache(
        this.prefixTargets([baseUrl + '/external/videos/' + videoId + '/progressive/']),
        'purgeProgressiveVideos'
      );
    } catch (error) {
      this.logger.error('Failed to purge progressive videos', error, { videoId });
      if (error instanceof PurgePersistenceError) {
        throw error;
      }
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
      await this.purgeCache(this.prefixTargets(files), 'purgeVideoPreviewImages');
    } catch (error) {
      this.logger.error('Failed to purge preview images', error, { videoIds });
      if (error instanceof PurgePersistenceError) {
        throw error;
      }
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
      await this.purgeCache(this.prefixTargets(files), 'purgeVideoPosterImages');
    } catch (error) {
      this.logger.error('Failed to purge poster images', error, { videoIds });
      if (error instanceof PurgePersistenceError) {
        throw error;
      }
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
      await this.purgeCache(this.prefixTargets(files), 'purgeVideoThumbnailImages');
    } catch (error) {
      this.logger.error('Failed to purge thumbnail images', error, { videoIds });
      if (error instanceof PurgePersistenceError) {
        throw error;
      }
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
      if (error instanceof PurgePersistenceError) {
        throw error;
      }
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
    await this.purgeCache(
      ['everything'],
      'purgeEntireCacheWithCredentials',
      {
        zone: cloudflareZoneId,
        email: cloudflareEmailAddress,
        key: cloudflareGlobalApiKey,
      },
      true
    );
  }

  /**
   * Set CDN configuration - creates cache rules, enables tiered caching, etc.
   */
  private cdnRuleSet(publicOrigin?: string): { rules: Array<Record<string, unknown>> } {
    return {
      rules: [
        {
          description: 'Node External - Video',
          action: 'set_cache_settings',
          enabled: true,
          expression: '(starts_with(http.request.uri.path, "/external/videos/"))',
          action_parameters: {
            cache: true,
            edge_ttl: { mode: 'bypass_by_default' },
            browser_ttl: { mode: 'bypass_by_default' },
          },
        },
        {
          description: 'Node External - JavaScript, CSS, Fonts',
          action: 'set_cache_settings',
          enabled: true,
          expression:
            '(starts_with(http.request.uri, "/external/resources/javascript")) or (starts_with(http.request.uri, "/external/resources/css")) or (starts_with(http.request.uri, "/external/resources/fonts"))',
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
          description: 'Node Homepage - Cache Public Homepage and Data',
          action: 'set_cache_settings',
          enabled: true,
          expression:
            '(http.request.uri.path eq "/") or (starts_with(http.request.uri.path, "/home/"))',
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
          description: 'Node Media - Bypass Noncanonical Cache Variants',
          action: 'set_cache_settings',
          enabled: true,
          expression: mediaVariantBypass(publicOrigin),
          action_parameters: { cache: false },
        },
        {
          description: 'Node - Bypass Mutations, Authorization and Explicit Comment Refresh',
          action: 'set_cache_settings',
          enabled: true,
          expression:
            '(not http.request.method in {"GET" "HEAD" "PURGE"}) or (any(http.request.headers["authorization"][*] ne "")) or (http.request.uri.query contains "fresh=1")',
          action_parameters: { cache: false },
        },
      ].map((rule, index) => ({ ...rule, ref: `moartube_cdn_${String(index)}` })),
    };
  }

  /** S3 responses bypass Node's hooks: enforce the public contract at the edge. */
  private cdnResponseRuleSet(publicOrigin?: string): { rules: Array<Record<string, unknown>> } {
    const media =
      '(starts_with(http.host, "externalvideos.")) and (starts_with(http.request.uri.path, "/external/videos/"))';
    const remove = { operation: 'remove' };
    const baseline = {
      'no-store': { operation: 'set' },
      'max-age': { operation: 'set', value: 0 },
      's-maxage': remove,
      immutable: remove,
      'stale-if-error': remove,
      'stale-while-revalidate': remove,
    };
    const safeObject =
      '((http.request.uri.path contains "/segments/") and ends_with(http.request.uri.path, ".ts")) or ' +
      '((http.request.uri.path contains "/progressive/") and (ends_with(http.request.uri.path, ".mp4") or ends_with(http.request.uri.path, ".webm") or ends_with(http.request.uri.path, ".ogv"))) or ' +
      '((http.request.uri.path contains "/static/manifests/") and ends_with(http.request.uri.path, ".m3u8"))';
    return {
      rules: [
        {
          ref: 'moartube_s3_private_default',
          description: 'Node S3 - Uncached by default, including unknown live and error responses',
          action: 'set_cache_control',
          enabled: true,
          expression: media,
          action_parameters: baseline,
        },
        {
          ref: 'moartube_s3_public_media',
          description: 'Node S3 - Bound mutable image freshness independently of object metadata',
          action: 'set_cache_control',
          enabled: true,
          expression:
            `${media} and (split(http.request.uri.path, "/")[4] eq "images") and ends_with(http.request.uri.path, ".jpg") and (http.response.code in {200 206 304}) and ` +
            '(http.request.method in {"GET" "HEAD"}) and not any(http.request.headers["authorization"][*] ne "") and ' +
            '(len(http.response.headers["set-cookie"]) eq 0) and not (' +
            mediaVariantBypass(publicOrigin) +
            ')',
          action_parameters: {
            ...baseline,
            'no-store': remove,
            private: remove,
            'no-cache': remove,
            public: { operation: 'set' },
            'must-revalidate': { operation: 'set' },
            's-maxage': { operation: 'set', value: 30 },
          },
        },
        {
          ref: 'moartube_s3_video_media',
          description: 'Node S3 - Video CDN freshness for one year with browser revalidation',
          action: 'set_cache_control',
          enabled: true,
          expression:
            `${media} and (${safeObject}) and (http.response.code in {200 206 304}) and ` +
            '(http.request.method in {"GET" "HEAD"}) and not any(http.request.headers["authorization"][*] ne "") and (len(http.response.headers["set-cookie"]) eq 0) and not (' +
            mediaVariantBypass(publicOrigin) +
            ')',
          action_parameters: {
            ...baseline,
            'no-store': remove,
            private: remove,
            'no-cache': remove,
            public: { operation: 'set' },
            'must-revalidate': { operation: 'set' },
            's-maxage': { operation: 'set', value: 31536000 },
          },
        },
        {
          ref: 'moartube_s3_live_playlist',
          description: 'Node S3 - Validated active live playlists for one second',
          action: 'set_cache_control',
          enabled: true,
          expression:
            `${media} and (http.request.uri.path contains "/adaptive/m3u8/dynamic/manifests/") and ends_with(http.request.uri.path, ".m3u8") and (http.response.code eq 200) and ` +
            '(len(http.response.headers["x-amz-meta-moartube-live-playlist"]) eq 1) and (http.response.headers["x-amz-meta-moartube-live-playlist"][0] eq "active") and ' +
            '(len(http.response.headers["content-type"]) eq 1) and (lower(http.response.headers["content-type"][0]) eq "application/vnd.apple.mpegurl") and ' +
            '(http.request.method in {"GET" "HEAD"}) and not any(http.request.headers["authorization"][*] ne "") and (len(http.response.headers["set-cookie"]) eq 0) and not (' +
            mediaVariantBypass(publicOrigin) +
            ')',
          action_parameters: {
            ...baseline,
            'no-store': remove,
            private: remove,
            'no-cache': remove,
            public: { operation: 'set' },
            'must-revalidate': { operation: 'set' },
            's-maxage': { operation: 'set', value: 1 },
          },
        },
      ],
    };
  }

  managedCdnSnapshot(publicOrigin?: string): ProviderSnapshot {
    return {
      rules: this.cdnRuleSet(publicOrigin).rules.map((rule) => this.editableCdnRule(rule)),
      responseRules: this.cdnResponseRuleSet(publicOrigin).rules,
      settings: [
        { endpoint: 'settings/browser_cache_ttl', value: 0 },
        { endpoint: 'settings/cache_level', value: 'aggressive' },
        { endpoint: 'settings/always_use_https', value: 'on' },
        { endpoint: 'argo/tiered_caching', value: 'on' },
        { endpoint: 'cache/tiered_cache_smart_topology_enable', value: 'on' },
      ],
    };
  }

  async verifyCdnChange(
    credentials: CdnCredentials,
    before: ProviderSnapshot,
    applied: ProviderSnapshot,
    previous?: ProviderSnapshot
  ): Promise<void> {
    const current = await this.captureCdnSnapshot(credentials);
    const check = (value: unknown, old: unknown, target: unknown, prior?: unknown): void => {
      if (
        !isDeepStrictEqual(value, old) &&
        !isDeepStrictEqual(value, target) &&
        !isDeepStrictEqual(value, prior)
      ) {
        throw new Error(
          'Cloudflare settings changed outside MoarTube. Resolve the zone conflict before retrying.'
        );
      }
    };
    check(current.rules, before.rules, applied.rules, previous?.rules);
    if (before.responseRules !== undefined) {
      check(
        current.responseRules,
        before.responseRules,
        applied.responseRules,
        previous?.responseRules
      );
    }
    for (const setting of before.settings) {
      check(
        current.settings.find((item) => item.endpoint === setting.endpoint)?.value,
        setting.value,
        applied.settings.find((item) => item.endpoint === setting.endpoint)?.value,
        previous?.settings.find((item) => item.endpoint === setting.endpoint)?.value
      );
    }
  }

  async setCdnConfiguration(
    cloudflareEmailAddress: string,
    cloudflareZoneId: string,
    cloudflareGlobalApiKey: string,
    publicOrigin?: string
  ): Promise<void> {
    const headers = {
      'X-Auth-Email': cloudflareEmailAddress,
      'X-Auth-Key': cloudflareGlobalApiKey,
      'Content-Type': 'application/json',
    };

    this.logger.info('Setting Cloudflare CDN configuration for MoarTube Node');

    // Create http_request_cache_settings phase ruleset
    const newZoneRuleSet = this.cdnRuleSet(publicOrigin);

    await axios.put(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/rulesets/phases/http_request_cache_settings/entrypoint`,
      newZoneRuleSet,
      cloudflareOptions(headers)
    );

    const responsePolicy = await axios.put<{ success: boolean }>(
      `${CLOUDFLARE_API_BASE}/zones/${cloudflareZoneId}/rulesets/phases/http_response_cache_settings/entrypoint`,
      this.cdnResponseRuleSet(publicOrigin),
      cloudflareOptions(headers)
    );
    if (!responsePolicy.data.success) {
      throw new Error('Could not set CDN response cache rules.');
    }

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
    },
    publicNodeAddress = getConfig().nodeSettings.publicNodeAddress
  ): Promise<void> {
    const headers = {
      'X-Auth-Email': cloudflareEmailAddress,
      'X-Auth-Key': cloudflareGlobalApiKey,
      'Content-Type': 'application/json',
    };

    if (storageConfig.storageMode === 's3provider' && storageConfig.s3Config) {
      const recordName = validateCdnSettings({
        publicNodeAddress,
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
  private async purgeCache(
    files: string[],
    operation: string,
    credentials?: PurgeCredentials,
    foreground = false
  ): Promise<void> {
    const client = credentials
      ? {
          post: (route: string, body: unknown) =>
            axios.post(
              CLOUDFLARE_API_BASE + route,
              body,
              cloudflareOptions({
                'X-Auth-Email': credentials.email,
                'X-Auth-Key': credentials.key,
                'Content-Type': 'application/json',
              })
            ),
        }
      : this.httpClient;
    if (!client) {
      return;
    }

    files = [...new Set(mediaPurgeTargets(files))];
    const zoneId = credentials?.zone ?? getConfig().nodeSettings.cloudflareZoneId;
    const settings = getConfig().nodeSettings;
    const email = credentials?.email ?? settings.cloudflareEmailAddress;
    const key = credentials?.key ?? settings.cloudflareGlobalApiKey;
    // Conservatively share the Free allowance across every configured credential
    // and zone in this database; changing email/key must not refill the bucket.
    const account = 'cloudflare-free';
    let durable: PurgeEntry[];
    try {
      const outbox = this.outbox();
      try {
        await outbox?.enqueue(zoneId, files, {
          zone: zoneId,
          email,
          key,
        });
        durable = (await outbox?.snapshot(zoneId)) ?? [];
      } finally {
        await outbox?.close();
      }
    } catch (cause) {
      throw new PurgePersistenceError('Cache invalidation could not be durably queued', { cause });
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
      target === 'everything'
        ? 2
        : target.startsWith('prefix:')
          ? 1
          : target.startsWith('tag:')
            ? 3
            : 0;
    let snapshot = [...pending];
    let capturedVersions = new Map(versions);
    // Broad success subsumes queued narrower work; broad deferral still reaches files.
    for (const type of [2, 1, 3, 0]) {
      const lane = type === 0 ? 'files' : 'broad';
      const scope = account + ':' + lane;
      const dispatchKey = zoneId + ':' + lane;
      const waitForLane =
        foreground && files.some((target) => (kind(target) === 0 ? 'files' : 'broad') === lane);
      // A strict foreground caller can join a short in-flight dispatch instead of
      // reporting a synthetic failure merely because another worker got there first.
      for (let wait = 0; waitForLane && this.dispatching.has(dispatchKey) && wait < 400; wait++) {
        await delay(25);
      }
      if (this.dispatching.has(dispatchKey)) {
        continue;
      }
      const journal = this.outbox();
      let lease: Awaited<ReturnType<NonNullable<typeof journal>['claim']>>;
      try {
        if (journal) {
          lease = await journal.claim(dispatchKey);
          for (let wait = 0; waitForLane && !lease && wait < 400; wait++) {
            await delay(25);
            lease = await journal.claim(dispatchKey);
          }
          if (!lease) {
            continue;
          }
          // Read after acquiring the lease, so overlapping worker notifications coalesce.
          durable = await journal.snapshot(zoneId);
          snapshot = [...new Set(durable.map((entry) => entry.target))];
          for (const target of snapshot) {
            if (!pending.has(target)) {
              pending.add(target);
              versions.set(target, ++this.purgeGeneration);
            }
          }
          for (const target of pending) {
            if (!snapshot.includes(target)) {
              pending.delete(target);
              versions.delete(target);
            }
          }
          capturedVersions = new Map(versions);
        } else {
          snapshot = [...pending];
        }
        this.dispatching.add(dispatchKey);
        const covers = (cover: string, target: string): boolean => {
          if (cover === target || cover === 'everything') {
            return true;
          }
          if (cover === 'tag:moartube-watch' && target.startsWith('tag:moartube-video-')) {
            return true;
          }
          if (!cover.startsWith('prefix:')) {
            return false;
          }
          if (target.startsWith('prefix:')) {
            return target.slice(7).startsWith(cover.slice(7));
          }
          const url = target.startsWith('file:')
            ? (JSON.parse(target.slice(5)) as { url: string }).url
            : target;
          if (!/^https?:\/\//.test(url)) {
            return false;
          }
          const parsed = new URL(url);
          return (parsed.host + parsed.pathname).startsWith(cover.slice(7));
        };
        const targets = snapshot.filter(
          (target) =>
            kind(target) === type &&
            !snapshot.some(
              (other) => other !== target && kind(other) === type && covers(other, target)
            )
        );
        for (let offset = 0; offset < targets.length; offset += 100) {
          const until = Math.max(
            this.purgeNotBefore.get(scope) ?? 0,
            this.purgeNotBefore.get(account + ':global') ?? 0,
            (await journal?.notBefore(scope)) ?? 0,
            (await journal?.notBefore(account + ':global')) ?? 0
          );
          if (until > Date.now()) {
            failures.push(new Error('Cloudflare purge deferred until Retry-After expires'));
            break;
          }
          // Keep file and prefix requests separate: Cloudflare accepts one purge type per body.
          const batch = targets.slice(offset, offset + 100);
          const body =
            type === 2
              ? { purge_everything: true }
              : type === 1
                ? { prefixes: batch.map((target) => target.slice(7)) }
                : type === 3
                  ? { tags: batch.map((target) => target.slice(4)) }
                  : {
                      files: batch.map((target) =>
                        target.startsWith('file:')
                          ? (JSON.parse(target.slice(5)) as {
                              url: string;
                              headers: Record<string, string>;
                            })
                          : target
                      ),
                    };
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              if (lease && !(await lease.renew())) {
                failures.push(
                  new Error('Cloudflare purge dispatch lease expired; work remains queued')
                );
                break;
              }
              const cost = lane === 'files' ? batch.length : 1;
              const interval = lane === 'files' ? 1.25 : 12_000;
              const capacity = lane === 'files' ? 800 : 25;
              let permitted: boolean;
              if (journal) {
                permitted = await journal.reserve(scope, cost, interval, capacity);
              } else {
                const now = Date.now();
                const tat = this.purgeBudgets.get(scope) ?? now;
                permitted = tat <= now + (capacity - cost) * interval;
                if (permitted) {
                  this.purgeBudgets.set(scope, Math.max(now, tat) + cost * interval);
                }
              }
              if (!permitted) {
                failures.push(new Error('Cloudflare Free purge budget is queued for refill'));
                break;
              }
              const signal = distributionSignal();
              const response = signal
                ? await client.post(`/zones/${zoneId}/purge_cache`, body, { signal })
                : await client.post(`/zones/${zoneId}/purge_cache`, body);
              const result = response as { data?: { success?: boolean } } | undefined;
              if (result?.data?.success !== true) {
                throw new Error('Cloudflare rejected purge');
              }
              const completed = snapshot.filter((target) =>
                batch.some((cover) => covers(cover, target))
              );
              completed.forEach((file) => {
                if (versions.get(file) === capturedVersions.get(file)) {
                  pending.delete(file);
                  versions.delete(file);
                }
              });
              await journal?.acknowledge(
                zoneId,
                durable.filter((entry) => completed.includes(entry.target))
              );
              break;
            } catch (error) {
              const status = (error as { response?: { status?: number } }).response?.status;
              const retryHeader = (error as { response?: { headers?: Record<string, string> } })
                .response?.headers?.['retry-after'];
              const responseHeaders = (error as { response?: { headers?: Record<string, string> } })
                .response?.headers;
              // REST's default quota is API-wide, unlike the purge-specific lanes.
              const globalQuota = responseHeaders?.['ratelimit']
                ?.split(',')
                .find(
                  (item) =>
                    /^\s*"default"\s*;/.test(item) && /;\s*r\s*=\s*0(?:\s*;|\s*$)/.test(item)
                );
              const globalReset =
                globalQuota === undefined
                  ? 0
                  : Number(/;\s*t\s*=\s*(\d+)/.exec(globalQuota)?.[1] ?? 300);
              const seconds = Number(retryHeader);
              const retryAfter = Number.isFinite(seconds)
                ? seconds
                : (Date.parse(retryHeader ?? '') - Date.now()) / 1000;
              if ((Number.isFinite(retryAfter) && retryAfter > 0) || status === 429) {
                const key =
                  status === 429 && globalQuota === undefined ? scope : account + ':global';
                const until =
                  Date.now() +
                  Math.max(
                    globalReset * 1000,
                    Number.isFinite(retryAfter) && retryAfter > 0
                      ? retryAfter * 1000
                      : lane === 'files'
                        ? 1000
                        : 12_000
                  );
                this.purgeNotBefore.set(key, until);
                await journal?.defer(key, until);
                failures.push(error);
                break;
              }
              if (attempt === 2 || (status !== undefined && status !== 429 && status < 500)) {
                failures.push(error);
                break;
              }
              await delay(
                Math.min(1000, Number.isFinite(retryAfter) ? retryAfter * 1000 : 100 * 2 ** attempt)
              );
            }
          }
        }
      } finally {
        this.dispatching.delete(dispatchKey);
        await lease?.release();
        await journal?.close();
      }
    }
    if ((files.length === 0 && failures.length) || files.some((file) => pending.has(file))) {
      this.logger.error(`${operation} failed`, new AggregateError(failures));
      this.logger.warn(`${String(pending.size)} URLs remain queued for retry`);
      throw new AggregateError(failures, `${operation}: cache invalidation incomplete`);
    }
    this.logger.debug(`${operation}: purged ${String(snapshot.length)} files`);
  }
}
