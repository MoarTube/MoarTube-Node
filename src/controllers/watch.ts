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
import type { DrizzleVideo } from '../database/schemas/index.js';
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
  src: string;
  type: string;
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
      this.setCacheHeaders(
        reply,
        video,
        pageData.videoData.video.adaptiveSources,
        pageData.videoData.video.progressiveSources
      );
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

    const {
      isHlsAvailable,
      isMp4Available,
      isWebmAvailable,
      isOgvAvailable,
      adaptiveSources,
      progressiveSources,
      sourcesFormatsAndResolutions,
    } = this.buildVideoSources(video, externalVideosBaseUrl);

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
          commentId: c.id,
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
   * Build video sources from metadata
   */
  private buildVideoSources(
    video: DrizzleVideo,
    externalVideosBaseUrl: string
  ): {
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
        isHlsAvailable: false,
        isMp4Available: false,
        isWebmAvailable: false,
        isOgvAvailable: false,
        adaptiveSources,
        progressiveSources,
        sourcesFormatsAndResolutions,
      };
    }

    const outputs = JSON.parse(video.outputs) as Record<string, string[]>;

    const manifestType = video.is_streaming ? 'dynamic' : 'static';

    const isHlsAvailable = (outputs['m3u8']?.length ?? 0) > 0;
    const isMp4Available = (outputs['mp4']?.length ?? 0) > 0;
    const isWebmAvailable = (outputs['webm']?.length ?? 0) > 0;
    const isOgvAvailable = (outputs['ogv']?.length ?? 0) > 0;

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

    if (adaptiveSources.length > 0) {
      const src = `${externalVideosBaseUrl}/external/videos/${video.video_id}/adaptive/m3u8/${manifestType}/manifests/manifest-master.m3u8`;
      const source: VideoSource = { src, type: 'application/vnd.apple.mpegurl' };
      adaptiveSources.unshift(source);
    }

    return {
      isHlsAvailable,
      isMp4Available,
      isWebmAvailable,
      isOgvAvailable,
      adaptiveSources,
      progressiveSources,
      sourcesFormatsAndResolutions,
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
   * Set appropriate cache headers
   */
  private setCacheHeaders(
    reply: FastifyReply,
    video: DrizzleVideo,
    adaptiveSources: VideoSource[],
    progressiveSources: VideoSource[]
  ): void {
    const hasSources = adaptiveSources.length > 0 || progressiveSources.length > 0;
    const isAvailable = video.is_published || video.is_live;

    if (!hasSources || !isAvailable) {
      const cacheValue = video.is_streamed ? 'public, s-maxage=86400' : 'no-store';
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
