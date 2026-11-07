import type { NodeLink, NodeIcon } from '@/types/config.js';
import {
  readCdnJournal,
  writeCdnJournal,
  cdnStatus,
  hasPendingCdn,
  publicAddressOf,
  type CdnTransition,
  type CdnCredentials,
} from '@/utils/cdn-journal.js';
import { withDistributionTransition } from '@/utils/distribution-admission.js';
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

interface CdnResponse {
  status: number;
  data: Record<string, unknown>;
}

/**
 * Request body interfaces
 */
export interface PersonalizeNodeNameBody {
  nodeName: string;
}

export interface PersonalizeNodeHeadlineBody {
  nodeHeadline: string;
}

export interface PersonalizeNodeBulletinBody {
  nodeBulletin: string[];
}

export interface PersonalizeNodeLinksBody {
  nodeLinks: NodeLink[];
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
  public getMetricsBundle = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    const rootPid = cluster.isWorker ? process.ppid : process.pid;
    const collect = async <T>(
      name: string,
      load: () => Promise<T>
    ): Promise<{ isError: false; metrics: T } | { isError: true }> => {
      try {
        return { isError: false, metrics: await load() };
      } catch (error) {
        this.logger.debug(`Failed to load ${name} metrics`, { error });
        return { isError: true };
      }
    };
    const [cpu, memory, disk] = await Promise.all([
      collect('CPU', () => getCpuMetrics(rootPid)),
      collect('memory', () => getMemoryMetrics(rootPid)),
      collect('storage', () => this.getStorageMetrics()),
    ]);
    return await this.sendSuccess(reply, { metrics: { cpu, memory, disk } });
  };

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

  private async getStorageMetrics(): Promise<StorageMetrics> {
    const settings = this.settingsService.getNodeSettings() as {
      storageConfig: { storageMode: string };
    };
    if (settings.storageConfig.storageMode === 's3provider') {
      return {
        storageMode: 's3provider',
        mediaBytes: null,
        availableBytes: null,
        totalBytes: null,
      };
    }
    this.metricsScan ??= getStorageMetrics(
      path.join(getConfig().paths.dataDirectoryPath, 'media')
    ).finally(() => {
      this.metricsScan = undefined;
    });
    return await this.metricsScan;
  }

  public getMetrics = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    try {
      return await this.sendSuccess(reply, { metrics: await this.getStorageMetrics() });
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
          cloudflareAddressMigrationPending:
            nodeSettings['cloudflareAddressMigrationPending'] === true ||
            hasPendingCdn(getConfig().paths.nodeSettingsPath),
          cdnTransition: cdnStatus(getConfig().paths.nodeSettingsPath),
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
   * POST /settings/personalize/name
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
   * POST /settings/personalize/headline
   *
   * Update node headline
   */
  personalizeNodeHeadline = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { nodeHeadline } = request.body as PersonalizeNodeHeadlineBody;

      await this.settingsService.updateNodeHeadline(nodeHeadline);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Error updating node headline', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /** POST /settings/personalize/bulletin */
  personalizeNodeBulletin = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { nodeBulletin } = request.body as PersonalizeNodeBulletinBody;
      const saved = this.settingsService.updateNodeBulletin(nodeBulletin);
      return await this.sendSuccess(reply, { nodeBulletin: saved });
    } catch (error) {
      this.logger.error('Error updating node bulletin', error);
      return await this.sendCaughtError(reply, error, 'Unable to save bulletin');
    }
  };

  /** POST /settings/personalize/links */
  personalizeNodeLinks = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { nodeLinks } = request.body as PersonalizeNodeLinksBody;
      const saved = this.settingsService.updateNodeLinks(nodeLinks);
      return await this.sendSuccess(reply, { nodeLinks: saved });
    } catch (error) {
      this.logger.error('Error updating node links', error);
      return await this.sendCaughtError(reply, error, 'Unable to save links');
    }
  };

  /** POST /settings/personalize/icons */
  personalizeNodeIcons = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { nodeIcons } = request.body as { nodeIcons: NodeIcon[] };
      const saved = this.settingsService.updateNodeIcons(nodeIcons);
      await this.cloudflareService.purgeAllWatchPages();
      await this.cloudflareService.purgeHomePage();
      return await this.sendSuccess(reply, { nodeIcons: saved });
    } catch (error) {
      this.logger.error('Error updating node icons', error);
      return await this.sendCaughtError(reply, error, 'Unable to save icons');
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

          await this.cloudflareService.purgeHomePage();
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
    credentialRepair?: StorageConfig,
    transitionHeld = false,
    automaticPurge = true
  ): Promise<T> {
    const config = getConfig();
    const operationWithLocks = (): Promise<T> =>
      withCloudflareDeadline(() =>
        withTunnelAdmission(config.paths.nodeSettingsPath, () =>
          withSettingsChange(config.paths.nodeSettingsPath, async () => {
            config.reloadNodeSettings(true);
            if (
              !transitionHeld &&
              (config.nodeSettings['cloudflareAddressMigrationPending'] ||
                hasPendingCdn(config.paths.nodeSettingsPath))
            ) {
              throw new Error(
                'Finish the pending CDN transition before changing distribution settings.'
              );
            }
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
              if (
                videos.some(
                  (video) =>
                    video.isImporting === true || video.isStreaming || video.isPublishing === true
                )
              ) {
                throw new Error(
                  'Stop active imports, publishing jobs, and streams before changing distribution settings.'
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
            for (const settings of automaticPurge ? zones.values() : []) {
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
    return transitionHeld ? operationWithLocks() : withDistributionTransition(operationWithLocks);
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
      return this.sendError(reply, 'Cloudflare credentials are required', 400);
    }
    return this.runCdnChange(reply, true, parsed.data);
  };

  cloudflareClear = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    return this.runCdnChange(reply, false);
  };

  cloudflareRetry = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    const id = (request.body as { transitionId?: unknown } | undefined)?.transitionId;
    if (typeof id !== 'string' || id.length > 100) {
      return this.sendError(reply, 'A CDN transition ID is required.', 400);
    }
    return this.runCdnChange(reply, null, undefined, id);
  };

  private async runCdnChange(
    reply: FastifyReply,
    enabled: boolean | null,
    credentials?: {
      cloudflareEmailAddress: string;
      cloudflareZoneId: string;
      cloudflareGlobalApiKey: string;
    },
    expectedId?: string
  ): Promise<FastifyReply> {
    const config = getConfig();
    const progress = { admitted: false };
    let response: CdnResponse;
    const reject = (message: string, status: number): CdnResponse => ({
      status,
      data: { isError: true, message },
    });
    try {
      response = await withDistributionTransition(async () => {
        config.reloadNodeSettings(true);
        let state = readCdnJournal(config.paths.nodeSettingsPath);
        const current = state.current;
        // Completed retries are status reads; they never start untracked work.
        if (
          enabled === null &&
          current !== null &&
          current.id === expectedId &&
          current.stage === 'complete'
        ) {
          config.reloadNodeSettings(true);
          return this.cdnReply(false);
        }
        if (enabled === null && (!current || current.id !== expectedId)) {
          return reject(
            'This CDN recovery request is stale. Refresh Settings before retrying.',
            409
          );
        }
        if (
          enabled !== null &&
          ((current !== null && current.stage !== 'complete') ||
            config.nodeSettings.cloudflareAddressMigrationPending)
        ) {
          return reject('Finish the pending CDN transition before changing CDN settings.', 409);
        }
        try {
          await this.changeDistributionSettings(
            async () => {
              state = readCdnJournal(config.paths.nodeSettingsPath);
              if (enabled !== null) {
                const previous = config.nodeSettings;
                let target: CdnCredentials | null = null;
                let publicAddress = publicAddressOf(
                  previous.cloudflarePublicAddressBackup ?? previous
                );
                if (enabled) {
                  if (!credentials) {
                    throw new Error('Cloudflare credentials are required.');
                  }
                  const {
                    cloudflareEmailAddress: email,
                    cloudflareZoneId: zone,
                    cloudflareGlobalApiKey: key,
                  } = credentials;
                  if (!(await isCloudflareCredentialsValid(email, zone, key))) {
                    throw new Error('Could not validate Cloudflare credentials.');
                  }
                  const domain = await this.cloudflareService.resolveCdnPublicAddress(
                    email,
                    zone,
                    key
                  );
                  await this.cloudflareService.validateCdnConfiguration(email, zone, key, {
                    publicNodeAddress: domain,
                    storageConfig: previous.storageConfig,
                  });
                  target = { email, zone, key };
                  publicAddress = {
                    publicNodeProtocol: 'https',
                    publicNodeAddress: domain,
                    publicNodePort: 443,
                  };
                }
                state.current = {
                  id: randomUUID(),
                  targetEnabled: enabled,
                  stage: 'provider',
                  target,
                  source: previous.isCloudflareCdnEnabled
                    ? {
                        email: previous.cloudflareEmailAddress,
                        zone: previous.cloudflareZoneId,
                        key: previous.cloudflareGlobalApiKey,
                      }
                    : null,
                  publicAddress,
                  originalAddress: publicAddressOf(
                    previous.cloudflarePublicAddressBackup ?? previous
                  ),
                  tunnelName: enabled
                    ? `moartube-${randomUUID()}`
                    : (previous.cloudflareTunnelName ?? ''),
                  storageIdentity: storageIdentity(previous.storageConfig),
                };
                // Journal first: even a subsequent settings write failure leaves admission blocked.
                writeCdnJournal(config.paths.nodeSettingsPath, state);
                progress.admitted = true;
                config.updateNodeSettings({ cloudflareAddressMigrationPending: true });
              } else {
                progress.admitted = true;
              }
              const transition = state.current;
              if (!transition) {
                throw new Error('CDN recovery state is missing.');
              }
              if (
                storageIdentity(config.nodeSettings.storageConfig) !== transition.storageIdentity
              ) {
                throw new Error(
                  'Storage changed during CDN recovery. Restore its saved configuration before retrying.'
                );
              }
              const advance = (stage: CdnTransition['stage']): void => {
                transition.stage = stage;
                writeCdnJournal(config.paths.nodeSettingsPath, state);
              };
              if (
                ['media', 'purge', 'tunnel'].includes(transition.stage) &&
                !this.cdnSettingsMatch(transition)
              ) {
                // The saved intent is authoritative after an interrupted settings commit.
                // Re-apply it and repeat media writes/purging rather than using a divergent origin.
                advance('settings');
              }
              if (transition.stage === 'provider') {
                const source = transition.source;
                const target = transition.target;
                if (target) {
                  let original = state.originals[target.zone];
                  if (!original) {
                    if (source?.zone === target.zone) {
                      throw new Error(
                        'Original Cloudflare zone settings are unavailable for this legacy configuration. Restore the original zone settings before retrying.'
                      );
                    }
                    original = {
                      credentials: target,
                      before: await this.cloudflareService.captureCdnSnapshot(target),
                      applied: this.cloudflareService.managedCdnSnapshot(),
                    };
                    state.originals[target.zone] = original;
                    writeCdnJournal(config.paths.nodeSettingsPath, state);
                  }
                  await this.cloudflareService.verifyCdnChange(
                    target,
                    original.before,
                    original.applied
                  );
                  await this.cloudflareService.setCdnConfiguration(
                    target.email,
                    target.zone,
                    target.key
                  );
                  await this.cloudflareService.addCdnDnsRecord(
                    target.email,
                    target.zone,
                    target.key,
                    config.nodeSettings.storageConfig,
                    transition.publicAddress.publicNodeAddress
                  );
                  await this.cloudflareService.verifyCdnSnapshot(target, original.applied);
                }
                if (source && source.zone !== target?.zone) {
                  const original = state.originals[source.zone];
                  if (!original) {
                    throw new Error(
                      'Original Cloudflare zone settings are unavailable. Repair the saved provider snapshot before retrying removal.'
                    );
                  }
                  await requestTunnelOperation('prepare_cdn_clear');
                  await this.cloudflareService.restoreCdnSnapshot(
                    source,
                    original.before,
                    original.applied
                  );
                }
                advance('settings');
              }
              if (transition.stage === 'settings') {
                config.updateNodeSettings({
                  ...transition.publicAddress,
                  cloudflareAddressMigrationPending: true,
                  cloudflarePublicAddressBackup: transition.originalAddress,
                  isCloudflareCdnEnabled: transition.targetEnabled,
                  cloudflareEmailAddress: transition.target?.email ?? '',
                  cloudflareZoneId: transition.target?.zone ?? '',
                  cloudflareGlobalApiKey: transition.target?.key ?? '',
                  cloudflareTunnelName: transition.tunnelName,
                });
                advance('media');
              }
              if (transition.stage === 'media') {
                await this.completeMediaMigration(config);
                advance('purge');
              }
              if (transition.stage === 'purge') {
                const zones = new Map<string, CdnCredentials>();
                for (const zone of [transition.source, transition.target]) {
                  if (zone) {
                    zones.set(zone.zone, zone);
                  }
                }
                for (const zone of zones.values()) {
                  await this.cloudflareService.purgeEntireCacheWithCredentials(
                    zone.email,
                    zone.zone,
                    zone.key
                  );
                }
                await this.cloudflareService.retryPendingPurges();
                advance('tunnel');
              }
            },
            undefined,
            true,
            false
          );
          return await this.finishCloudflareChange();
        } catch (error) {
          this.logger.error('CDN transition remains incomplete', error);
          if (progress.admitted) {
            return this.cdnReply(true);
          }
          return reject(
            error instanceof Error ? error.message : 'CDN transition could not start.',
            400
          );
        }
      });
    } catch (error) {
      response = reject(
        error instanceof Error ? error.message : 'Another distribution operation is in progress.',
        409
      );
    }
    return await reply.status(response.status).send(response.data);
  }

  private cdnSettingsMatch(transition: CdnTransition): boolean {
    const expected = {
      ...transition.publicAddress,
      isCloudflareCdnEnabled: transition.targetEnabled,
      cloudflareEmailAddress: transition.target?.email ?? '',
      cloudflareZoneId: transition.target?.zone ?? '',
      cloudflareGlobalApiKey: transition.target?.key ?? '',
      ...(transition.targetEnabled ? { cloudflareTunnelName: transition.tunnelName } : {}),
    };
    const settings = getConfig().nodeSettings;
    return Object.entries(expected).every(
      ([key, value]) => settings[key as keyof typeof settings] === value
    );
  }

  private cdnReply(isError: boolean): CdnResponse {
    const config = getConfig();
    const status = cdnStatus(config.paths.nodeSettingsPath);
    return {
      status: isError ? 502 : 200,
      data: {
        isError,
        settingsSaved: true,
        cloudflareAddressMigrationPending:
          hasPendingCdn(config.paths.nodeSettingsPath) ||
          config.nodeSettings.cloudflareAddressMigrationPending,
        cdnTransition: status,
        ...publicAddressOf(config.nodeSettings),
        isCloudflareCdnEnabled: config.nodeSettings.isCloudflareCdnEnabled,
        isCloudflareTunnelEnabled: config.nodeSettings.isCloudflareTunnelEnabled,
        cloudflareTunnelName: config.nodeSettings.cloudflareTunnelName ?? '',
        ...(isError
          ? {
              message:
                'CDN transition is incomplete. Retry its saved direction from Settings. If recovery continues to fail, check the Node log for the required repair.',
            }
          : {}),
      },
    };
  }

  private async finishCloudflareChange(): Promise<CdnResponse> {
    const config = getConfig();
    const state = readCdnJournal(config.paths.nodeSettingsPath);
    const transition = state.current;
    if (transition?.stage !== 'tunnel') {
      return this.cdnReply(true);
    }
    try {
      const tunnel = await requestTunnelOperation('reconcile');
      config.reloadNodeSettings(true);
      const preference = config.nodeSettings.isCloudflareTunnelEnabled;
      const ready = !preference
        ? tunnel.status === 'stopped'
        : tunnel.status === 'running' &&
          tunnel.mode === (transition.targetEnabled ? 'named' : 'quick') &&
          (!transition.targetEnabled || tunnel.name === transition.tunnelName);
      if (!ready) {
        return this.cdnReply(true);
      }
      await withSettingsChange(config.paths.nodeSettingsPath, () => {
        config.reloadNodeSettings(true);
        if (
          config.nodeSettings.isCloudflareTunnelEnabled !== preference ||
          !this.cdnSettingsMatch(transition) ||
          readCdnJournal(config.paths.nodeSettingsPath).current?.id !== transition.id
        ) {
          throw new Error('CDN transition was superseded.');
        }
        config.updateNodeSettings({
          cloudflareAddressMigrationPending: false,
          ...(!transition.targetEnabled ? { cloudflarePublicAddressBackup: null } : {}),
        });
        state.originals = Object.fromEntries(
          Object.entries(state.originals).filter(
            ([zone]) => transition.targetEnabled && zone === transition.target?.zone
          )
        );
        transition.stage = 'complete';
        transition.source = null;
        transition.target = null;
        writeCdnJournal(config.paths.nodeSettingsPath, state);
        return Promise.resolve();
      });
      return this.cdnReply(false);
    } catch (error) {
      this.logger.error('CDN tunnel reconciliation remains incomplete', error);
      return this.cdnReply(true);
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
      await this.cloudflareService.purgeHomePage();

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
      await this.cloudflareService.purgeHomePage();

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
      await this.cloudflareService.purgeHomePage();

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
      await this.cloudflareService.purgeHomePage();

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
      await this.cloudflareService.purgeHomePage();

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
      await this.cloudflareService.purgeHomePage();

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
      await this.cloudflareService.purgeHomePage();

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
      await this.cloudflareService.purgeHomePage();
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
