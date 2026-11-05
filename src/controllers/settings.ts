import { managedMediaBases } from '@/utils/media-url-origins.js';
import { relativeHlsLine, hlsPlaylistPath } from '@/utils/hls-urls.js';
import cluster from 'node:cluster';
import { getCpuMetrics } from '@/utils/cpu-metrics.js';
import { getMemoryMetrics } from '@/utils/memory-metrics.js';
/**
 * Settings Controller
 *
 * Handles node settings and configuration endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { getStorageMetrics, type StorageMetrics } from '@/utils/storage-metrics.js';
import { Readable } from 'node:stream';
import { writeUpload } from '@/utils/stream-files.js';
import { rewriteManifestFile } from '@/utils/manifest-transform.js';
import { pipeline } from 'node:stream/promises';

import { BaseController } from '@controllers/base.js';
import type {
  SettingsService,
  CloudflareService,
  WebSocketService,
  VideosService,
  VideoOutputs,
} from '@services/index.js';
import { getConfig } from '@config/index.js';
import { isCloudflareCredentialsValid } from '@utils/index.js';
import { requestTunnelOperation } from '@/services/cloudflare-tunnel-runtime.js';
import { cloudflareConfigureBodySchema } from '@/validators/schemas/settings.js';
import {
  distributionSignal,
  withCloudflareDeadline,
  withCloudflareRecovery,
} from '@/utils/cloudflare-http.js';
import { storageIdentity } from '@/utils/cdn-settings.js';
import type { StorageConfig } from '@/types/config.js';
import { withSettingsChange } from '@/utils/settings-change.js';
import { withTunnelAdmission } from '@/utils/tunnel-admission.js';

/**
 * Request body interfaces
 */
export interface PersonalizeNodeNameBody {
  nodeName: string;
}

export interface PersonalizeNodeAboutBody {
  nodeAbout: string;
}

export interface AccountBody {
  username: string;
  password: string;
}

export interface NetworkInternalBody {
  nodeListeningPort: number;
}

export interface NetworkExternalBody {
  publicNodeProtocol: string;
  publicNodeAddress: string;
  publicNodePort: string;
}

export interface CloudflareConfigureBody {
  cloudflareEmailAddress: string;
  cloudflareZoneId: string;
  cloudflareGlobalApiKey: string;
}

export interface CloudflareTurnstileConfigureBody {
  cloudflareTurnstileSiteKey: string;
  cloudflareTurnstileSecretKey: string;
}

export interface ToggleBooleanBody {
  isEnabled: boolean;
}

export interface DatabaseConfigBody {
  databaseConfig: {
    databaseDialect: 'sqlite' | 'postgres';
    postgresConfig?: {
      databaseName: string;
      username: string;
      password: string;
      host: string;
      port: number;
    };
  };
}

export interface StorageConfigBody {
  storageConfig: {
    storageMode: 'filesystem' | 's3provider';
    s3Config?: {
      bucketName: string;
      s3ProviderClientConfig: {
        forcePathStyle: boolean;
        region: string;
        credentials: {
          accessKeyId: string;
          secretAccessKey: string;
        };
      };
    };
  };
}

/**
 * Request body for secure mode (HTTPS)
 */
export interface SecureQuery {
  isSecure: boolean;
}

/**
 * SettingsController class
 *
 * Handles:
 * - Node settings retrieval and updates
 * - Avatar and banner management
 * - Cloudflare configuration
 * - Network configuration
 * - Feature toggles
 * - Database export/import
 */
