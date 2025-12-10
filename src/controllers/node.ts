/**
 * Node Controller
 *
 * Handles the main node page and related endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import type { CommentsRepository } from '../database/repositories/comments.js';
import type { ReportsVideosRepository } from '../database/repositories/reports-videos.js';
import type { ReportsCommentsRepository } from '../database/repositories/reports-comments.js';
import type { LinksRepository } from '../database/repositories/links.js';
import type { MonetizationRepository } from '../database/repositories/monetization.js';
import type { DrizzleVideo } from '../database/schemas/index.js';
import { getConfig } from '../config/index.js';

/**
 * Query parameters for node page
 */
export interface NodeQuery {
  searchTerm?: string;
  sortTerm: string;
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
    private readonly videoRepository: VideosRepository,
    private readonly commentRepository: CommentsRepository,
    private readonly videoReportRepository: ReportsVideosRepository,
    private readonly commentReportRepository: ReportsCommentsRepository,
    private readonly linkRepository: LinksRepository,
    private readonly monetizationRepository: MonetizationRepository
  ) {
    super('NodeController');
  }

  /**
   * GET /node
   *
   * Render the main node page
   */
  getNodePage = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { searchTerm, sortTerm, tagTerm } = request.query as NodeQuery;

      const config = getConfig();
      const nodeSettings = config.nodeSettings;

      // Get node information
      const videoCount = await this.videoRepository.getCount({ isPublished: true });

      const informationData = {
        isError: false,
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

      // Get links
      const links = await this.linkRepository.findAll();
      const linksData = { isError: false, links };

      // Get crypto wallet addresses
      const walletAddresses = await this.monetizationRepository.findAll();
      const cryptoWalletAddressesData = { isError: false, cryptoWalletAddresses: walletAddresses };

      // Get all unique tags
      const allVideos = await this.videoRepository.findAll({
        isPublished: true,
      });

      const tagsSet = new Set<string>();
      for (const video of allVideos) {
        const videoTags = video.tags.split(',');
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

      // Build model object for template JavaScript access
      const model = {
        informationData,
        linksData,
        cryptoWalletAddressesData,
        tagsData,
        searchResultsData,
        externalVideosBaseUrl,
        externalResourcesBaseUrl,
      };

      // Render the node page
      return await reply.view('node', { model });
    } catch (error) {
      this.logger.error('Node page rendering failed', error instanceof Error ? error : null);
      return await reply.status(500).send('node page rendering error');
    }
  };

  /**
   * GET /node/search
   *
   * Search videos
   */
  search = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { searchTerm, sortTerm, tagTerm } = request.query as NodeQuery;

      const data = await this.performSearch(searchTerm, sortTerm, tagTerm);
      return await this.sendSuccess(reply, { searchResults: data.searchResults });
    } catch (error) {
      this.logger.error('Search failed', error instanceof Error ? error : null);
      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /node/newContentCounts
   *
   * Get counts of new content since last check
   */
  getNewContentCounts = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
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

      return await this.sendSuccess(reply, {
        newContentCounts: {
          newCommentsCount,
          newVideoReportsCount,
          newCommentReportsCount,
        },
      });
    } catch (error) {
      this.logger.error('Get new content counts failed', error instanceof Error ? error : null);
      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /node/contentChecked
   *
   * Mark content type as checked
   */
  contentChecked = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { contentType } = request.body as ContentCheckedBody;
      const config = getConfig();

      const timestamp = Date.now();

      switch (contentType) {
        case 'comments':
          config.updateLastCheckedContentTracker({ lastCheckedCommentsTimestamp: timestamp });
          break;
        case 'videoReports':
          config.updateLastCheckedContentTracker({ lastCheckedVideoReportsTimestamp: timestamp });
          break;
        case 'commentReports':
          config.updateLastCheckedContentTracker({ lastCheckedCommentReportsTimestamp: timestamp });
          break;
      }

      return await this.sendOk(reply);
    } catch (error) {
      this.logger.error('Content checked failed', error instanceof Error ? error : null);
      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * Perform video search with sorting and tag filtering
   */
  private async performSearch(
    searchTerm: string | undefined,
    sortTerm: string,
    tagTerm: string | undefined
  ): Promise<{ isError: false; searchResults: DrizzleVideo[] }> {
    const videos = await this.fetchAndMergeVideos(searchTerm);
    const sortedVideos = this.sortVideos(videos, sortTerm);
    const searchResults = this.filterByTag(sortedVideos, tagTerm);

    return { isError: false, searchResults };
  }

  /**
   * Fetch published and live videos, merge and deduplicate
   */
  private async fetchAndMergeVideos(searchTerm: string | undefined): Promise<DrizzleVideo[]> {
    const queryOptions: { isPublished: boolean; search?: string } = {
      isPublished: true,
    };

    if (searchTerm !== undefined && searchTerm.length > 0) {
      queryOptions.search = searchTerm;
    }

    const videos = await this.videoRepository.findAll(queryOptions);
    const liveVideos = await this.videoRepository.findStreaming();

    const videoMap = new Map<string, DrizzleVideo>();
    for (const video of videos) {
      videoMap.set(video.video_id, video);
    }
    for (const video of liveVideos) {
      if (!videoMap.has(video.video_id)) {
        videoMap.set(video.video_id, video);
      }
    }

    return Array.from(videoMap.values());
  }

  /**
   * Sort videos by the given sort term
   */
  private sortVideos(videos: DrizzleVideo[], sortTerm: string): DrizzleVideo[] {
    const sorted = [...videos];

    if (sortTerm === 'latest') {
      sorted.sort((a, b) => b.creation_timestamp - a.creation_timestamp);
    } else if (sortTerm === 'popular') {
      sorted.sort((a, b) => b.views - a.views);
    } else if (sortTerm === 'oldest') {
      sorted.sort((a, b) => a.creation_timestamp - b.creation_timestamp);
    }

    return sorted;
  }

  /**
   * Filter videos by tag with optional tag limit
   */
  private filterByTag(videos: DrizzleVideo[], tagTerm: string | undefined): DrizzleVideo[] {
    if (tagTerm !== undefined && tagTerm.length > 0) {
      return this.filterBySpecificTag(videos, tagTerm);
    }
    return this.filterWithTagLimit(videos);
  }

  /**
   * Filter videos that have a specific tag
   */
  private filterBySpecificTag(videos: DrizzleVideo[], tagTerm: string): DrizzleVideo[] {
    const results: DrizzleVideo[] = [];

    for (const video of videos) {
      const tagsArray = video.tags.split(',').map((t: string) => t.trim());
      if (tagsArray.includes(tagTerm) && !results.includes(video)) {
        results.push(video);
      }
    }

    return results;
  }

  /**
   * Filter videos with a limit per tag
   */
  private filterWithTagLimit(videos: DrizzleVideo[]): DrizzleVideo[] {
    const tagLimit = 4;
    const tagLimitCounter: Record<string, number> = {};
    const results: DrizzleVideo[] = [];

    for (const video of videos) {
      if (this.shouldAddVideoByTagLimit(video, tagLimitCounter, tagLimit)) {
        results.push(video);
      }
    }

    return results;
  }

  /**
   * Check if video should be added based on tag limit
   */
  private shouldAddVideoByTagLimit(
    video: DrizzleVideo,
    tagLimitCounter: Record<string, number>,
    tagLimit: number
  ): boolean {
    const tagsArray = video.tags.split(',');

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
        return true;
      }
    }

    return false;
  }
}
