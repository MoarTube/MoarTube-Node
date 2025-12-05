/**
 * Watch Controller
 *
 * Handles the main video watch page.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import type { CommentsRepository } from '../database/repositories/comments.js';
import type { LinksRepository } from '../database/repositories/links.js';
import type { MonetizationRepository } from '../database/repositories/monetization.js';
import type { DrizzleVideo } from '../database/schema/index.js';
import { getConfig } from '../config/index.js';
import { isVideoIdValid } from '../utils/index.js';

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
  v?: string;
}

/**
 * Video source info
 */
interface VideoSource {
  format: string;
  resolution: string;
  url: string;
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
    adaptiveSources: VideoSource[];
    progressiveSources: VideoSource[];
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
export class WatchController extends BaseController {
  constructor(
    private readonly videoRepository: VideosRepository,
    private readonly commentRepository: CommentsRepository,
    private readonly linkRepository: LinksRepository,
    private readonly monetizationRepository: MonetizationRepository
  ) {
    super('WatchController');
  }

  /**
   * GET /watch
   *
   * Render the video watch page
   */
  getWatchPage = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { v: videoId } = request.query as WatchQuery;

      if (videoId === undefined || videoId === '' || !isVideoIdValid(videoId, false)) {
        return await reply.status(400).send('invalid video id');
      }

      const config = getConfig();
      const video = await this.videoRepository.findById(videoId);

      if (!video) {
        return await reply.status(404).send('that video could not be loaded');
      }

      const pageData = await this.buildPageData(video, videoId, config);
      this.setCacheHeaders(reply, video, pageData.adaptiveSources, pageData.progressiveSources);
      return await this.renderPage(reply, pageData);
    } catch (error) {
      this.logger.error('Watch page rendering failed', error instanceof Error ? error : null);
      return await reply.status(500).send('that video could not be loaded');
    }
  };

  /**
   * Build all data needed for the watch page
   */
  private async buildPageData(
    video: DrizzleVideo,
    videoId: string,
    config: ReturnType<typeof getConfig>
  ): Promise<WatchPageData> {
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
      this.commentRepository.findByVideoId(videoId, { limit: 50 }),
    ]);

    const { adaptiveSources, progressiveSources } = this.buildVideoSources(
      video,
      externalVideosBaseUrl
    );

    return {
      informationData: this.buildNodeInformation(nodeSettings, videoCount),
      linksData: { isError: false as const, links },
      cryptoWalletAddressesData: {
        isError: false as const,
        cryptoWalletAddresses: walletAddresses,
      },
      videoData: this.buildVideoData(video, adaptiveSources, progressiveSources),
      recommendedVideosData: {
        isError: false as const,
        recommendedVideos: recommendedVideos.map((v) => ({
          videoId: v.videoId,
          title: v.title,
          tags: v.tags,
          views: v.views,
          creationTimestamp: v.creationTimestamp,
        })),
      },
      commentsData: {
        isError: false as const,
        comments: comments.map((c) => ({
          commentId: c.id,
          timestamp: c.timestamp,
          commentPlainTextSanitized: c.commentPlainTextSanitized,
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
   * Build video sources from metadata
   */
  private buildVideoSources(
    video: DrizzleVideo,
    externalVideosBaseUrl: string
  ): { adaptiveSources: VideoSource[]; progressiveSources: VideoSource[] } {
    const adaptiveSources: VideoSource[] = [];
    const progressiveSources: VideoSource[] = [];

    if (!video.isPublished && !video.isLive) {
      return { adaptiveSources, progressiveSources };
    }

    const formats = this.parseVideoFormats(video);

    if (formats['m3u8'] === true) {
      adaptiveSources.push({
        format: 'hls',
        resolution: 'auto',
        url: `${externalVideosBaseUrl}/${video.videoId}/adaptive/dynamic/manifest-master.m3u8`,
      });
    }

    const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
    for (const resolution of resolutions) {
      if (formats[`mp4_${resolution}`] === true) {
        progressiveSources.push({
          format: 'mp4',
          resolution,
          url: `${externalVideosBaseUrl}/${video.videoId}/progressive/${resolution}.mp4`,
        });
      }
    }

    return { adaptiveSources, progressiveSources };
  }

  /**
   * Parse video format metadata
   */
  private parseVideoFormats(video: DrizzleVideo): Record<string, unknown> {
    if (video.meta === '') {
      return {};
    }
    try {
      return JSON.parse(video.meta) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /**
   * Build video data response
   */
  private buildVideoData(
    video: DrizzleVideo,
    adaptiveSources: VideoSource[],
    progressiveSources: VideoSource[]
  ): VideoData {
    return {
      isError: false as const,
      video: {
        videoId: video.videoId,
        title: video.title,
        description: video.description,
        tags: video.tags,
        views: video.views,
        likes: video.likes,
        dislikes: video.dislikes,
        isPublished: video.isPublished,
        isStreaming: video.isLive,
        isStreamed: video.isStreamed,
        isCommentsEnabled: video.isCommentsEnabled,
        isReportsEnabled: video.isReportsEnabled,
        creationTimestamp: video.creationTimestamp,
        adaptiveSources,
        progressiveSources,
      },
    };
  }

  /**
   * Set appropriate cache headers
   */
  private setCacheHeaders(
    reply: FastifyReply,
    video: DrizzleVideo,
    adaptiveSources: VideoSource[],
    progressiveSources: VideoSource[]
  ): void {
    const hasSources = adaptiveSources.length > 0 || progressiveSources.length > 0;
    const isAvailable = video.isPublished || video.isLive;

    if (!hasSources || !isAvailable) {
      const cacheValue = video.isStreamed ? 'public, s-maxage=86400' : 'no-store';
      void reply.header('Cache-Control', cacheValue);
    } else {
      void reply.header('Cache-Control', 'public, s-maxage=86400');
    }
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
