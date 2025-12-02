/**
 * Settings Controller
 *
 * Handles node settings and configuration endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base';
import type { SettingsService } from '../services/settings';
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
} from '../utils';

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
 * SettingsController class
 *
 * Handles:
 * - Node settings retrieval and updates
 * - Avatar and banner management
 * - Cloudflare configuration
 * - Network configuration
 * - Feature toggles
 */
export class SettingsController extends BaseController {
  constructor(private readonly settingsService: SettingsService) {
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

      await this.settingsService.updateNodeName(nodeName);

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

      await this.settingsService.updateNodeAbout(nodeAbout);

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

      await this.settingsService.updateNodeId(nodeId);

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

      await this.settingsService.updateNetworkSettings(
        publicNodeProtocol,
        publicNodeAddress,
        publicNodePort
      );

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/cloudflare/configure
   *
   * Configure Cloudflare CDN
   */
  cloudflareConfigure = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { cloudflareEmailAddress, cloudflareZoneId, cloudflareGlobalApiKey } =
        request.body as CloudflareConfigureBody;

      // Update Cloudflare configuration
      // Note: Full credential validation would require additional Cloudflare API calls
      this.settingsService.updateCloudflareConfig(
        cloudflareEmailAddress,
        cloudflareGlobalApiKey,
        '',
        cloudflareZoneId,
        ''
      );

      this.sendOk(reply);
    } catch (error) {
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
      this.settingsService.clearCloudflareConfig();

      this.sendOk(reply);
    } catch (error) {
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
   */
  databaseConfigToggle = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { databaseConfig } = request.body as DatabaseConfigBody;

      const input: {
        dialect: 'sqlite' | 'postgres';
        postgresHost?: string;
        postgresPort?: number;
        postgresDatabase?: string;
        postgresUser?: string;
        postgresPassword?: string;
      } = {
        dialect: databaseConfig.databaseDialect,
      };

      if (databaseConfig.postgresConfig !== undefined) {
        input.postgresHost = databaseConfig.postgresConfig.host;
        input.postgresPort = databaseConfig.postgresConfig.port;
        input.postgresDatabase = databaseConfig.postgresConfig.databaseName;
        input.postgresUser = databaseConfig.postgresConfig.username;
        input.postgresPassword = databaseConfig.postgresConfig.password;
      }

      this.settingsService.updateDatabaseConfig(input);

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
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
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /settings/export/database
   *
   * Export database
   */
  exportDatabase = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      // This would need full database export implementation
      // For now, return a placeholder
      this.sendError(reply, 'database export not yet implemented in TypeScript');
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /settings/import/database
   *
   * Import database
   */
  importDatabase = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      // This would need full database import implementation with file upload
      // For now, return a placeholder
      this.sendError(reply, 'database import not yet implemented in TypeScript');
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
