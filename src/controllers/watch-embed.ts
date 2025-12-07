/**
 * Watch Embed Controller
 *
 * Handles embedded video and chat page rendering.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import type { LinksRepository } from '../database/repositories/links.js';
import type { MonetizationRepository } from '../database/repositories/monetization.js';
import { getConfig } from '../config/index.js';

/**
 * Route params for video/chat endpoints
 */
interface VideoIdParams {
  videoId: string;
}

/**
 * Query params for video embed
 */
interface VideoEmbedQuery {
  autostart?: string;
}

/**
 * Extended FastifyReply with view method
 * View engine will be registered in app setup
 */
type FastifyReplyWithView = FastifyReply & {
  view(template: string, data: Record<string, unknown>): Promise<FastifyReply>;
};

/**
 * WatchEmbedController class
 *
 * Handles:
 * - Render embedded video player page
 * - Render embedded chat page
 */
export class WatchEmbedController extends BaseController {
  constructor(
    private readonly videoRepository: VideosRepository,
    private readonly linkRepository: LinksRepository,
    private readonly monetizationRepository: MonetizationRepository
  ) {
    super('WatchEmbedController');
  }

  /**
   * GET /watch/embed/video/:videoId
   *
   * Render embedded video player page
   */
  getEmbedVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { autostart } = request.query as VideoEmbedQuery;

      const video = await this.videoRepository.findById(videoId);

      if (!video) {
        this.sendError(reply, 'video not found', 404);
        return;
      }

      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      // Build video data for template
      const videoData = {
        video_id: video.video_id,
        title: video.title,
        description: video.description,
        tags: video.tags,
        length_seconds: video.length_seconds,
        length_timestamp: video.length_timestamp,
        views: video.views,
        likes: video.likes,
        dislikes: video.dislikes,
        is_published: video.is_published,
        is_live: video.is_live,
        is_streaming: video.is_streaming,
        outputs: video.outputs,
      };

      // Get external URLs
      const externalVideosBaseUrl = config.getExternalVideosBaseUrl();
      const externalResourcesBaseUrl = config.getExternalResourcesBaseUrl();

      // Render the embedded video template using view engine
      const replyWithView = reply as FastifyReplyWithView;

      const model = {
        video: videoData,
        autostart: autostart === '1' || autostart === 'true',
        externalVideosBaseUrl,
        externalResourcesBaseUrl,
        nodeSettings: {
          nodeName: nodeSettings.nodeName,
          nodeAbout: nodeSettings.nodeAbout,
          nodeId: nodeSettings.nodeId,
          publicNodeProtocol: nodeSettings.publicNodeProtocol,
          publicNodeAddress: nodeSettings.publicNodeAddress,
          publicNodePort: nodeSettings.publicNodePort,
          isCloudflareTurnstileEnabled: nodeSettings.isCloudflareTurnstileEnabled,
          cloudflareTurnstileSiteKey: nodeSettings.cloudflareTurnstileSiteKey,
        },
      };

      await replyWithView.view('embed-video', { model });
    } catch {
      this.sendError(reply, 'error loading embedded video');
    }
  };

  /**
   * GET /watch/embed/chat/:videoId
   *
   * Render embedded chat page
   */
  getEmbedChat = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const video = await this.videoRepository.findById(videoId);

      if (!video) {
        this.sendError(reply, 'video not found', 404);
        return;
      }

      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      // Get links and wallet addresses for monetization display
      const links = await this.linkRepository.findAll();
      const cryptoWalletAddresses = await this.monetizationRepository.findAll();

      const externalResourcesBaseUrl = config.getExternalResourcesBaseUrl();

      // Render the embedded chat template using view engine
      const replyWithView = reply as FastifyReplyWithView;

      const model = {
        videoId: video.video_id,
        isLiveChatEnabled: video.is_live_chat_enabled,
        isLive: video.is_live,
        isStreaming: video.is_streaming,
        externalResourcesBaseUrl,
        links,
        cryptoWalletAddresses,
        nodeSettings: {
          nodeName: nodeSettings.nodeName,
          nodeAbout: nodeSettings.nodeAbout,
          nodeId: nodeSettings.nodeId,
          publicNodeProtocol: nodeSettings.publicNodeProtocol,
          publicNodeAddress: nodeSettings.publicNodeAddress,
          publicNodePort: nodeSettings.publicNodePort,
          isCloudflareTurnstileEnabled: nodeSettings.isCloudflareTurnstileEnabled,
          cloudflareTurnstileSiteKey: nodeSettings.cloudflareTurnstileSiteKey,
        },
      };

      await replyWithView.view('embed-chat', { model });
    } catch {
      this.sendError(reply, 'error loading embedded chat');
    }
  };
}
