/**
 * Watch Controller
 *
 * Handles the main video watch page.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { VideoControllerBase, type VideoSource } from './video-controller-base.js';
import type { CommentsRepository } from '../database/repositories/comments.js';
import type { LinksRepository } from '../database/repositories/links.js';
import type { MonetizationRepository } from '../database/repositories/monetization.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import type { DrizzleVideo } from '../database/schemas/index.js';
import { getConfig } from '../config/index.js';

/**
 * Fastify reply with view engine support
 */
type FastifyReplyWithView = FastifyReply & {
  view(template: string, data: Record<string, unknown>): Promise<FastifyReply>;
};

/**
 * Query parameters for watch page
 */
export interface WatchQuery {
  v: string;
}

/**
 * Node information data
 */
interface NodeInformationData {
  isError: false;
  information: {
    nodeVideoCount: number;
    nodeId: string;
    nodeName: string;
    nodeAbout: string;
    publicNodeProtocol: string;
    publicNodeAddress: string;
    publicNodePort: string;
    cloudflareTurnstileSiteKey: string;
  };
}

/**
 * Video data for watch page
 */
interface VideoData {
  isError: false;
  video: {
    videoId: string;
    title: string;
    description: string | null;
    tags: string | null;
    views: number;
    likes: number;
    dislikes: number;
    isPublished: boolean;
    isStreaming: boolean;
    isStreamed: boolean;
    isCommentsEnabled: boolean;
    isReportsEnabled: boolean;
    creationTimestamp: number;
    isHlsAvailable: boolean;
    isMp4Available: boolean;
    isWebmAvailable: boolean;
    isOgvAvailable: boolean;
    adaptiveSources: VideoSource[];
    progressiveSources: VideoSource[];
    sourcesFormatsAndResolutions: {
      m3u8: string[];
      mp4: string[];
      webm: string[];
      ogv: string[];
    };
  };
}

/**
 * Page data for watch page
 */
interface WatchPageData {
  informationData: NodeInformationData;
  linksData: { isError: false; links: unknown[] };
  cryptoWalletAddressesData: { isError: false; cryptoWalletAddresses: unknown[] };
  videoData: VideoData;
  recommendedVideosData: {
    isError: false;
    recommendedVideos: Array<{
      videoId: string;
      title: string;
      tags: string | null;
      views: number;
      creationTimestamp: number;
    }>;
  };
  commentsData: {
    isError: false;
    comments: Array<{ commentId: number; timestamp: number; commentPlainTextSanitized: string }>;
  };
  externalVideosBaseUrl: string;
  externalResourcesBaseUrl: string;
  adaptiveSources: VideoSource[];
  progressiveSources: VideoSource[];
}

/**
 * WatchController class
 *
 * Handles:
 * - Main video watch page rendering
 */
export class WatchController extends VideoControllerBase {
  constructor(
    videoRepository: VideosRepository,
    private readonly commentRepository: CommentsRepository,
    private readonly linkRepository: LinksRepository,
    private readonly monetizationRepository: MonetizationRepository
  ) {
    super('WatchController', videoRepository);
  }

  /**
   * GET /watch
   *
   * Render the video watch page
   */
  getWatchPage = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { v: videoId } = request.query as WatchQuery;

      const video = await this.videoRepository.findById(videoId);

      if (!video) {
        return await reply.status(404).send('that video could not be loaded');
      }

      const pageData = await this.buildPageData(video);

