/**
 * Node Controller
 *
 * Handles the main node page and related endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.controller';
import type { VideoRepository } from '../database/repositories/video.repository';
import type { CommentRepository } from '../database/repositories/comment.repository';
import type { VideoReportRepository } from '../database/repositories/video-report.repository';
import type { CommentReportRepository } from '../database/repositories/comment-report.repository';
import type { LinkRepository } from '../database/repositories/link.repository';
import type { CryptoWalletAddressRepository } from '../database/repositories/crypto-wallet-address.repository';
import type { DrizzleVideo } from '../database/schema';
import { getConfig } from '../config';
import { isSearchTermValid, isSortTermValid, isTagTermValid } from '../utils';

/**
 * Fastify reply with view engine support
 */
interface FastifyReplyWithView extends FastifyReply {
  view?: (template: string, data: Record<string, unknown>) => FastifyReply;
}

/**
 * Query parameters for node page
 */
export interface NodeQuery {
  searchTerm?: string;
  sortTerm?: string;
  tagTerm?: string;
}

/**
 * Request body for content checked
 */
export interface ContentCheckedBody {
  contentType: 'comments' | 'videoReports' | 'commentReports';
}

/**
 * NodeController class
 *
 * Handles:
 * - Main node page rendering
 * - Video search
 * - New content counts
 * - Content check marking
 */
