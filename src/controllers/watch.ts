/**
 * Watch Controller
 *
 * Handles the main video watch page.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { VideoControllerBase, type VideoSource } from '@controllers/video-controller-base.js';
import type { VideosService, LinksService, MonetizationService, CommentsService } from '@services/index.js';
import type { DrizzleVideo } from '@database/index.js';
import { getConfig } from '@config/index.js';

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
  private readonly videosService: VideosService;
  private readonly linksService: LinksService;
  private readonly monetizationService: MonetizationService;
  private readonly commentsService: CommentsService;

  constructor(
    videosService: VideosService,
    linksService: LinksService,
    monetizationService: MonetizationService,
    commentsService: CommentsService
  ) {
    super('WatchController');
    this.videosService = videosService;
    this.linksService = linksService;
    this.monetizationService = monetizationService;
    this.commentsService = commentsService;
  }

  /**
   * GET /watch
   *
   * Render the video watch page
   */
  getWatchPage = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { v: videoId } = request.query as WatchQuery;

      const video = await this.videosService.getVideo(videoId);

      if (!video) {
        return await this.sendError(reply, 'that video could not be loaded', 404);
      } else {
        const model = await this.buildPageData(video);

        return await reply.view('watch.ejs', { model });
      }
    } catch (error) {
      this.logger.error('Get progressive video failed', error);

      return await this.sendError(reply, 'that video could not be loaded', 500);
    }
  };

  /**
   * Build all data needed for the watch page
   */
  private async buildPageData(video: DrizzleVideo): Promise<WatchPageData> {
    const config = getConfig();

    const nodeSettings = config.nodeSettings;

    const externalVideosBaseUrl = config.getExternalVideosBaseUrl();
    const externalResourcesBaseUrl = config.getExternalResourcesBaseUrl();

    // Fetch all data in parallel
    const [videoCount, links, walletAddresses, recommendedVideosResult, comments] =
      await Promise.all([
        this.videosService.countVideos({ isPublished: true }),
        this.linksService.getAllLinks(),
        this.monetizationService.getWalletAddresses(),
        this.videosService.getVideos({
          isPublished: true,
          limit: 10,
          sortBy: 'creation_timestamp',
          sortDirection: 'desc',
        }),
        this.commentsService.getCommentsForVideo(
          video.video_id,
          'before',
          'ascending',
          Date.now()
        ),
      ]);

    const recommendedVideos = recommendedVideosResult.data;

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
}
