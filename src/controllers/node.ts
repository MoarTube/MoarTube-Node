/**
 * Node Controller
 *
 * Handles the main node page and related endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.js';
import type { VideosService } from '../services/videos.js';
import type { LinksService } from '../services/links.js';
import type { MonetizationService } from '../services/monetization.js';
import type { StreamsService } from '../services/streams.js';
import type { CommentsService } from '../services/comments.js';
import type { ReportsService } from '../services/reports.js';
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
  private readonly videosService: VideosService;
  private readonly linksService: LinksService;
  private readonly monetizationService: MonetizationService;
  private readonly streamsService: StreamsService;
  private readonly commentsService: CommentsService;
  private readonly reportsService: ReportsService;

  constructor(
    videosService: VideosService,
    linksService: LinksService,
    monetizationService: MonetizationService,
    streamsService: StreamsService,
    commentsService: CommentsService,
    reportsService: ReportsService
  ) {
    super('NodeController');
    this.videosService = videosService;
    this.linksService = linksService;
    this.monetizationService = monetizationService;
    this.streamsService = streamsService;
    this.commentsService = commentsService;
    this.reportsService = reportsService;
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
      const videoCount = await this.videosService.countVideos({ isPublished: true });

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
      const links = await this.linksService.getAllLinks();
      const linksData = { isError: false, links };

      // Get crypto wallet addresses
      const walletAddresses = await this.monetizationService.getWalletAddresses();
      const cryptoWalletAddressesData = { isError: false, cryptoWalletAddresses: walletAddresses };

      // Get all unique tags
      const videosResult = await this.videosService.getVideos({
        isPublished: true,
      });
      const allVideos = videosResult.data;

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
      this.logger.error('Node page rendering failed', error);

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
      this.logger.error('Search failed', error);

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
      const newCommentsCount = await this.commentsService.countCommentsNewerThan(
        lastCheckedCommentsTimestamp
      );
      const newVideoReportsCount = await this.reportsService.countVideoReportsNewerThan(
        lastCheckedVideoReportsTimestamp
      );
      const newCommentReportsCount = await this.reportsService.countCommentReportsNewerThan(
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
      this.logger.error('Get new content counts failed', error);

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

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Content checked failed', error);

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

    const videosResult = await this.videosService.getVideos(queryOptions);
    const videos = videosResult.data;
    const liveVideos = await this.streamsService.getActiveStreams();

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
