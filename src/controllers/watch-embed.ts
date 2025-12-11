/**
 * Watch Embed Controller
 *
 * Handles embedded video and chat page rendering.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  VideoControllerBase,
  type FastifyReplyWithView,
  type VideoSource,
} from './video-controller-base.js';
import type { LinksRepository } from '../database/repositories/links.js';
import type { MonetizationRepository } from '../database/repositories/monetization.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import type { DrizzleVideo } from '../database/schemas/index.js';
import { getConfig } from '../config/index.js';

/**
 * Route params for video/chat endpoints
 */
interface VideoIdParams {
  videoId: string;
}

/**
 * Page data for embedded video page
 */
interface EmbedPageData {
  videoData: {
    video: {
      title: string;
      description: string;
      views: number;
      isPublishing: boolean;
      isPublished: boolean;
      isLive: boolean;
      isStreaming: boolean;
      isStreamed: boolean;
      comments: number;
      creationTimestamp: number;
      adaptiveSources: VideoSource[];
      progressiveSources: VideoSource[];
      sourcesFormatsAndResolutions: {
        m3u8: string[];
        mp4: string[];
        webm: string[];
        ogv: string[];
      };
    };
  };
  externalVideosBaseUrl: string;
  externalResourcesBaseUrl: string;
}

/**
 * WatchEmbedController class
 *
 * Handles:
 * - Render embedded video player page
 * - Render embedded chat page
 */
export class WatchEmbedController extends VideoControllerBase {
  constructor(
    videoRepository: VideosRepository,
    private readonly linkRepository: LinksRepository,
    private readonly monetizationRepository: MonetizationRepository
  ) {
    super('WatchEmbedController', videoRepository);
  }

  /**
   * GET /watch/embed/video/:videoId
   *
   * Render embedded video player page
   */
  getEmbedVideo = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const video = await this.videoRepository.findById(videoId);

      if (!video) {
        return await this.sendError(reply, 'video not found', 404);
      } else {
        const model = this.buildPageData(video);

        return await reply.view('embed-video.ejs', { model });
      }
    } catch (error) {
      this.logger.error('WatchEmbedController.getEmbedVideo failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /watch/embed/chat/:videoId
   *
   * Render embedded chat page
   */
  getEmbedChat = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const video = await this.videoRepository.findById(videoId);

      if (!video) {
        return await this.sendError(reply, 'video not found', 404);
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

      return await replyWithView.view('embed-chat', { model });
    } catch (error) {
      this.logger.error('WatchEmbedController.getEmbedChat failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * Build all data needed for the embedded video page
   */
  private buildPageData(video: DrizzleVideo): EmbedPageData {
    const config = getConfig();

    const externalVideosBaseUrl = config.getExternalVideosBaseUrl();
    const externalResourcesBaseUrl = config.getExternalResourcesBaseUrl();

    // Build video sources
    const { adaptiveSources, progressiveSources, sourcesFormatsAndResolutions } =
      this.buildVideoSources(video, externalVideosBaseUrl);

    return {
      videoData: {
        video: {
          title: video.title,
          description: video.description,
          views: video.views,
          isPublishing: video.is_publishing,
          isPublished: video.is_published,
          isLive: video.is_live,
          isStreaming: video.is_streaming,
          isStreamed: video.is_streamed,
          comments: video.comments,
          creationTimestamp: video.creation_timestamp,
          adaptiveSources,
          progressiveSources,
          sourcesFormatsAndResolutions,
        },
      },
      externalVideosBaseUrl,
      externalResourcesBaseUrl,
    };
  }
}
