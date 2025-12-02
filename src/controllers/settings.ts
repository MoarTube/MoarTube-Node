/**
 * Settings Controller
 *
 * Handles node settings and configuration endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { BaseController } from './base';
import type { SettingsService } from '../services/settings';
import type { VideosRepository } from '../database/repositories/videos';
import type { CommentsRepository } from '../database/repositories/comments';
import type { ReportsVideosRepository } from '../database/repositories/reports-videos';
import type { ReportsCommentsRepository } from '../database/repositories/reports-comments';
import type { ReportsArchiveVideosRepository } from '../database/repositories/reports-archive-videos';
import type { ReportsArchiveCommentsRepository } from '../database/repositories/reports-archive-comments';
import type { LiveChatMessageRepository } from '../database/repositories/live-chat-messages';
import type { MonetizationRepository } from '../database/repositories/monetization';
import type { LinksRepository } from '../database/repositories/links';
import type { CloudflareService } from '../services/cloudflare';
import type { WebSocketService } from '../services/websocket';
import { getConfig } from '../config';
import {
  isNodeNameValid,
  isNodeAboutValid,
  isNodeIdValid,
  isUsernameValid,
  isPasswordValid,
  isPublicNodeProtocolValid,
  isPublicNodeAddressValid,
  isPortValid,
  isBooleanValid,
  isDatabaseConfigValid,
  isStorageConfigValid,
  isCloudflareCredentialsValid,
} from '../utils';
import { logDebugMessageToConsole } from '../utils/logger';

/**
 * Request body interfaces
 */
export interface PersonalizeNodeNameBody {
  nodeName: string;
}

export interface PersonalizeNodeAboutBody {
  nodeAbout: string;
}

export interface PersonalizeNodeIdBody {
  nodeId: string;
}

export interface AccountBody {
  username: string;
  password: string;
}

