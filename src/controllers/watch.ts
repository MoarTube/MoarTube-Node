/**
 * Watch Controller
 *
 * Handles the main video watch page.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { VideoControllerBase, type VideoSource } from '@controllers/video-controller-base.js';
import type {
  VideosService,
  LinksService,
  MonetizationService,
  CommentsService,
} from '@services/index.js';
import type { SQLiteVideo, PostgresVideo } from '@database/index.js';
import { COMMENT_STATE_CACHE_CONTROL } from '@/utils/comment-cache.js';
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
    isPublishing: boolean;
    isLive: boolean;
    isLikesEnabled: boolean;
    isDislikesEnabled: boolean;
    isLiveChatEnabled: boolean;
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
    totalCount: number;
    hasMore?: boolean;
    isError: false;
    cdnEnabled: boolean;
    cacheVersion: number;
    cacheEpoch: string;
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
    reply.headers({ 'Cache-Control': 'no-store' });
    try {
      const { v: videoId } = request.query as WatchQuery;

      const video = await this.videosService.getVideo(videoId);

      if (!video) {
        return await this.sendError(reply, 'that video could not be loaded', 404);
      } else {
        const model = await this.buildPageData(video);

        if (request.headers.authorization === undefined) {
          reply.headers({ 'Cache-Control': COMMENT_STATE_CACHE_CONTROL });
        }
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
  private async buildPageData(video: SQLiteVideo | PostgresVideo): Promise<WatchPageData> {
    const config = getConfig();

    const nodeSettings = config.nodeSettings;

    const externalVideosBaseUrl = config.getExternalVideosBaseUrl();
    const externalResourcesBaseUrl = config.getExternalResourcesBaseUrl();

    // Fetch all data in parallel
    const [videoCount, links, walletAddresses, recommendedVideosResult, cacheVersion] =
      await Promise.all([
        this.videosService.countVideos({ isPublished: true }),
        this.linksService.getAllLinks(),
        this.monetizationService.getWalletAddresses(),
        this.videosService.getRecommendedVideos({ limit: 10 }),
        this.commentsService.getCacheVersion(video.video_id),
      ]);

    const recommendedVideos = recommendedVideosResult;

    const { adaptiveSources, progressiveSources, sourcesFormatsAndResolutions } =
      this.buildVideoSources(video, externalVideosBaseUrl);

    return {
      informationData: this.buildNodeInformation(nodeSettings, videoCount),
      linksData: { isError: false as const, links },
      cryptoWalletAddressesData: {
        isError: false as const,
        cryptoWalletAddresses: walletAddresses,
      },
      videoData: this.buildVideoData(
        video,
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
        totalCount: video.comments,
        isError: false as const,
        hasMore: video.comments > 100,
        cdnEnabled: nodeSettings.isCloudflareCdnEnabled,
        cacheVersion,
        cacheEpoch: await this.commentsService.getCacheEpoch(),
        comments: [],
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
    video: SQLiteVideo | PostgresVideo,
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
        isPublishing: video.is_publishing,
        isLive: video.is_live,
        isLikesEnabled: getConfig().nodeSettings.isLikesEnabled && video.is_likes_enabled,
        isDislikesEnabled: getConfig().nodeSettings.isDislikesEnabled && video.is_dislikes_enabled,
        isLiveChatEnabled: getConfig().nodeSettings.isLiveChatEnabled && video.is_live_chat_enabled,
        isStreaming: video.is_streaming,
        isStreamed: video.is_streamed,
        isCommentsEnabled: getConfig().nodeSettings.isCommentsEnabled && video.is_comments_enabled,
        isReportsEnabled: getConfig().nodeSettings.isReportsEnabled && video.is_reports_enabled,
        creationTimestamp: video.creation_timestamp,
        isHlsAvailable: sourcesFormatsAndResolutions.m3u8.length > 0,
        isMp4Available: sourcesFormatsAndResolutions.mp4.length > 0,
        isWebmAvailable: sourcesFormatsAndResolutions.webm.length > 0,
        isOgvAvailable: sourcesFormatsAndResolutions.ogv.length > 0,
        adaptiveSources,
        progressiveSources,
        sourcesFormatsAndResolutions,
      },
    };
  }
}