      return await this.renderPage(reply, pageData);
    } catch (error) {
      this.logger.error('Get progressive video failed', error instanceof Error ? error : null);
      return await reply.status(500).send('that video could not be loaded');
    }
  }; /**
   * Build all data needed for the watch page
   */
  private async buildPageData(video: DrizzleVideo): Promise<WatchPageData> {
    const config = getConfig();

    const nodeSettings = config.nodeSettings;

    const externalVideosBaseUrl = config.getExternalVideosBaseUrl();
    const externalResourcesBaseUrl = config.getExternalResourcesBaseUrl();

    // Fetch all data in parallel
    const [videoCount, links, walletAddresses, recommendedVideos, comments] = await Promise.all([
      this.videoRepository.getCount({ isPublished: true }),
      this.linkRepository.findAll(),
      this.monetizationRepository.findAll(),
      this.videoRepository.findAll({
        isPublished: true,
        limit: 10,
        sortBy: 'creation_timestamp',
        sortDirection: 'desc',
      }),
      this.commentRepository.findByVideoIdWithTimestampFilter(
        video.video_id,
        'before',
        'ascending',
        Date.now()
      ),
    ]);

    const { adaptiveSources, progressiveSources, sourcesFormatsAndResolutions } =
      this.buildVideoSources(video, externalVideosBaseUrl);

    const isHlsAvailable = sourcesFormatsAndResolutions.m3u8.length > 0;
    const isMp4Available = sourcesFormatsAndResolutions.mp4.length > 0;
    const isWebmAvailable = sourcesFormatsAndResolutions.webm.length > 0;
    const isOgvAvailable = sourcesFormatsAndResolutions.ogv.length > 0;

    return {
      informationData: this.buildNodeInformation(nodeSettings, videoCount),
      linksData: { isError: false as const, links },
      cryptoWalletAddressesData: {
        isError: false as const,
        cryptoWalletAddresses: walletAddresses,
      },
      videoData: this.buildVideoData(
        video,
        isHlsAvailable,
        isMp4Available,
        isWebmAvailable,
        isOgvAvailable,
        adaptiveSources,
        progressiveSources,
        sourcesFormatsAndResolutions
      ),
      recommendedVideosData: {
        isError: false as const,
        recommendedVideos: recommendedVideos.map((v) => ({
          videoId: v.video_id,
          title: v.title,
          tags: v.tags,
          views: v.views,
          isLive: v.is_live,
          isStreaming: v.is_streaming,
          lengthSeconds: v.length_seconds,
          creationTimestamp: v.creation_timestamp,
        })),
      },
      commentsData: {
        isError: false as const,
        comments: comments.map((c) => ({
          commentId: c.comment_id,
          timestamp: c.timestamp,
          commentPlainTextSanitized: c.comment_plain_text_sanitized,
        })),
      },
      externalVideosBaseUrl,
      externalResourcesBaseUrl,
      adaptiveSources,
      progressiveSources,
    };
  }

  /**
   * Build node information data
   */
  private buildNodeInformation(
    nodeSettings: ReturnType<typeof getConfig>['nodeSettings'],
    videoCount: number
  ): NodeInformationData {
    return {
      isError: false as const,
      information: {
        nodeVideoCount: videoCount,
        nodeId: nodeSettings.nodeId,
        nodeName: nodeSettings.nodeName,
        nodeAbout: nodeSettings.nodeAbout,
        publicNodeProtocol: nodeSettings.publicNodeProtocol,
        publicNodeAddress: nodeSettings.publicNodeAddress,
        publicNodePort: String(nodeSettings.publicNodePort),
        cloudflareTurnstileSiteKey: nodeSettings.cloudflareTurnstileSiteKey,
      },
    };
  }

  /**
   * Build video data response
   */
  private buildVideoData(
    video: DrizzleVideo,
    isHlsAvailable: boolean,
    isMp4Available: boolean,
    isWebmAvailable: boolean,
    isOgvAvailable: boolean,
    adaptiveSources: VideoSource[],
    progressiveSources: VideoSource[],
    sourcesFormatsAndResolutions: {
      m3u8: string[];
      mp4: string[];
      webm: string[];
      ogv: string[];
    }
  ): VideoData {
    return {
      isError: false as const,
      video: {
        videoId: video.video_id,
        title: video.title,
        description: video.description,
        tags: video.tags,
        views: video.views,
        likes: video.likes,
        dislikes: video.dislikes,
        isPublished: video.is_published,
        isStreaming: video.is_streaming,
        isStreamed: video.is_streamed,
        isCommentsEnabled: video.is_comments_enabled,
        isReportsEnabled: video.is_reports_enabled,
        creationTimestamp: video.creation_timestamp,
        isHlsAvailable,
        isMp4Available,
        isWebmAvailable,
        isOgvAvailable,
        adaptiveSources,
        progressiveSources,
        sourcesFormatsAndResolutions,
      },
    };
  }

  /**
   * Render the watch page or return JSON
   */
  private async renderPage(reply: FastifyReply, data: WatchPageData): Promise<FastifyReply> {
    const replyWithView = reply as FastifyReplyWithView;

    const model = {
      informationData: data.informationData,
      linksData: data.linksData,
      cryptoWalletAddressesData: data.cryptoWalletAddressesData,
      videoData: data.videoData,
      recommendedVideosData: data.recommendedVideosData,
      commentsData: data.commentsData,
      externalVideosBaseUrl: data.externalVideosBaseUrl,
      externalResourcesBaseUrl: data.externalResourcesBaseUrl,
    };

    return await replyWithView.view('watch', { model });
  }
}