export interface NetworkInternalBody {
  listeningNodePort: string;
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
  isCommentsEnabled?: boolean;
  isLikesEnabled?: boolean;
  isDislikesEnabled?: boolean;
  isReportsEnabled?: boolean;
  isLiveChatEnabled?: boolean;
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
        endpoint?: string;
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
export interface SecureBody {
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
  constructor(
    private readonly settingsService: SettingsService,
    private readonly videoRepository?: VideosRepository,
    private readonly cloudflareService?: CloudflareService,
    private readonly websocketService?: WebSocketService,
    private readonly commentsRepository?: CommentsRepository,
    private readonly reportsVideosRepository?: ReportsVideosRepository,
    private readonly reportsCommentsRepository?: ReportsCommentsRepository,
    private readonly reportsArchiveVideosRepository?: ReportsArchiveVideosRepository,
    private readonly reportsArchiveCommentsRepository?: ReportsArchiveCommentsRepository,
    private readonly liveChatMessageRepository?: LiveChatMessageRepository,
    private readonly monetizationRepository?: MonetizationRepository,
    private readonly linksRepository?: LinksRepository
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
      const nodeSettings = this.settingsService.getNodeSettings();
      const version = this.settingsService.getVersion();

      this.sendSuccess(reply, {
        nodeSettings: {
          ...nodeSettings,
          version,
        },
      });
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /settings/avatar
   *
   * Get node avatar image
   */
  getAvatar = (_request: FastifyRequest, reply: FastifyReply): void => {
    try {
      const fileStream = this.settingsService.getAvatar();

      if (fileStream !== null) {
        void reply.header('Content-Type', 'image/png');
        void reply.send(fileStream);
      } else {
        void reply.status(404).send('avatar not found');
      }
    } catch (error) {
      void reply.status(500).send('node avatar retrieval error');
    }
  };

  /**
   * GET /settings/banner
   *
   * Get node banner image
   */
  getBanner = (_request: FastifyRequest, reply: FastifyReply): void => {
    try {
      const fileStream = this.settingsService.getBanner();

      if (fileStream !== null) {
        void reply.header('Content-Type', 'image/png');
        void reply.send(fileStream);
      } else {
        void reply.status(404).send('banner not found');
      }
    } catch (error) {
      void reply.status(500).send('node banner retrieval error');
    }
  };

  /**
   * POST /settings/avatar
   *
   * Upload node avatar and icon images
   * Expects multipart form with 'iconFile' and 'avatarFile' fields
   */
  uploadAvatar = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const config = getConfig();
      const imagesDir = config.paths.imagesDirectoryPath;

      // Ensure images directory exists
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      // Parse multipart data
      const parts = request.parts();
      let iconFile: MultipartFile | undefined;
      let avatarFile: MultipartFile | undefined;

      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname === 'iconFile') {
            iconFile = part;
            // Save icon file
            const iconPath = path.join(imagesDir, 'icon.png');
            await pipeline(part.file, fs.createWriteStream(iconPath));
          } else if (part.fieldname === 'avatarFile') {
            avatarFile = part;
            // Save avatar file
            const avatarPath = path.join(imagesDir, 'avatar.png');
            await pipeline(part.file, fs.createWriteStream(avatarPath));
          }
        }
      }

      if (iconFile === undefined || avatarFile === undefined) {
        this.sendError(reply, 'both iconFile and avatarFile are required');
        return;
      }

      // Purge Cloudflare cache if enabled
      if (this.cloudflareService !== undefined) {
        try {
          await this.cloudflareService.purgeNodeImages();
        } catch (purgeError) {
          logDebugMessageToConsole(
            'Failed to purge node images from Cloudflare',
            purgeError as Error,
            new Error().stack
          );
        }
      }

      // Mark all indexed videos as outdated
      if (this.videoRepository !== undefined) {
        await this.videoRepository.markAllIndexedAsOutdated();
      }

      this.sendOk(reply);
    } catch (error) {
      logDebugMessageToConsole('Avatar upload error', error as Error, new Error().stack);
      this.sendError(reply, 'error uploading avatar');
    }
  };

  /**
   * POST /settings/banner
   *
   * Upload node banner image
   * Expects multipart form with 'bannerFile' field
   */
  uploadBanner = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const config = getConfig();
      const imagesDir = config.paths.imagesDirectoryPath;

      // Ensure images directory exists
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      // Parse multipart data
      const parts = request.parts();
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
        this.sendError(reply, 'bannerFile is required');
        return;
      }

      // Purge Cloudflare cache if enabled
      if (this.cloudflareService !== undefined) {
        try {
          await this.cloudflareService.purgeNodeImages();
        } catch (purgeError) {
          logDebugMessageToConsole(
            'Failed to purge node images from Cloudflare',
            purgeError as Error,
            new Error().stack
          );
        }
      }

      this.sendOk(reply);
    } catch (error) {
      logDebugMessageToConsole('Banner upload error', error as Error, new Error().stack);
      this.sendError(reply, 'error uploading banner');
    }
  };

  /**
   * POST /settings/secure
   *
   * Configure secure mode (HTTPS) with SSL certificates
   * Expects multipart form with 'keyFile', 'certFile', and optionally 'caFiles'
   * Or a JSON body with isSecure: false to disable HTTPS
   */
  configureSecure = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const config = getConfig();
      const certsDir = config.paths.certificatesDirectoryPath;

      // Check content type to determine if this is multipart or JSON
      const contentType = request.headers['content-type'] ?? '';

      if (contentType.includes('multipart/form-data')) {
        // HTTPS mode - expect certificate files
        // Ensure certificates directory exists
        if (!fs.existsSync(certsDir)) {
          fs.mkdirSync(certsDir, { recursive: true });
        }

        // Parse multipart data
        const parts = request.parts();
        let keyFile: MultipartFile | undefined;
        let certFile: MultipartFile | undefined;
        const caFiles: MultipartFile[] = [];

        for await (const part of parts) {
          if (part.type === 'file') {
            if (part.fieldname === 'keyFile') {
              keyFile = part;
              const keyPath = path.join(certsDir, 'private_key.pem');
              await pipeline(part.file, fs.createWriteStream(keyPath));
            } else if (part.fieldname === 'certFile') {
              certFile = part;
              const certPath = path.join(certsDir, 'certificate.pem');
              await pipeline(part.file, fs.createWriteStream(certPath));
            } else if (part.fieldname === 'caFiles') {
              caFiles.push(part);
              // Save CA files with index
              const caPath = path.join(certsDir, `ca_${caFiles.length}.pem`);
              await pipeline(part.file, fs.createWriteStream(caPath));
            }
          }
        }

        if (keyFile === undefined) {
          this.sendError(reply, 'private key file is missing');
          return;
        }

        if (certFile === undefined) {
          this.sendError(reply, 'cert file is missing');
          return;
        }

        logDebugMessageToConsole('switching node to HTTPS mode', null, null);

        config.updateNodeSettings({ isSecure: true });

        this.sendOk(reply);
      } else {
        // JSON body - disable HTTPS
        const body = request.body as SecureBody;

        if (body.isSecure === false) {
          logDebugMessageToConsole('switching node to HTTP mode', null, null);

          config.updateNodeSettings({ isSecure: false });

          this.sendOk(reply);
        } else {
          this.sendError(reply, 'invalid parameters - use multipart for enabling HTTPS');
        }
      }
    } catch (error) {
      logDebugMessageToConsole(
        'Secure mode configuration error',
        error as Error,
        new Error().stack
      );
      this.sendError(reply, 'error configuring secure mode');
    }
  };

  /**
   * POST /settings/personalize/nodeName
   *
   * Update node name
   */
  personalizeNodeName = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { nodeName } = request.body as PersonalizeNodeNameBody;

      if (!isNodeNameValid(nodeName)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      // Check if there are indexed videos to determine if indexer update is needed
      const hasIndexedVideos = this.videoRepository
        ? (await this.videoRepository.findIndexed()).length > 0
        : false;

      await this.settingsService.updateNodeName(nodeName, hasIndexedVideos);

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/personalize/nodeAbout
   *
   * Update node about
   */
  personalizeNodeAbout = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { nodeAbout } = request.body as PersonalizeNodeAboutBody;

      if (!isNodeAboutValid(nodeAbout)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      // Check if there are indexed videos to determine if indexer update is needed
      const hasIndexedVideos = this.videoRepository
        ? (await this.videoRepository.findIndexed()).length > 0
        : false;

      await this.settingsService.updateNodeAbout(nodeAbout, hasIndexedVideos);

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/personalize/nodeId
   *
   * Update node ID
   */
  personalizeNodeId = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { nodeId } = request.body as PersonalizeNodeIdBody;

      if (!isNodeIdValid(nodeId)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      // Check if there are indexed videos to determine if indexer update is needed
      const hasIndexedVideos = this.videoRepository
        ? (await this.videoRepository.findIndexed()).length > 0
        : false;

      await this.settingsService.updateNodeId(nodeId, hasIndexedVideos);

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/account
   *
   * Update account credentials
   */
  updateAccount = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { username, password } = request.body as AccountBody;

      if (!isUsernameValid(username) || !isPasswordValid(password)) {
        this.sendError(reply, 'invalid username and/or password');
        return;
      }

      await this.settingsService.updateCredentials(username, password);

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/network/internal
   *
   * Update internal network settings
   */
  networkInternal = (request: FastifyRequest, reply: FastifyReply): void => {
    try {
      if (this.settingsService.isDockerEnvironment()) {
        this.sendError(
          reply,
          'This node cannot change listening ports because it is running inside of a docker container.'
        );
        return;
      }

      const { listeningNodePort } = request.body as NetworkInternalBody;

      if (!isPortValid(listeningNodePort)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const config = getConfig();
      config.updateNodeSettings({ nodeListeningPort: parseInt(listeningNodePort, 10) });

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/network/external
   *
   * Update external network settings
   * Also rewrites HLS manifest URLs when storage mode is filesystem
   */
  networkExternal = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { publicNodeProtocol, publicNodeAddress, publicNodePort } =
        request.body as NetworkExternalBody;

      if (
        !isPublicNodeProtocolValid(publicNodeProtocol) ||
        !isPublicNodeAddressValid(publicNodeAddress) ||
        !isPortValid(publicNodePort)
      ) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      // Check if there are indexed videos (required for indexer update)
      let hasIndexedVideos = false;
      if (this.videoRepository !== undefined) {
        const indexedVideos = await this.videoRepository.findIndexed();
        hasIndexedVideos = indexedVideos.length > 0;
      }

      // Update network settings (this also updates indexer if there are indexed videos)
      await this.settingsService.updateNetworkSettings(
        publicNodeProtocol,
        publicNodeAddress,
        publicNodePort,
        hasIndexedVideos
      );

      // Rewrite HLS manifest URLs if using filesystem storage
      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      if (
        nodeSettings.storageConfig?.storageMode === 'filesystem' &&
        this.videoRepository !== undefined
      ) {
        const externalVideosBaseUrl = config.getExternalVideosBaseUrl();
        const videosDirectoryPath = config.paths.videosDirectoryPath;

        // Get all videos with their outputs
        const videos = await this.videoRepository.findAll({});

        for (const video of videos) {
          const videoId = video.videoId;
          let outputs: { m3u8?: string[] } = {};

          // Parse outputs JSON
          if (video.outputs !== undefined && video.outputs !== null && video.outputs !== '') {
            try {
              outputs = JSON.parse(String(video.outputs)) as { m3u8?: string[] };
            } catch {
              continue; // Skip if outputs is invalid JSON
            }
          }

          // Rewrite manifests if m3u8 outputs exist
          if (outputs.m3u8 !== undefined && outputs.m3u8.length > 0) {
            // Update master manifest
            const masterManifestPath = path.join(
              videosDirectoryPath,
              videoId,
              'adaptive',
              'm3u8',
              'manifest-master.m3u8'
            );
            if (fs.existsSync(masterManifestPath)) {
              this.rewriteManifestUrls(masterManifestPath, externalVideosBaseUrl);
            }

            // Update resolution-specific manifests
            for (const resolution of outputs.m3u8) {
              const manifestPath = path.join(
                videosDirectoryPath,
                videoId,
                'adaptive',
                'm3u8',
                `manifest-${resolution}.m3u8`
              );
              if (fs.existsSync(manifestPath)) {
                this.rewriteManifestUrls(manifestPath, externalVideosBaseUrl);
              }
            }
          }
        }
      }

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * Rewrites URLs in an HLS manifest file to use the new external base URL
   */
  private rewriteManifestUrls(manifestPath: string, externalVideosBaseUrl: string): void {
    try {
      const oldManifest = fs.readFileSync(manifestPath, 'utf-8');
      // Replace protocol://anything/external/ with newBaseUrl/external/
      const newManifest = oldManifest.replace(
        /(https?:\/\/).*?(\/external\/)/g,
        externalVideosBaseUrl + '$2'
      );
      fs.writeFileSync(manifestPath, newManifest, 'utf-8');
    } catch (error) {
      logDebugMessageToConsole(
        `Failed to rewrite manifest: ${manifestPath}`,
        error as Error,
        new Error().stack
      );
    }
  }

  /**
   * POST /settings/cloudflare/configure
   *
   * Configure Cloudflare CDN
   */
  cloudflareConfigure = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey } =
        request.body as CloudflareConfigureBody;

      // Validate Cloudflare credentials
      const isValid = await isCloudflareCredentialsValid(
        cloudflareEmailAddress,
        cloudflareZoneId,
        cloudflareGlobalApiKey
      );

      if (!isValid) {
        this.sendError(reply, 'could not validate the Cloudflare credentials');
        return;
      }

      // Get current storage config for DNS record setup
      const config = getConfig();
      const storageConfig = config.nodeSettings.storageConfig;

      if (this.cloudflareService !== undefined) {
        // Reset any existing CDN configuration
        await this.cloudflareService.resetCdn(
          cloudflareEmailAddress,
          cloudflareZoneId,
          cloudflareGlobalApiKey
        );

        // Set new CDN configuration
        await this.cloudflareService.setCdnConfiguration(
          cloudflareEmailAddress,
          cloudflareZoneId,
          cloudflareGlobalApiKey
        );

        // Add CDN DNS record based on storage config
        if (storageConfig !== undefined) {
          await this.cloudflareService.addCdnDnsRecord(
            cloudflareEmailAddress,
            cloudflareZoneId,
            cloudflareGlobalApiKey,
            storageConfig
          );
        }

        // Purge entire cache
        await this.cloudflareService.purgeEntireCacheWithCredentials(
          cloudflareEmailAddress,
          cloudflareZoneId,
          cloudflareGlobalApiKey
        );
      }

      // Update Cloudflare configuration in settings
      this.settingsService.updateCloudflareConfig(
        cloudflareEmailAddress,
        cloudflareGlobalApiKey,
        '',
        cloudflareZoneId,
        ''
      );

      this.sendOk(reply);
    } catch (error) {
      logDebugMessageToConsole('Cloudflare configure error', error as Error, new Error().stack);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/cloudflare/clear
   *
   * Clear Cloudflare configuration
   */
  cloudflareClear = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      // Only reset if Cloudflare CDN is currently enabled
      if (nodeSettings.isCloudflareCdnEnabled && this.cloudflareService !== undefined) {
        const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
        const cloudflareZoneId = nodeSettings.cloudflareZoneId;
        const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

        // Reset CDN configuration
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
      }

      // Clear configuration in settings
      this.settingsService.clearCloudflareConfig();

      this.sendOk(reply);
    } catch (error) {
      logDebugMessageToConsole('Cloudflare clear error', error as Error, new Error().stack);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

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
      if (this.websocketService !== undefined) {
        this.websocketService.broadcastToChat('all', {
          eventName: 'information',
          data: {
            cloudflareTurnstileSiteKey,
          },
        });
      }

      // Purge all watch pages from Cloudflare cache
      if (this.cloudflareService !== undefined) {
        await this.cloudflareService.purgeAllWatchPages();
      }

      this.sendOk(reply);
    } catch (error) {
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
      if (this.websocketService !== undefined) {
        this.websocketService.broadcastToChat('all', {
          eventName: 'information',
          data: {
            cloudflareTurnstileSiteKey: '',
          },
        });
      }

      // Purge all watch pages from Cloudflare cache
      if (this.cloudflareService !== undefined) {
        await this.cloudflareService.purgeAllWatchPages();
      }

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/comments/toggle
   *
   * Toggle comments enabled
   */
  commentsToggle = (request: FastifyRequest, reply: FastifyReply): void => {
    try {
      const { isCommentsEnabled } = request.body as ToggleBooleanBody;

      if (!isBooleanValid(isCommentsEnabled)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const config = getConfig();
      config.updateNodeSettings({ isCommentsEnabled });

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/likes/toggle
   *
   * Toggle likes enabled
   */
  likesToggle = (request: FastifyRequest, reply: FastifyReply): void => {
    try {
      const { isLikesEnabled } = request.body as ToggleBooleanBody;

      if (!isBooleanValid(isLikesEnabled)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const config = getConfig();
      config.updateNodeSettings({ isLikesEnabled });

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/dislikes/toggle
   *
   * Toggle dislikes enabled
   */
  dislikesToggle = (request: FastifyRequest, reply: FastifyReply): void => {
    try {
      const { isDislikesEnabled } = request.body as ToggleBooleanBody;

      if (!isBooleanValid(isDislikesEnabled)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const config = getConfig();
      config.updateNodeSettings({ isDislikesEnabled });

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/reports/toggle
   *
   * Toggle reports enabled
   */
  reportsToggle = (request: FastifyRequest, reply: FastifyReply): void => {
    try {
      const { isReportsEnabled } = request.body as ToggleBooleanBody;

      if (!isBooleanValid(isReportsEnabled)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const config = getConfig();
      config.updateNodeSettings({ isReportsEnabled });

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/liveChat/toggle
   *
   * Toggle live chat enabled
   */
  liveChatToggle = (request: FastifyRequest, reply: FastifyReply): void => {
    try {
      const { isLiveChatEnabled } = request.body as ToggleBooleanBody;

      if (!isBooleanValid(isLiveChatEnabled)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const config = getConfig();
      config.updateNodeSettings({ isLiveChatEnabled });

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/databaseConfig/toggle
   *
   * Update database configuration
   * Tests connection using underlying drivers before saving config
   */
  databaseConfigToggle = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { databaseConfig } = request.body as DatabaseConfigBody;

      if (!isDatabaseConfigValid(databaseConfig)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const databaseDialect = databaseConfig.databaseDialect;

      // Test connection before saving config
      if (databaseDialect === 'sqlite') {
        // Test SQLite connection using better-sqlite3
        const config = getConfig();
        const databaseFilePath = config.paths.databaseFilePath;

        const Database = (await import('better-sqlite3')).default;
        const db = new Database(databaseFilePath, { readonly: true, fileMustExist: false });

        try {
          // Test connection with a simple query
          db.prepare('SELECT 1').get();
        } finally {
          db.close();
        }
      } else if (databaseDialect === 'postgres') {
        // Test PostgreSQL connection using postgres driver
        const postgresConfig = databaseConfig.postgresConfig;

        if (postgresConfig === undefined) {
          this.sendError(reply, 'postgres configuration is required');
          return;
        }

        const postgres = (await import('postgres')).default;
        const sql = postgres({
          host: postgresConfig.host,
          port: postgresConfig.port,
          database: postgresConfig.databaseName,
          username: postgresConfig.username,
          password: postgresConfig.password,
          max: 1,
          connect_timeout: 10,
        });

        try {
          // Test connection with a simple query
          await sql`SELECT 1`;
        } finally {
          await sql.end();
        }
      }

      // Connection test passed - update config
      const input: {
        dialect: 'sqlite' | 'postgres';
        postgresHost?: string;
        postgresPort?: number;
        postgresDatabase?: string;
        postgresUser?: string;
        postgresPassword?: string;
      } = {
        dialect: databaseDialect,
      };

      if (databaseConfig.postgresConfig !== undefined) {
        input.postgresHost = databaseConfig.postgresConfig.host;
        input.postgresPort = databaseConfig.postgresConfig.port;
        input.postgresDatabase = databaseConfig.postgresConfig.databaseName;
        input.postgresUser = databaseConfig.postgresConfig.username;
        input.postgresPassword = databaseConfig.postgresConfig.password;
      }

      this.settingsService.updateDatabaseConfig(input);

      // Signal to restart database with new configuration
      if (process.send !== undefined) {
        process.send({ cmd: 'restart_database', databaseDialect: databaseDialect });
      }

      this.sendOk(reply);
    } catch (error) {
      logDebugMessageToConsole(
        'Database connection test failed',
        error as Error,
        new Error().stack
      );
      this.sendError(reply, 'could not connect to database with provided configuration');
    }
  };

  /**
   * POST /settings/storageConfig/toggle
   *
   * Update storage configuration
   */
  storageConfigToggle = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { storageConfig } = request.body as StorageConfigBody;

      // Validate storage configuration
      if (!isStorageConfigValid(storageConfig)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      // Update Cloudflare CDN DNS record if CDN is enabled
      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      if (nodeSettings.isCloudflareCdnEnabled && this.cloudflareService !== undefined) {
        const cloudflareEmailAddress = nodeSettings.cloudflareEmailAddress;
        const cloudflareZoneId = nodeSettings.cloudflareZoneId;
        const cloudflareGlobalApiKey = nodeSettings.cloudflareGlobalApiKey;

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
      }

      const input: {
        storageMode: 'filesystem' | 's3provider';
        s3BucketName?: string;
        s3Region?: string;
        s3Endpoint?: string;
        s3AccessKeyId?: string;
        s3SecretAccessKey?: string;
      } = {
        storageMode: storageConfig.storageMode,
      };

      if (storageConfig.s3Config !== undefined) {
        input.s3BucketName = storageConfig.s3Config.bucketName;
        input.s3Region = storageConfig.s3Config.s3ProviderClientConfig.region;
        if (storageConfig.s3Config.s3ProviderClientConfig.endpoint !== undefined) {
          input.s3Endpoint = storageConfig.s3Config.s3ProviderClientConfig.endpoint;
        }
        input.s3AccessKeyId = storageConfig.s3Config.s3ProviderClientConfig.credentials.accessKeyId;
        input.s3SecretAccessKey =
          storageConfig.s3Config.s3ProviderClientConfig.credentials.secretAccessKey;
      }

      this.settingsService.updateStorageConfig(input);

      this.sendOk(reply);
    } catch (error) {
      logDebugMessageToConsole('Storage config toggle error', error as Error, new Error().stack);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /settings/export/database
   *
   * Export all database tables to JSON format
   * Removes auto-generated 'id' columns and normalizes boolean values
   * for cross-database compatibility (SQLite <-> PostgreSQL)
   */
  exportDatabase = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      // Check if all required repositories are available
      if (
        this.videoRepository === undefined ||
        this.commentsRepository === undefined ||
        this.reportsVideosRepository === undefined ||
        this.reportsCommentsRepository === undefined ||
        this.reportsArchiveVideosRepository === undefined ||
        this.reportsArchiveCommentsRepository === undefined ||
        this.liveChatMessageRepository === undefined ||
        this.monetizationRepository === undefined ||
        this.linksRepository === undefined
      ) {
        this.sendError(reply, 'database export requires all repositories to be configured');
        return;
      }

      // Fetch all data from all tables (no limit = return all)
      const videos = await this.videoRepository.findAll();
      const comments = await this.commentsRepository.findAll();
      const videoReports = await this.reportsVideosRepository.findAll();
      const commentReports = await this.reportsCommentsRepository.findAll();
      const videoReportsArchives = await this.reportsArchiveVideosRepository.findAll();
      const commentReportsArchives = await this.reportsArchiveCommentsRepository.findAll();
      const liveChatMessages = await this.liveChatMessageRepository.findAll();
      const cryptoWalletAddresses = await this.monetizationRepository.findAll();
      const links = await this.linksRepository.findAll();

      // Build database export structure
      const database = [
        { rows: videos as Record<string, unknown>[], tableName: 'videos' },
        { rows: comments as Record<string, unknown>[], tableName: 'comments' },
        { rows: videoReports as Record<string, unknown>[], tableName: 'videoreports' },
        { rows: commentReports as Record<string, unknown>[], tableName: 'commentreports' },
        {
          rows: videoReportsArchives as Record<string, unknown>[],
          tableName: 'videoreportsarchives',
        },
        {
          rows: commentReportsArchives as Record<string, unknown>[],
          tableName: 'commentreportsarchives',
        },
        { rows: liveChatMessages as Record<string, unknown>[], tableName: 'livechatmessages' },
        {
          rows: cryptoWalletAddresses as Record<string, unknown>[],
          tableName: 'cryptowalletaddresses',
        },
        { rows: links as Record<string, unknown>[], tableName: 'links' },
      ];

      /*
       * 1) Delete all rows with an "id" column as it was generated by the database engine upon insertion.
       *    Let the database engine generate a new "id" column during an import operation.
       *    Note: The "id" column isn't used for anything.
       *    Note: SQLite re-uses "id" numbers that were previously used by removed rows - Postgres does not.
       *
       * 2) Convert all 1/0 boolean to true/false boolean. The latter is agnostic for both SQLite and Postgres,
       *    otherwise a cast exception will throw when importing an SQLite database export into a Postgres database.
       */
      for (const table of database) {
        table.rows.forEach((row) => {
          delete row.id;

          for (const column in row) {
            if (column.startsWith('is') && (row[column] === 0 || row[column] === 1)) {
              row[column] = Boolean(row[column]);
            }
          }
        });
      }

      this.sendSuccess(reply, { database });
    } catch (error) {
      logDebugMessageToConsole('Database export error', error as Error, new Error().stack);
      this.sendError(reply, 'error exporting database');
    }
  };

  /**
   * POST /settings/import/database
   *
   * Import database from JSON file
   * Clears all existing data and imports from the uploaded file
   * Expects multipart form with 'databaseFile' field containing JSON
   */
  importDatabase = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      // Check if all required repositories are available
      if (
        this.videoRepository === undefined ||
        this.commentsRepository === undefined ||
        this.reportsVideosRepository === undefined ||
        this.reportsCommentsRepository === undefined ||
        this.reportsArchiveVideosRepository === undefined ||
        this.reportsArchiveCommentsRepository === undefined ||
        this.liveChatMessageRepository === undefined ||
        this.monetizationRepository === undefined ||
        this.linksRepository === undefined
      ) {
        this.sendError(reply, 'database import requires all repositories to be configured');
        return;
      }

      // Parse multipart data
      const parts = request.parts();
      let databaseFileContent: string | undefined;

      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'databaseFile') {
          // Collect chunks and convert to buffer
          const buffer = await part.toBuffer();
          databaseFileContent = buffer.toString('utf-8');
        }
      }

      if (databaseFileContent === undefined) {
        this.sendError(reply, 'database file is missing');
        return;
      }

      // Parse the JSON database
      interface DatabaseTable {
        rows: Record<string, unknown>[];
        tableName: string;
      }
      const database: DatabaseTable[] = JSON.parse(databaseFileContent) as DatabaseTable[];

      // Helper to convert snake_case to camelCase
      // This allows importing database exports from the original JS version
      const snakeToCamel = (str: string): string =>
        str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

      // Transform all rows: convert snake_case keys to camelCase for Drizzle compatibility
      for (const table of database) {
        table.rows = table.rows.map((row) => {
          const transformedRow: Record<string, unknown> = {};
          for (const key of Object.keys(row)) {
            const camelKey = snakeToCamel(key);
            transformedRow[camelKey] = row[key];
          }
          return transformedRow;
        });
      }

      // Clear all tables first (order matters due to potential foreign keys)
      await this.commentsRepository.deleteAll();
      await this.liveChatMessageRepository.deleteAll();
      await this.reportsCommentsRepository.deleteAll();
      await this.reportsVideosRepository.deleteAll();
      await this.reportsArchiveCommentsRepository.deleteAll();
      await this.reportsArchiveVideosRepository.deleteAll();
      await this.monetizationRepository.deleteAll();
      await this.linksRepository.deleteAll();
      await this.videoRepository.deleteAll();

      // Import each table
      for (const table of database) {
        const { rows, tableName } = table;

        if (rows.length === 0) {
          continue;
        }

        // Map table names to repository createMany calls
        switch (tableName) {
          case 'videos':
            await this.videoRepository.createMany(
              rows as Parameters<typeof this.videoRepository.createMany>[0]
            );
            break;
          case 'comments':
            await this.commentsRepository.createMany(
              rows as Parameters<typeof this.commentsRepository.createMany>[0]
            );
            break;
          case 'videoreports':
            await this.reportsVideosRepository.createMany(
              rows as Parameters<typeof this.reportsVideosRepository.createMany>[0]
            );
            break;
          case 'commentreports':
            await this.reportsCommentsRepository.createMany(
              rows as Parameters<typeof this.reportsCommentsRepository.createMany>[0]
            );
            break;
          case 'videoreportsarchives':
            await this.reportsArchiveVideosRepository.createMany(
              rows as Parameters<typeof this.reportsArchiveVideosRepository.createMany>[0]
            );
            break;
          case 'commentreportsarchives':
            await this.reportsArchiveCommentsRepository.createMany(
              rows as Parameters<typeof this.reportsArchiveCommentsRepository.createMany>[0]
            );
            break;
          case 'livechatmessages':
            await this.liveChatMessageRepository.createMany(
              rows as Parameters<typeof this.liveChatMessageRepository.createMany>[0]
            );
            break;
          case 'cryptowalletaddresses':
            await this.monetizationRepository.createMany(
              rows as Parameters<typeof this.monetizationRepository.createMany>[0]
            );
            break;
          case 'links':
            await this.linksRepository.createMany(
              rows as Parameters<typeof this.linksRepository.createMany>[0]
            );
            break;
          default:
            logDebugMessageToConsole(`Unknown table name during import: ${tableName}`, null, null);
        }
      }

      logDebugMessageToConsole('database imported successfully', null, null);

      this.sendOk(reply);
    } catch (error) {
      logDebugMessageToConsole('Database import error', error as Error, new Error().stack);
      this.sendError(reply, 'error importing database');
    }
  };
}
