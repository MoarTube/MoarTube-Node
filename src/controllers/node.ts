import { viewerMediaBase, pageCanonicalOrigin } from '@/utils/viewer-urls.js';
/**
 * Node Controller
 *
 * Handles the main node page and related endpoints.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from '@controllers/base.js';
import type {
  VideosService,
  LinksService,
  MonetizationService,
  StreamsService,
  CommentsService,
  ReportsService,
} from '@services/index.js';
import type { SQLiteVideo, PostgresVideo } from '@database/index.js';
import { getConfig } from '@config/index.js';

/**
 * Query parameters for node page
 */
export interface NodeQuery {
  searchTerm?: string;
  sortTerm: string;
  tagTerm?: string;
  offset?: number;
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

  private readonly commentsService: CommentsService;
  private readonly reportsService: ReportsService;

  constructor(
    videosService: VideosService,
    linksService: LinksService,
    monetizationService: MonetizationService,
    _streamsService: StreamsService,
    commentsService: CommentsService,
    reportsService: ReportsService
  ) {
    super('NodeController');
    this.videosService = videosService;
    this.linksService = linksService;
    this.monetizationService = monetizationService;

    this.commentsService = commentsService;
    this.reportsService = reportsService;
  }

  /**
   * GET /videos
   *
   * Render the main node page
   */
  getNodePage = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    reply.header('Cache-Control', 'no-store');
    try {
      const { searchTerm, sortTerm, tagTerm, offset = 0 } = request.query as NodeQuery;

      const config = getConfig();

      const nodeSettings = config.nodeSettings;

      // Get node information
      const videoCount = await this.videosService.countVideos({ isPublished: true });

      const informationData = {
        isError: false,
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

      // Get links
      const links = await this.linksService.getAllLinks();
      const linksData = { isError: false, links };

      // Get crypto wallet addresses
      const walletAddresses = await this.monetizationService.getWalletAddresses();
      const cryptoWalletAddressesData = { isError: false, cryptoWalletAddresses: walletAddresses };

      const tagsData = { isError: false, tags: await this.videosService.getPublishedTags() };

      // Get search results
      const searchResultsData = await this.performSearch(searchTerm, sortTerm, tagTerm, offset);

      const externalVideosBaseUrl = viewerMediaBase(config.nodeSettings);
      const externalResourcesBaseUrl = '';
      const canonicalOrigin = await pageCanonicalOrigin(request);

      // Build model object for template JavaScript access
      const model = {
        informationData,
        linksData,
        cryptoWalletAddressesData,
        tagsData,
        searchResultsData,
        externalVideosBaseUrl,
        externalResourcesBaseUrl,
        canonicalOrigin,
      };

      if (!request.headers.authorization) {
        reply.header('Cache-Control', 'public, max-age=0, s-maxage=30, must-revalidate');
      }
      // Render the node page
      return await reply.view('node', { model });
    } catch (error) {
      this.logger.error('Node page rendering failed', error);
      reply.header('Cache-Control', 'no-store');
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
      const { searchTerm, sortTerm, tagTerm, offset = 0 } = request.query as NodeQuery;

      const data = await this.performSearch(searchTerm, sortTerm, tagTerm, offset);

      return await this.sendSuccess(reply, {
        searchResults: data.searchResults,
        hasMore: data.hasMore,
        offset: data.offset,
        nextOffset: data.nextOffset,
        tagGroups: data.tagGroups,
      });
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
    tagTerm: string | undefined,
    offset = 0
  ): Promise<{
    isError: false;
    searchResults: (SQLiteVideo | PostgresVideo)[];
    hasMore: boolean;
    offset: number;
    nextOffset: number;
    tagGroups: { tag: string; videos: (SQLiteVideo | PostgresVideo)[] }[];
  }> {
    offset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const query = {
      visibleOnly: true,
      ...(searchTerm !== undefined && searchTerm !== '' ? { search: searchTerm } : {}),
      sortBy: sortTerm === 'popular' ? ('views' as const) : ('creation_timestamp' as const),
      sortDirection: sortTerm === 'oldest' ? ('asc' as const) : ('desc' as const),
    };
    if (tagTerm !== undefined && tagTerm !== '') {
      const result = await this.videosService.getVideos({ ...query, tagTerm, limit: 13, offset });
      const videos = result.data;
      return {
        isError: false,
        searchResults: videos.slice(0, 12),
        tagGroups: [],
        hasMore: videos.length > 12,
        offset,
        nextOffset: offset + Math.min(videos.length, 12),
      };
    }

    // Page matching tags independently so a prolific tag cannot hide other rows.
    const tags = await this.videosService.getPublishedTags(searchTerm, {
      limit: 5,
      offset,
      sortTerm,
    });
    const tagGroups = await Promise.all(
      tags.slice(0, 4).map(async (tag) => {
        const result = await this.videosService.getVideos({
          ...query,
          tagTerm: tag,
          limit: 4,
          offset: 0,
        });
        return { tag, videos: result.data.slice(0, 4) };
      })
    );
    const unique = new Map(
      tagGroups.flatMap((group) => group.videos).map((video) => [video.video_id, video])
    );
    return {
      isError: false,
      searchResults: [...unique.values()],
      tagGroups,
      hasMore: tags.length > 4,
      offset,
      nextOffset: offset + Math.min(tags.length, 4),
    };
  }
}