export class NodeController extends BaseController {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly commentRepository: CommentRepository,
    private readonly videoReportRepository: VideoReportRepository,
    private readonly commentReportRepository: CommentReportRepository,
    private readonly linkRepository: LinkRepository,
    private readonly cryptoWalletAddressRepository: CryptoWalletAddressRepository
  ) {
    super('NodeController');
  }

  /**
   * GET /node
   *
   * Render the main node page
   */
  getNodePage = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      let { searchTerm = '', sortTerm = 'latest', tagTerm = '' } = request.query as NodeQuery;

      // Validate and sanitize query parameters
      if (!isSearchTermValid(searchTerm)) {
        searchTerm = '';
      }

      if (!isSortTermValid(sortTerm)) {
        sortTerm = 'latest';
      }

      if (!isTagTermValid(tagTerm, true)) {
        tagTerm = '';
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

      // Get all unique tags
      const allVideos = await this.videoRepository.findAll({
        isPublished: true,
      });

      const tagsSet = new Set<string>();
      for (const video of allVideos) {
        const videoTags = video.tags?.split(',') ?? [];
        for (const tag of videoTags) {
          if (tag.trim()) {
            tagsSet.add(tag.trim());
          }
        }
      }
      const tagsData = { isError: false, tags: Array.from(tagsSet) };

      // Get search results
      const searchResultsData = await this.performSearch(searchTerm, sortTerm, tagTerm);

      const externalVideosBaseUrl = config.getExternalVideosBaseUrl();
      const externalResourcesBaseUrl = config.getExternalResourcesBaseUrl();

      // Render the node page
      const replyWithView = reply as FastifyReplyWithView;
      if (replyWithView.view) {
        void replyWithView.view('node', {
          informationData,
          linksData,
          cryptoWalletAddressesData,
          tagsData,
          searchResultsData,
          externalVideosBaseUrl,
          externalResourcesBaseUrl,
        });
      } else {
        // Fallback to JSON response if view engine not available
        void reply.send({
          informationData,
          linksData,
          cryptoWalletAddressesData,
          tagsData,
          searchResultsData,
          externalVideosBaseUrl,
          externalResourcesBaseUrl,
        });
      }
    } catch (error) {
      void reply.status(500).send('node page rendering error');
    }
  };

  /**
   * GET /node/search
   *
   * Search videos
   */
  search = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      let { searchTerm = '', sortTerm = 'latest', tagTerm = '' } = request.query as NodeQuery;

      // Validate parameters
      if (!isSearchTermValid(searchTerm)) {
        searchTerm = '';
      }

      if (!isSortTermValid(sortTerm)) {
        sortTerm = 'latest';
      }

      if (!isTagTermValid(tagTerm, true)) {
        tagTerm = '';
      }

      const data = await this.performSearch(searchTerm, sortTerm, tagTerm);
      this.sendSuccess(reply, { searchResults: data.searchResults });
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /node/newContentCounts
   *
   * Get counts of new content since last check
   */
  getNewContentCounts = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const config = getConfig();
      const lastCheckedContentTracker = config.lastCheckedContentTracker;

      const lastCheckedCommentsTimestamp = lastCheckedContentTracker.lastCheckedCommentsTimestamp;
      const lastCheckedVideoReportsTimestamp =
        lastCheckedContentTracker.lastCheckedVideoReportsTimestamp;
      const lastCheckedCommentReportsTimestamp =
        lastCheckedContentTracker.lastCheckedCommentReportsTimestamp;

      // Count new content since last check
      const newCommentsCount = await this.commentRepository.countNewerThan(
        lastCheckedCommentsTimestamp
      );
      const newVideoReportsCount = await this.videoReportRepository.countNewerThan(
        lastCheckedVideoReportsTimestamp
      );
      const newCommentReportsCount = await this.commentReportRepository.countNewerThan(
        lastCheckedCommentReportsTimestamp
      );

      this.sendSuccess(reply, {
        newContentCounts: {
          newCommentsCount,
          newVideoReportsCount,
          newCommentReportsCount,
        },
      });
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /node/contentChecked
   *
   * Mark content type as checked
   */
  contentChecked = (request: FastifyRequest, reply: FastifyReply): void => {
    try {
      const { contentType } = request.body as ContentCheckedBody;
      const config = getConfig();

      const timestamp = Date.now();

      if (contentType === 'comments') {
        config.updateLastCheckedContentTracker({ lastCheckedCommentsTimestamp: timestamp });
      } else if (contentType === 'videoReports') {
        config.updateLastCheckedContentTracker({ lastCheckedVideoReportsTimestamp: timestamp });
      } else if (contentType === 'commentReports') {
        config.updateLastCheckedContentTracker({ lastCheckedCommentReportsTimestamp: timestamp });
      }

      this.sendOk(reply);
    } catch (error) {
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * Perform video search with sorting and tag filtering
   */
  private async performSearch(
    searchTerm: string,
    sortTerm: string,
    tagTerm: string
  ): Promise<{ isError: false; searchResults: DrizzleVideo[] }> {
    // Build query options
    const queryOptions: { isPublished: boolean; search?: string } = {
      isPublished: true,
    };

    if (searchTerm.length > 0) {
      queryOptions.search = searchTerm;
    }

    // Get videos (published or live)
    let videos = await this.videoRepository.findAll(queryOptions);

    // Also include live videos
    const liveVideos = await this.videoRepository.findStreaming();

    // Merge and deduplicate
    const videoMap = new Map<string, DrizzleVideo>();
    for (const video of videos) {
      videoMap.set(video.videoId, video);
    }
    for (const video of liveVideos) {
      if (!videoMap.has(video.videoId)) {
        videoMap.set(video.videoId, video);
      }
    }
    videos = Array.from(videoMap.values());

    // Sort videos
    if (sortTerm === 'latest') {
      videos.sort((a: DrizzleVideo, b: DrizzleVideo) => b.creationTimestamp - a.creationTimestamp);
    } else if (sortTerm === 'popular') {
      videos.sort((a: DrizzleVideo, b: DrizzleVideo) => b.views - a.views);
    } else if (sortTerm === 'oldest') {
      videos.sort((a: DrizzleVideo, b: DrizzleVideo) => a.creationTimestamp - b.creationTimestamp);
    }

    // Filter by tag and apply tag limit
    const tagLimitCounter: Record<string, number> = {};
    const searchResults: DrizzleVideo[] = [];

    if (tagTerm.length === 0) {
      const tagLimit = 4;

      for (const video of videos) {
        const tagsArray = video.tags?.split(',') ?? [];
        let addVideo = false;

        for (const tag of tagsArray) {
          const trimmedTag = tag.trim();
          if (trimmedTag === '') {
            continue;
          }

          if (!(trimmedTag in tagLimitCounter)) {
            tagLimitCounter[trimmedTag] = 0;
          }

          const currentCount = tagLimitCounter[trimmedTag] ?? 0;
          if (currentCount < tagLimit) {
            tagLimitCounter[trimmedTag] = currentCount + 1;
            addVideo = true;
            break;
          }
        }

        if (addVideo) {
          searchResults.push(video);
        }
      }
    } else {
      for (const video of videos) {
        const tagsArray = video.tags?.split(',').map((t: string) => t.trim()) ?? [];

        if (tagsArray.includes(tagTerm) && !searchResults.includes(video)) {
          searchResults.push(video);
        }
      }
    }

    return { isError: false, searchResults };
  }
}
