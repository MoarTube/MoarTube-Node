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
import type { DrizzleVideo } from '../database/schemas/index.js';
import { getConfig } from '../config/index.js';

/**
 * Route params for video/chat endpoints
 */
interface VideoIdParams {
  videoId: string;
}

/**
 * Video source info
 */
interface VideoSource {
  src: string;
  type: string;
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

      const config = getConfig();

      const video = await this.videoRepository.findById(videoId);

      if (!video) {
        return await reply.status(404).send('that video could not be loaded');
      }

      const externalVideosBaseUrl = config.getExternalVideosBaseUrl();
      const externalResourcesBaseUrl = config.getExternalResourcesBaseUrl();

      // Build video sources
      const { adaptiveSources, progressiveSources, sourcesFormatsAndResolutions } =
        this.buildVideoSources(video, externalVideosBaseUrl);

      const model = {
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

      return await reply.view('embed-video', { model });
    } catch (error) {
      this.logger.error('Watch page rendering failed', error instanceof Error ? error : null);
      return await reply.status(500).send('that video could not be loaded');
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

  /**
   * Build video sources for embedded video player
   */
  private buildVideoSources(
    video: DrizzleVideo,
    externalVideosBaseUrl: string
  ): {
    adaptiveSources: VideoSource[];
    progressiveSources: VideoSource[];
    sourcesFormatsAndResolutions: {
      m3u8: string[];
      mp4: string[];
      webm: string[];
      ogv: string[];
    };
  } {
    const adaptiveSources: VideoSource[] = [];
    const progressiveSources: VideoSource[] = [];
    const sourcesFormatsAndResolutions = { m3u8: [], mp4: [], webm: [], ogv: [] } as {
      m3u8: string[];
      mp4: string[];
      webm: string[];
      ogv: string[];
    };

    if (!video.is_published && !video.is_live) {
      return {
        adaptiveSources,
        progressiveSources,
        sourcesFormatsAndResolutions,
      };
    }

    const outputs = JSON.parse(video.outputs) as Record<string, string[]>;

    const manifestType = video.is_streaming ? 'dynamic' : 'static';

    for (const format in outputs) {
      if (format in outputs) {
        const resolutions = outputs[format] ?? [];

        for (const resolution of resolutions) {
          if (format === 'm3u8') {
            const src = `${externalVideosBaseUrl}/external/videos/${video.video_id}/adaptive/m3u8/${manifestType}/manifests/manifest-${resolution}.m3u8`;
            const source: VideoSource = { src, type: 'application/vnd.apple.mpegurl' };
            adaptiveSources.push(source);
          } else {
            const src = `${externalVideosBaseUrl}/external/videos/${video.video_id}/progressive/${format}/${resolution}.${format}`;

            let type: string;
            if (format === 'mp4') {
              type = 'video/mp4';
            } else if (format === 'webm') {
              type = 'video/webm';
            } else if (format === 'ogv') {
              type = 'video/ogg';
            } else {
              continue;
            }

            const source: VideoSource = { src, type };
            progressiveSources.push(source);
          }

          if (format in sourcesFormatsAndResolutions) {
            sourcesFormatsAndResolutions[format].push(resolution);
          }
        }
      }
    }

    return {
      adaptiveSources,
      progressiveSources,
      sourcesFormatsAndResolutions,
    };
  }
}
