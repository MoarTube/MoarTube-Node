/**
 * Watch Controller
 *
 * Handles the main video watch page.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.controller';
import type { VideoRepository } from '../database/repositories/video.repository';
import type { CommentRepository } from '../database/repositories/comment.repository';
import type { LinkRepository } from '../database/repositories/link.repository';
import type { CryptoWalletAddressRepository } from '../database/repositories/crypto-wallet-address.repository';
import { getConfig } from '../config';
import { isVideoIdValid } from '../utils';

/**
 * Fastify reply with view engine support
 */
interface FastifyReplyWithView extends FastifyReply {
  view?: (template: string, data: Record<string, unknown>) => FastifyReply;
}

/**
 * Query parameters for watch page
 */
export interface WatchQuery {
  v?: string;
}

/**
 * WatchController class
 *
 * Handles:
 * - Main video watch page rendering
 */
export class WatchController extends BaseController {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly commentRepository: CommentRepository,
    private readonly linkRepository: LinkRepository,
    private readonly cryptoWalletAddressRepository: CryptoWalletAddressRepository
  ) {
    super('WatchController');
  }

  /**
   * GET /watch
   *
   * Render the video watch page
   */
  getWatchPage = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { v: videoId } = request.query as WatchQuery;

      if (videoId === undefined || videoId === '' || !isVideoIdValid(videoId, false)) {
        void reply.status(400).send('invalid video id');
        return;
      }

      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      // Get node information
      const videoCount = await this.videoRepository.count({ isPublished: true });
      const informationData = {
        isError: false,
        information: {
          nodeVideoCount: videoCount,
          nodeId: String(nodeSettings.nodeId ?? ''),
          nodeName: String(nodeSettings.nodeName ?? ''),
          nodeAbout: String(nodeSettings.nodeAbout ?? ''),
          publicNodeProtocol: String(nodeSettings.publicNodeProtocol ?? ''),
          publicNodeAddress: String(nodeSettings.publicNodeAddress ?? ''),
          publicNodePort: String(nodeSettings.publicNodePort ?? ''),
          cloudflareTurnstileSiteKey: String(nodeSettings.cloudflareTurnstileSiteKey ?? ''),
        },
      };

      // Get links
      const links = await this.linkRepository.findAll();
      const linksData = { isError: false, links };

      // Get crypto wallet addresses
      const walletAddresses = await this.cryptoWalletAddressRepository.findAll();
      const cryptoWalletAddressesData = { isError: false, cryptoWalletAddresses: walletAddresses };

      // Get video data
      const video = await this.videoRepository.findById(videoId);
      if (!video) {
        void reply.status(404).send('that video could not be loaded');
        return;
      }

      // Build video data response
      const adaptiveSources: { format: string; resolution: string; url: string }[] = [];
      const progressiveSources: { format: string; resolution: string; url: string }[] = [];

      // Parse available formats from video
      const externalVideosBaseUrl = config.getExternalVideosBaseUrl();

      // Build sources based on video's format availability
      if (video.isPublished || video.isLive) {
        // Check available formats from video metadata
        let formats: Record<string, unknown> = {};
        if (video.meta !== undefined && video.meta !== null && video.meta !== '') {
          try {
            formats = JSON.parse(String(video.meta)) as Record<string, unknown>;
          } catch {
            // Invalid JSON, use empty object
          }
        }

        // Add adaptive sources if available
        if (formats['m3u8'] === true) {
          adaptiveSources.push({
            format: 'hls',
            resolution: 'auto',
            url: `${externalVideosBaseUrl}/${videoId}/adaptive/dynamic/manifest-master.m3u8`,
          });
        }

        // Add progressive sources based on available resolutions
        const resolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
        for (const resolution of resolutions) {
          if (formats[`mp4_${resolution}`] === true) {
            progressiveSources.push({
              format: 'mp4',
              resolution,
              url: `${externalVideosBaseUrl}/${videoId}/progressive/${resolution}.mp4`,
            });
          }
        }
      }

      const videoData = {
        isError: false,
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

      // Get recommended videos
      const recommendedVideos = await this.videoRepository.findAll({
        isPublished: true,
        limit: 10,
        sortBy: 'creation_timestamp',
        sortDirection: 'desc',
      });

      const recommendedVideosData = {
        isError: false,
        recommendedVideos: recommendedVideos.map((v) => ({
          videoId: v.videoId,
          title: v.title,
          tags: v.tags,
          views: v.views,
          creationTimestamp: v.creationTimestamp,
        })),
      };

      // Get comments
      const comments = await this.commentRepository.findByVideoId(videoId, {
        limit: 50,
      });

      const commentsData = {
        isError: false,
        comments: comments.map((c) => ({
          commentId: c.id,
          timestamp: c.timestamp,
          commentPlainTextSanitized: c.commentPlainTextSanitized,
        })),
      };

      const externalResourcesBaseUrl = config.getExternalResourcesBaseUrl();

      // Set cache control headers
      if (
        (adaptiveSources.length === 0 && progressiveSources.length === 0) ||
        (!video.isPublished && !video.isLive)
      ) {
        if (video.isStreamed) {
          void reply.header('Cache-Control', 'public, s-maxage=86400');
        } else {
          void reply.header('Cache-Control', 'no-store');
        }
      } else {
        void reply.header('Cache-Control', 'public, s-maxage=86400');
      }

      // Render the watch page
      const replyWithView = reply as FastifyReplyWithView;
      if (replyWithView.view) {
        void replyWithView.view('watch', {
          informationData,
          linksData,
          cryptoWalletAddressesData,
          videoData,
          recommendedVideosData,
          commentsData,
          externalVideosBaseUrl,
          externalResourcesBaseUrl,
        });
      } else {
        // Fallback to JSON response if view engine not available
        void reply.send({
          informationData,
          linksData,
          cryptoWalletAddressesData,
          videoData,
          recommendedVideosData,
          commentsData,
          externalVideosBaseUrl,
          externalResourcesBaseUrl,
        });
      }
    } catch (error) {
      void reply.status(500).send('that video could not be loaded');
    }
  };
}