export class SettingsController extends BaseController {
  private previousMediaBases: string[] = [];
  public getMemoryMetrics = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    try {
      // A worker reports the whole Node cluster, including the primary and sibling workers.
      const rootPid = cluster.isWorker ? process.ppid : process.pid;
      return await this.sendSuccess(reply, { metrics: await getMemoryMetrics(rootPid) });
    } catch (error) {
      this.logger.error('Failed to load memory metrics', error);
      return await this.sendError(reply, 'Unable to load memory metrics', 500);
    }
  };

  public getCpuMetrics = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    try {
      const rootPid = cluster.isWorker ? process.ppid : process.pid;
      return await this.sendSuccess(reply, { metrics: await getCpuMetrics(rootPid) });
    } catch (error) {
      this.logger.error('Failed to load CPU metrics', error);
      return await this.sendError(reply, 'Unable to load CPU metrics', 500);
    }
  };

  private metricsScan: Promise<StorageMetrics> | undefined;

  public getMetrics = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    try {
      const settings = this.settingsService.getNodeSettings() as {
        storageConfig: { storageMode: string };
      };
      if (settings.storageConfig.storageMode === 's3provider') {
        return await this.sendSuccess(reply, {
          metrics: {
            storageMode: 's3provider',
            mediaBytes: null,
            availableBytes: null,
            totalBytes: null,
          },
        });
      }
      this.metricsScan ??= getStorageMetrics(
        path.join(getConfig().paths.dataDirectoryPath, 'media')
      ).finally(() => {
        this.metricsScan = undefined;
      });
      return await this.sendSuccess(reply, { metrics: await this.metricsScan });
    } catch (error) {
      this.logger.error('Failed to load storage metrics', error);
      return await this.sendError(reply, 'Unable to load storage metrics', 500);
    }
  };

  constructor(
    private readonly settingsService: SettingsService,
    private readonly videosService: VideosService,
    private readonly cloudflareService: CloudflareService,
    private readonly websocketService: WebSocketService
  ) {
    super('SettingsController');
  }

  /**
   * GET /settings
   *
   * Get all node settings
   */
  getSettings = (_request: FastifyRequest, reply: FastifyReply): void => {
    try {
      getConfig().reloadNodeSettings();
      const nodeSettings = this.settingsService.getNodeSettings();
      const version = this.settingsService.getVersion();

      this.sendSuccess(reply, {
        nodeSettings: {
          ...nodeSettings,
          version,
        },
      });
    } catch (error) {
      this.logger.error('Error getting settings', error);

      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  getCloudflareTunnel = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.header('Cache-Control', 'no-store');
    try {
      this.sendSuccess(reply, { tunnel: await requestTunnelOperation('snapshot') });
    } catch {
      this.sendError(reply, 'Cloudflare Tunnel status is unavailable', 503);
    }
  };

  cloudflareTunnelToggle = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    const { isEnabled } = request.body as { isEnabled: boolean };
    const config = getConfig();
    let settingsSaved = false;
    try {
      // Release admission before IPC: quick startup takes this same lock when saving its name.
      await withSettingsChange(config.paths.nodeSettingsPath, () => {
        config.reloadNodeSettings(true);
        config.updateNodeSettings({ isCloudflareTunnelEnabled: isEnabled });
        return Promise.resolve();
      });
      settingsSaved = true;
      const tunnel = await requestTunnelOperation('reconcile');
      config.reloadNodeSettings();
      const settings = config.nodeSettings;
      const isError = tunnel.status === 'error';
      return await reply.status(isError ? 502 : 200).send({
        isError,
        settingsSaved,
        cloudflareTunnelName: settings.cloudflareTunnelName ?? '',
        isCloudflareTunnelEnabled: settings.isCloudflareTunnelEnabled,
        isCloudflareCdnEnabled: settings.isCloudflareCdnEnabled,
        tunnel,
        ...(isError
          ? {
              message:
                'Tunnel preference saved, but the tunnel could not reach the requested state.',
            }
          : {}),
      });
    } catch (error) {
      config.reloadNodeSettings();
      const settings = config.nodeSettings;
      const conflict =
        !settingsSaved &&
        error instanceof Error &&
        error.message === 'Another settings change or job admission is in progress.';
      return reply.status(settingsSaved ? 502 : conflict ? 409 : 500).send({
        isError: true,
        settingsSaved,
        cloudflareTunnelName: settings.cloudflareTunnelName ?? '',
        isCloudflareTunnelEnabled: settings.isCloudflareTunnelEnabled,
        isCloudflareCdnEnabled: settings.isCloudflareCdnEnabled,
        tunnel: {
          mode: 'none',
          status: 'error',
          name: '',
          message: 'Tunnel runtime state could not be confirmed.',
        },
        message: settingsSaved
          ? 'Tunnel preference saved, but its runtime state could not be confirmed. Refresh and try again.'
          : 'Cloudflare Tunnels preference could not be saved. Try again.',
      });
    }
  };

  /**
   * GET /settings/avatar
   *
   * Get node avatar image
   */
  getAvatar = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const avatarFilePath = this.settingsService.getAvatarFilePath();

      if (avatarFilePath === null) {
        return await this.sendError(reply, 'avatar not found', 404);
      } else {
        return await this.sendFile(reply, avatarFilePath, 'image/png');
      }
    } catch (error) {
      this.logger.error('Error retrieving avatar', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /settings/banner
   *
   * Get node banner image
   */
  getBanner = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const bannerFilePath = this.settingsService.getBannerFilePath();

      if (bannerFilePath === null) {
        return await this.sendError(reply, 'banner not found', 404);
      } else {
        return await this.sendFile(reply, bannerFilePath, 'image/png');
      }
    } catch (error) {
      this.logger.error('Error retrieving banner', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * POST /settings/avatar
   *
   * Upload node avatar and icon images
   * Expects multipart form with 'iconFile' and 'avatarFile' fields
   */
  uploadAvatar = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const config = getConfig();

      const imagesDir = config.paths.imagesDirectoryPath;

      // Ensure images directory exists
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      // Parse multipart data
      const parts = request.parts({ limits: { fileSize: 20 * 1024 ** 2, files: 2, parts: 4 } });

      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname === 'iconFile') {
            const iconPath = path.join(imagesDir, 'icon.png');
            await pipeline(part.file, fs.createWriteStream(iconPath));
          } else if (part.fieldname === 'avatarFile') {
            const avatarPath = path.join(imagesDir, 'avatar.png');
            await pipeline(part.file, fs.createWriteStream(avatarPath));
          }
        }
      }

      try {
        await this.cloudflareService.purgeNodeImages();
      } catch (error) {
        this.logger.error('Failed to purge node images from Cloudflare', error);
      }

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('SettingsController.uploadAvatar failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * POST /settings/banner
   *
   * Upload node banner image
   * Expects multipart form with 'bannerFile' field
   */
  uploadBanner = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const config = getConfig();

      const imagesDir = config.paths.imagesDirectoryPath;

      // Ensure images directory exists
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      // Parse multipart data
      const parts = request.parts({ limits: { fileSize: 20 * 1024 ** 2, files: 2, parts: 4 } });

      let bannerFile: MultipartFile | undefined;

      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'bannerFile') {
          bannerFile = part;
          // Save banner file
          const bannerPath = path.join(imagesDir, 'banner.png');
          await pipeline(part.file, fs.createWriteStream(bannerPath));
        }
      }

      if (bannerFile === undefined) {
        return await this.sendError(reply, 'bannerFile is required');
      } else {
        // Purge Cloudflare cache if enabled
        await this.cloudflareService.purgeNodeImages();

        return await this.sendSuccess(reply);
      }
    } catch (error) {
      this.logger.error('Banner upload error', error);

      return await this.sendError(reply, 'error uploading banner');
    }
  };

  /**
   * POST /settings/secure
   *
   * Configure secure mode (HTTPS) with SSL certificates
   * Expects multipart form with 'keyFile', 'certFile', and optionally 'caFiles'
   * Or a JSON body with isSecure: false to disable HTTPS
   */
  configureSecure = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const secureQuery = request.query as SecureQuery;

      if (secureQuery.isSecure) {
        const outcome = await this.enableHttpsMode(request);

        if (outcome.success) {
          return await this.sendSuccess(reply);
        } else {
          return await this.sendError(reply, outcome.error);
        }
      } else {
        this.disableHttpsMode();
        return await this.sendSuccess(reply);
      }
    } catch (error) {
      this.logger.error('Secure mode configuration error', error);

      return await this.sendError(reply, 'error configuring secure mode');
    }
  };

  /**
   * Enable HTTPS mode by processing certificate files
   */
  private async enableHttpsMode(
    request: FastifyRequest
  ): Promise<{ success: boolean; error: string }> {
    const config = getConfig();

    const certsDir = config.paths.certificatesDirectoryPath;

    // Ensure certificates directory exists
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }

    // Parse multipart data and save certificate files
    const { hasKeyFile, hasCertFile } = await this.saveCertificateFiles(request, certsDir);

    if (!hasKeyFile) {
      return { success: false, error: 'private key file is missing' };
    }

    if (!hasCertFile) {
      return { success: false, error: 'cert file is missing' };
    }

    this.logger.info('switching node to HTTPS mode');

    config.updateNodeSettings({ isSecure: true });

    return { success: true, error: '' };
  }

  /**
   * Save certificate files from multipart request
   */
  private async saveCertificateFiles(
    request: FastifyRequest,
    certsDir: string
  ): Promise<{ hasKeyFile: boolean; hasCertFile: boolean }> {
    const parts = request.parts({ limits: { fileSize: 1024 ** 2, files: 12, parts: 14 } });

    let hasKeyFile = false;
    let hasCertFile = false;
    let caFileCount = 0;

    for await (const part of parts) {
      if (part.type !== 'file') {
        continue;
      }

      if (part.fieldname === 'keyFile') {
        hasKeyFile = true;
        const keyPath = path.join(certsDir, 'private_key.pem');

        await pipeline(part.file, fs.createWriteStream(keyPath));
      } else if (part.fieldname === 'certFile') {
        hasCertFile = true;
        const certPath = path.join(certsDir, 'certificate.pem');

        await pipeline(part.file, fs.createWriteStream(certPath));
      } else if (part.fieldname === 'caFiles') {
        caFileCount++;
        const caPath = path.join(certsDir, `ca_${String(caFileCount)}.pem`);

        await pipeline(part.file, fs.createWriteStream(caPath));
      }
    }

    return { hasKeyFile, hasCertFile };
  }

  /**
   * Disable HTTPS mode
   */
  private disableHttpsMode(): { success: boolean; error?: string } {
    this.logger.info('switching node to HTTP mode');

    const config = getConfig();

    config.updateNodeSettings({ isSecure: false });

    return { success: true };
  }

  /**
   * POST /settings/personalize/nodeName
   *
   * Update node name
   */
  personalizeNodeName = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { nodeName } = request.body as PersonalizeNodeNameBody;

      await this.settingsService.updateNodeName(nodeName);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error updating node name', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/personalize/nodeAbout
   *
   * Update node about
   */
  personalizeNodeAbout = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { nodeAbout } = request.body as PersonalizeNodeAboutBody;

      await this.settingsService.updateNodeAbout(nodeAbout);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error updating node about', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/account
   *
   * Update account credentials
   */
  updateAccount = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { username, password } = request.body as AccountBody;

      await this.settingsService.updateCredentials(username, password);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error updating account', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/network/internal
   *
   * Update internal network settings
   */
  networkInternal = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      if (this.settingsService.isDockerEnvironment()) {
        return await this.sendError(
          reply,
          'This node cannot change listening ports because it is running inside of a docker container.'
        );
      }

      const { nodeListeningPort } = request.body as NetworkInternalBody;

      const config = getConfig();

      config.updateNodeSettings({ nodeListeningPort: nodeListeningPort });

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error updating internal network settings', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/network/external
   *
   * Update external network settings
   * Also rewrites HLS manifest URLs when storage mode is filesystem
   */
  networkExternal = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      await this.changeDistributionSettings(async (config) => {
        const { publicNodeProtocol, publicNodeAddress, publicNodePort } =
          request.body as NetworkExternalBody;

        const previous = config.nodeSettings;
        if (previous.isCloudflareCdnEnabled) {
          await this.cloudflareService.validateCdnConfiguration(
            previous.cloudflareEmailAddress,
            previous.cloudflareZoneId,
            previous.cloudflareGlobalApiKey,
            { publicNodeAddress, storageConfig: previous.storageConfig }
          );
        }

        // Update the standalone node network settings
        try {
          await this.settingsService.updateNetworkSettings(
            publicNodeProtocol,
            publicNodeAddress,
            publicNodePort
          );

          // Rewrite HLS manifest URLs if using filesystem storage
          await this.rewriteAllManifestUrls(config);

          await this.cloudflareService.purgeNodePage();
          await this.cloudflareService.purgeAllWatchPages();
        } catch (error) {
          config.updateNodeSettings({
            publicNodeProtocol: previous.publicNodeProtocol,
            publicNodeAddress: previous.publicNodeAddress,
            publicNodePort: previous.publicNodePort,
          });
          try {
            await withCloudflareRecovery(() => this.rewriteAllManifestUrls(config));
          } catch (recoveryError) {
            throw new AggregateError(
              [error, recoveryError],
              'Network change failed and manifest recovery is incomplete.'
            );
          }
          throw error;
        }

        return;
      });
      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error updating external network settings', error);

      return await this.distributionFailure(reply, error);
    }
  };

  private async changeDistributionSettings<T>(
    operation: (config: ReturnType<typeof getConfig>) => Promise<T>,
    credentialRepair?: StorageConfig
  ): Promise<T> {
    const config = getConfig();
    return withCloudflareDeadline(() =>
      withTunnelAdmission(config.paths.nodeSettingsPath, () =>
        withSettingsChange(config.paths.nodeSettingsPath, async () => {
          config.reloadNodeSettings(true);
          for (let offset = 0; ; offset += 100) {
            const videos = await this.videosService.getAllVideosData({ limit: 100, offset });
            const draining = videos.some((video) => {
              const meta: unknown = video.meta;
              return (
                typeof meta === 'object' &&
                meta !== null &&
                'streamCleanupAt' in meta &&
                typeof meta.streamCleanupAt === 'number'
              );
            });
            if (
              draining &&
              (credentialRepair === undefined ||
                storageIdentity(credentialRepair) !==
                  storageIdentity(config.nodeSettings.storageConfig))
            ) {
              throw new Error(
                'Wait for stopped streams to finish draining before changing distribution settings.'
              );
            }
            if (videos.some((video) => video.isStreaming || video.isPublishing)) {
              throw new Error(
                'Stop active streams and publishing jobs before changing distribution settings.'
              );
            }
            if (videos.length < 100) {
              break;
            }
          }
          const previous = config.nodeSettings;
          this.previousMediaBases = managedMediaBases(config, true);
          let outcome: { value: T } | { error: unknown };
          try {
            outcome = { value: await operation(config) };
          } catch (error) {
            outcome = { error };
          }
          // Purge after final writes, including partial migrations and rollback.
          const zones = new Map<string, typeof previous>();
          for (const settings of [previous, config.nodeSettings]) {
            if (settings.isCloudflareCdnEnabled) {
              zones.set(settings.cloudflareZoneId, settings);
            }
          }
          const failures: unknown[] = [];
          for (const settings of zones.values()) {
            try {
              await this.cloudflareService.purgeEntireCacheWithCredentials(
                settings.cloudflareEmailAddress,
                settings.cloudflareZoneId,
                settings.cloudflareGlobalApiKey
              );
            } catch (error) {
              failures.push(error);
            }
          }
          if (failures.length) {
            throw new AggregateError(
              'error' in outcome ? [outcome.error, ...failures] : failures,
              'Distribution cache invalidation incomplete; retry work remains queued.'
            );
          }
          if ('error' in outcome) {
            throw outcome.error;
          }
          return outcome.value;
        })
      )
    );
  }

  private async completeMediaMigration(config: ReturnType<typeof getConfig>): Promise<void> {
    try {
      await this.rewriteAllManifestUrls(config);
    } catch (error) {
      throw new Error(
        'Settings saved, but media migration or invalidation is incomplete; reapply these settings to retry.',
        { cause: error }
      );
    }
  }

  private async distributionFailure(reply: FastifyReply, error: unknown): Promise<FastifyReply> {
    return await this.sendError(
      reply,
      error instanceof Error ? error.message : 'error communicating with the MoarTube node'
    );
  }

  /**
   * Rewrite all HLS manifest URLs if using filesystem storage
   */
  private async rewriteAllManifestUrls(config = getConfig()): Promise<void> {
    const settings = config.nodeSettings;
    const base = config.getExternalVideosBaseUrl();
    for (let offset = 0; ; offset += 100) {
      const videos = await this.videosService.getAllVideosData({ limit: 100, offset });
      for (const video of videos) {
        if (settings.storageConfig.storageMode === 'filesystem') {
          await this.rewriteVideoManifests(video, config.paths.videosDirectoryPath, base);
          await this.cloudflareService.purgeAdaptiveVideos(video.videoId, undefined, true);
        } else if (video.isPublished && video.outputs.m3u8.length > 0) {
          await this.videosService.rewriteS3VideoManifests(
            video.videoId,
            video.outputs.m3u8,
            base,
            this.previousMediaBases
          );
          await this.cloudflareService.purgeVideo(video.videoId);
        } else {
          continue;
        }
        await this.cloudflareService.purgeWatchPages([video.videoId], true);
      }
      if (videos.length < 100) {
        break;
      }
    }
  }

  /**
   * Rewrite manifest URLs for a single video
   */
  private async rewriteVideoManifests(
    video: { videoId: string; outputs: VideoOutputs },
    videosDirectoryPath: string,
    externalVideosBaseUrl: string
  ): Promise<void> {
    const outputs = video.outputs as { m3u8: string[] };

    if (outputs.m3u8.length === 0) {
      return;
    }

    // Publish the master only after all renditions have been rewritten successfully.
    const masterManifestPath = path.join(
      videosDirectoryPath,
      video.videoId,
      'adaptive',
      'm3u8',
      'manifest-master.m3u8'
    );
    // Update resolution-specific manifests
    for (const resolution of outputs.m3u8) {
      const manifestPath = path.join(
        videosDirectoryPath,
        video.videoId,
        'adaptive',
        'm3u8',
        `manifest-${resolution}.m3u8`
      );
      if (fs.existsSync(manifestPath)) {
        await this.rewriteManifestUrls(manifestPath, externalVideosBaseUrl);
      }
    }
    if (fs.existsSync(masterManifestPath)) {
      await this.rewriteManifestUrls(masterManifestPath, externalVideosBaseUrl);
    }
  }

  /**
   * Rewrites URLs in an HLS manifest file to use the new external base URL
   */
  private async rewriteManifestUrls(
    manifestPath: string,
    externalVideosBaseUrl: string
  ): Promise<void> {
    try {
      const bases = [
        externalVideosBaseUrl,
        ...managedMediaBases(getConfig()),
        ...this.previousMediaBases,
      ];
      await rewriteManifestFile(
        manifestPath,
        (line) =>
          relativeHlsLine(
            line,
            hlsPlaylistPath(
              path.basename(path.dirname(path.dirname(path.dirname(manifestPath)))),
              path.basename(manifestPath)
            ),
            bases
          ),
        false,
        distributionSignal()
      );
    } catch (error) {
      this.logger.error('Failed to rewrite manifest', error);
      throw error;
    }
  }

  /**
   * POST /settings/cloudflare/configure
   *
   * Configure Cloudflare CDN
   */
  cloudflareConfigure = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    const parsed = cloudflareConfigureBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return await this.sendError(reply, 'Cloudflare credentials are required', 400);
    }
    const progress = { settingsSaved: false };
    try {
      await this.changeDistributionSettings(async (config) => {
        const { cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey } = parsed.data;

        // Validate Cloudflare credentials
        const isValid = await isCloudflareCredentialsValid(
          cloudflareEmailAddress,
          cloudflareZoneId,
          cloudflareGlobalApiKey
        );

        if (!isValid) {
          throw new Error('could not validate the Cloudflare credentials');
        }

        // Get current storage config for DNS record setup
        const storageConfig = config.nodeSettings.storageConfig;
        await this.cloudflareService.validateCdnConfiguration(
          cloudflareEmailAddress,
          cloudflareZoneId,
          cloudflareGlobalApiKey,
          { publicNodeAddress: config.nodeSettings.publicNodeAddress, storageConfig }
        );

        const previous = config.nodeSettings;
        // Reuse an existing named tunnel for same-zone reconfiguration. Quick names
        // belong to Cloudflare and must not become the new managed tunnel label.
        const savedName = previous.cloudflareTunnelName ?? '';
        const tunnelName =
          previous.isCloudflareCdnEnabled &&
          previous.cloudflareZoneId === cloudflareZoneId &&
          savedName !== ''
            ? savedName
            : `moartube-${randomUUID()}`;
        const changingZone =
          previous.isCloudflareCdnEnabled && previous.cloudflareZoneId !== cloudflareZoneId;
        const applyConfiguration = async (): Promise<void> => {
          await this.cloudflareService.withConfigurationRollback(
            cloudflareEmailAddress,
            cloudflareZoneId,
            cloudflareGlobalApiKey,
            async () => {
              await this.cloudflareService.setCdnConfiguration(
                cloudflareEmailAddress,
                cloudflareZoneId,
                cloudflareGlobalApiKey
              );
              await this.cloudflareService.addCdnDnsRecord(
                cloudflareEmailAddress,
                cloudflareZoneId,
                cloudflareGlobalApiKey,
                storageConfig
              );
              await this.cloudflareService.purgeEntireCacheWithCredentials(
                cloudflareEmailAddress,
                cloudflareZoneId,
                cloudflareGlobalApiKey
              );
              if (changingZone) {
                // Old credentials remain authoritative until both provider changes can commit.
                await requestTunnelOperation('prepare_cdn_clear');
                await this.cloudflareService.resetCdn(
                  previous.cloudflareEmailAddress,
                  previous.cloudflareZoneId,
                  previous.cloudflareGlobalApiKey
                );
              }
              this.settingsService.updateCloudflareConfig(
                cloudflareEmailAddress,
                cloudflareZoneId,
                cloudflareGlobalApiKey,
                tunnelName
              );
              progress.settingsSaved = true;
            }
          );
        };
        if (changingZone) {
          await this.cloudflareService.withConfigurationRollback(
            previous.cloudflareEmailAddress,
            previous.cloudflareZoneId,
            previous.cloudflareGlobalApiKey,
            applyConfiguration
          );
        } else {
          await applyConfiguration();
        }
        await this.completeMediaMigration(config);

        return;
      });
      return await this.finishCloudflareChange(reply);
    } catch (error) {
      if (progress.settingsSaved) {
        return await this.finishCloudflareChange(reply, true);
      }
      const busy =
        error instanceof Error &&
        error.message === 'Another settings change or job admission is in progress.';
      return await this.sendError(reply, 'Cloudflare configuration failed', busy ? 409 : 400);
    }
  };

  /**
   * POST /settings/cloudflare/clear
   *
   * Clear Cloudflare configuration
   */
  cloudflareClear = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    const progress = { settingsSaved: false };
    try {
      await this.changeDistributionSettings(async (config) => {
        const nodeSettings = config.nodeSettings;

        // Only reset if Cloudflare CDN is currently enabled
        if (nodeSettings.isCloudflareCdnEnabled) {
          const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
          const cloudflareZoneId = nodeSettings.cloudflareZoneId;
          const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

          await this.cloudflareService.withConfigurationRollback(
            cloudflareEmailAddress,
            cloudflareZoneId,
            cloudflareGlobalApiKey,
            async () => {
              // Reset CDN configuration; media DNS stays available for old manifest references.
              await this.cloudflareService.resetCdn(
                cloudflareEmailAddress,
                cloudflareZoneId,
                cloudflareGlobalApiKey
              );

              // Purge entire cache
              await this.cloudflareService.purgeEntireCacheWithCredentials(
                cloudflareEmailAddress,
                cloudflareZoneId,
                cloudflareGlobalApiKey
              );
              await requestTunnelOperation('prepare_cdn_clear');
              this.settingsService.clearCloudflareConfig();
              progress.settingsSaved = true;
            }
          );
        } else {
          this.settingsService.clearCloudflareConfig();
          progress.settingsSaved = true;
        }

        await this.completeMediaMigration(config);
        return;
      });
      return await this.finishCloudflareChange(reply);
    } catch (error) {
      if (progress.settingsSaved) {
        return await this.finishCloudflareChange(reply, true);
      }
      const busy =
        error instanceof Error &&
        error.message === 'Another settings change or job admission is in progress.';
      return await this.sendError(
        reply,
        'Cloudflare configuration could not be cleared',
        busy ? 409 : 400
      );
    }
  };

  private async finishCloudflareChange(
    reply: FastifyReply,
    distributionError = false
  ): Promise<FastifyReply> {
    const config = getConfig();
    try {
      // Distribution admission has been released; quick startup may now save its generated name.
      const tunnel = await requestTunnelOperation('reconcile');
      config.reloadNodeSettings();
      const settings = config.nodeSettings;
      const isError = distributionError || tunnel.status === 'error';
      return await reply.status(isError ? 502 : 200).send({
        isError,
        settingsSaved: true,
        isCloudflareCdnEnabled: settings.isCloudflareCdnEnabled,
        isCloudflareTunnelEnabled: settings.isCloudflareTunnelEnabled,
        cloudflareTunnelName: settings.cloudflareTunnelName ?? '',
        tunnel,
        ...(isError
          ? {
              message:
                'CDN settings saved, but distribution or tunnel reconciliation is incomplete.',
            }
          : {}),
      });
    } catch {
      config.reloadNodeSettings();
      const settings = config.nodeSettings;
      return reply.status(502).send({
        isError: true,
        settingsSaved: true,
        isCloudflareCdnEnabled: settings.isCloudflareCdnEnabled,
        isCloudflareTunnelEnabled: settings.isCloudflareTunnelEnabled,
        cloudflareTunnelName: settings.cloudflareTunnelName ?? '',
        tunnel: { mode: 'none', status: 'error', name: '' },
        message:
          'CDN settings saved, but tunnel state could not be confirmed. Refresh settings before retrying.',
      });
    }
  }

  /**
   * POST /settings/cloudflare/turnstile/configure
   *
   * Configure Cloudflare Turnstile
   */
  cloudflareTurnstileConfigure = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const { cloudflareTurnstileSiteKey, cloudflareTurnstileSecretKey } =
        request.body as CloudflareTurnstileConfigureBody;

      const config = getConfig();

      config.updateNodeSettings({
        isCloudflareTurnstileEnabled: true,
        cloudflareTurnstileSiteKey,
        cloudflareTurnstileSecretKey,
      });

      // Broadcast to chat clients so they know Turnstile is now enabled
      this.websocketService.broadcastToChat('all', {
        eventName: 'cloudflare_turnstile_information',
        data: {
          cloudflareTurnstileSiteKey,
        },
      });

      await this.cloudflareService.purgeAllWatchPages();
      await this.cloudflareService.purgeNodePage();

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error configuring Cloudflare Turnstile', error);

      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/cloudflare/turnstile/clear
   *
   * Clear Cloudflare Turnstile configuration
   */
  cloudflareTurnstileClear = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const config = getConfig();

      config.updateNodeSettings({
        isCloudflareTurnstileEnabled: false,
        cloudflareTurnstileSiteKey: '',
        cloudflareTurnstileSecretKey: '',
      });

      // Broadcast to chat clients so they know Turnstile is now disabled
      this.websocketService.broadcastToChat('all', {
        eventName: 'cloudflare_turnstile_information',
        data: {
          cloudflareTurnstileSiteKey: '',
        },
      });

      // Purge all watch pages from Cloudflare cache
      await this.cloudflareService.purgeAllWatchPages();
      await this.cloudflareService.purgeNodePage();

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error clearing Cloudflare Turnstile', error);

      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/comments/toggle
   *
   * Toggle comments enabled
   */
  commentsToggle = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { isEnabled } = request.body as ToggleBooleanBody;

      const config = getConfig();

      config.updateNodeSettings({ isCommentsEnabled: isEnabled });
      await this.cloudflareService.purgeNodePage();

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error toggling comments', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/likes/toggle
   *
   * Toggle likes enabled
   */
  likesToggle = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { isEnabled } = request.body as ToggleBooleanBody;

      const config = getConfig();

      config.updateNodeSettings({ isLikesEnabled: isEnabled });
      await this.cloudflareService.purgeNodePage();

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error toggling likes', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/dislikes/toggle
   *
   * Toggle dislikes enabled
   */
  dislikesToggle = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { isEnabled } = request.body as ToggleBooleanBody;

      const config = getConfig();

      config.updateNodeSettings({ isDislikesEnabled: isEnabled });
      await this.cloudflareService.purgeNodePage();

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error toggling dislikes', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/reports/toggle
   *
   * Toggle reports enabled
   */
  reportsToggle = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { isEnabled } = request.body as ToggleBooleanBody;

      const config = getConfig();

      config.updateNodeSettings({ isReportsEnabled: isEnabled });
      await this.cloudflareService.purgeNodePage();

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error toggling reports', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/liveChat/toggle
   *
   * Toggle live chat enabled
   */
  liveChatToggle = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { isEnabled } = request.body as ToggleBooleanBody;

      const config = getConfig();

      config.updateNodeSettings({ isLiveChatEnabled: isEnabled });
      await this.cloudflareService.purgeNodePage();

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error toggling live chat', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/databaseConfig/toggle
   *
   * Update database configuration
   * Tests connection using underlying drivers before saving config
   */
  databaseConfigToggle = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { databaseConfig } = request.body as DatabaseConfigBody;

      await this.settingsService.updateDatabaseConfig(databaseConfig);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Database connection test failed', error);

      return await this.sendError(
        reply,
        'could not connect to database with provided configuration'
      );
    }
  };

  /**
   * POST /settings/storageConfig/toggle
   *
   * Update storage configuration
   */
  storageConfigToggle = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      await this.changeDistributionSettings(
        async (config) => {
          const { storageConfig } = request.body as StorageConfigBody;

          // Update Cloudflare CDN DNS record if CDN is enabled
          const nodeSettings = config.nodeSettings;

          if (nodeSettings.isCloudflareCdnEnabled) {
            const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
            const cloudflareZoneId = nodeSettings.cloudflareZoneId;
            const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;
            await this.cloudflareService.validateCdnConfiguration(
              cloudflareEmailAddress,
              cloudflareZoneId,
              cloudflareGlobalApiKey,
              { publicNodeAddress: nodeSettings.publicNodeAddress, storageConfig }
            );
            await this.cloudflareService.withConfigurationRollback(
              cloudflareEmailAddress,
              cloudflareZoneId,
              cloudflareGlobalApiKey,
              async () => {
                // Add/update CDN DNS record based on new storage config
                await this.cloudflareService.addCdnDnsRecord(
                  cloudflareEmailAddress,
                  cloudflareZoneId,
                  cloudflareGlobalApiKey,
                  storageConfig
                );

                // Purge entire cache
                await this.cloudflareService.purgeEntireCacheWithCredentials(
                  cloudflareEmailAddress,
                  cloudflareZoneId,
                  cloudflareGlobalApiKey
                );
                this.settingsService.updateStorageConfig(storageConfig);
              }
            );
          } else {
            this.settingsService.updateStorageConfig(storageConfig);
          }

          await this.completeMediaMigration(config);
          return;
        },
        (request.body as StorageConfigBody).storageConfig
      );
      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Storage config toggle error', error);

      return await this.distributionFailure(reply, error);
    }
  };

  /**
   * GET /settings/export/database
   *
   * Export all database tables to JSON format
   * Removes auto-generated 'id' columns and normalizes boolean values
   * for cross-database compatibility (SQLite <-> PostgreSQL)
   */
  exportDatabase = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const backup = await this.settingsService.createDatabaseBackup();
      const raw = (request.query as { download?: string } | undefined)?.download === '1';
      const stream = Readable.from(
        (async function* () {
          try {
            if (!raw) {
              yield '{"isError":false,"database":';
            }
            yield* fs.createReadStream(backup.file);
            if (!raw) {
              yield '}';
            }
          } finally {
            await backup.dispose();
          }
        })()
      );
      stream.on('close', () => {
        void backup.dispose().catch(() => {});
      });
      return await reply.type('application/json').send(stream);
    } catch (error) {
      this.logger.error('Database export error', error);
      return await this.sendError(reply, 'error exporting database');
    }
  };

  /**
   * POST /settings/import/database
   *
   * Import database from JSON file
   * Clears all existing data and imports from the uploaded file
   * Expects multipart form with 'databaseFile' field containing JSON
   */
  importDatabase = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const temporary = path.join(tmpdir(), 'moartube-import-' + randomUUID() + '.json');
    let found = false;
    try {
      for await (const part of request.parts()) {
        if (part.type === 'file' && part.fieldname === 'databaseFile') {
          if (found) {
            throw new Error('Only one database file is allowed');
          }
          found = true;
          await writeUpload(part, temporary, 10 * 1024 ** 3);
        } else if (part.type === 'file') {
          (part as { file?: Readable }).file?.resume();
        }
      }
      if (!found) {
        return await this.sendError(reply, 'database file is missing');
      }
      await this.settingsService.restoreDatabaseBackup(temporary);
      await this.cloudflareService.purgeNodePage();
      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Database import error', error);
      return await this.sendError(reply, 'error importing database');
    } finally {
      await rm(temporary, { force: true });
    }
  };

  /**
   * POST /settings/restart
   *
   * Restart the server. This is a separate idempotent endpoint so that
   * callers can perform configuration changes first and then trigger a
   * restart once they are ready.
   */
  restartServer = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const result = await this.sendSuccess(reply);

      setImmediate(() => {
        if (process.send) {
          process.send({ cmd: 'restart_server' });
        }
      });

      return result;
    } catch (error) {
      this.logger.error('Server restart error', error);

      return await this.sendError(reply, 'error restarting the MoarTube node');
    }
  };
}
