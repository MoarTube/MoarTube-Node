/**
 * External Videos Controller
 *
 * Handles serving video content (thumbnails, previews, posters, adaptive streams, progressive downloads).
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { servePublicFile } from '@/utils/public-file.js';
import { BaseController } from '@controllers/base.js';
import type { VideosService } from '@services/index.js';
import { getConfig } from '@config/index.js';

/**
 * Route params for video images
 */
interface VideoIdParams {
  videoId: string;
}

/**
 * Route params for adaptive manifests
 */
interface AdaptiveManifestParams {
  videoId: string;
  format: string;
  type: string;
  manifestName: string;
}

/**
 * Route params for adaptive segments
 */
interface AdaptiveSegmentParams {
  videoId: string;
  format: string;
  resolution: string;
  segmentName: string;
}

/**
 * Route params for progressive files
 */
interface ProgressiveParams {
  videoId: string;
  format: string;
  progressiveFilename: string;
}

/**
 * ExternalVideosController class
 *
 * Handles:
 * - Get external videos base URL
 * - Serve video thumbnail images
 * - Serve video preview images
 * - Serve video poster images
 * - Serve HLS/DASH manifests
 * - Serve HLS/DASH segments
 * - Serve progressive video files (with range support)
 */
export class ExternalVideosController extends BaseController {
  private readonly bandwidth = new Map<string, number>();
  private readonly bandwidthWrites = new Set<Promise<void>>();
  private bandwidthTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly videosService: VideosService;

  constructor(videosService: VideosService) {
    super('ExternalVideosController');
    this.videosService = videosService;
  }

  /**
   * GET /external/videos/baseUrl
   *
   * Get external videos base URL
   */
  getBaseUrl = async (_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const config = getConfig();

      const externalVideosBaseUrl = config.getExternalVideosBaseUrl();

      return await this.sendSuccess(reply, { externalVideosBaseUrl });
    } catch (error) {
      this.logger.error('Get base URL failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /external/videos/:videoId/images/thumbnail.jpg
   *
   * Serve video thumbnail image
   */
  getThumbnail = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const config = getConfig();

      return await servePublicFile(
        request,
        reply,
        config.paths.videosDirectoryPath,
        [videoId, 'images', 'thumbnail.jpg'],
        'image/jpeg'
      );
    } catch (error) {
      this.logger.error('ExternalVideosController.getThumbnail failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /external/videos/:videoId/images/preview.jpg
   *
   * Serve video preview image
   */
  getPreview = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const config = getConfig();

      return await servePublicFile(
        request,
        reply,
        config.paths.videosDirectoryPath,
        [videoId, 'images', 'preview.jpg'],
        'image/jpeg'
      );
    } catch (error) {
      this.logger.error('ExternalVideosController.getPreview failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /external/videos/:videoId/images/poster.jpg
   *
   * Serve video poster image
   */
  getPoster = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const config = getConfig();

      return await servePublicFile(
        request,
        reply,
        config.paths.videosDirectoryPath,
        [videoId, 'images', 'poster.jpg'],
        'image/jpeg'
      );
    } catch (error) {
      this.logger.error('ExternalVideosController.getPoster failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /external/videos/:videoId/adaptive/:format/:type/manifests/:manifestName
   *
   * Serve HLS/DASH manifest files
   */
  getAdaptiveManifest = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId, format, manifestName } = request.params as AdaptiveManifestParams;

      const config = getConfig();

      return await servePublicFile(
        request,
        reply,
        config.paths.videosDirectoryPath,
        [videoId, 'adaptive', format, manifestName],
        'application/vnd.apple.mpegurl',
        { live: (request.params as AdaptiveManifestParams).type === 'dynamic' }
      );
    } catch (error) {
      this.logger.error('Get adaptive manifest failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /external/videos/:videoId/adaptive/:format/:resolution/segments/:segmentName
   *
   * Serve HLS/DASH segment files with bandwidth tracking
   */
  getAdaptiveSegment = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId, format, resolution, segmentName } = request.params as AdaptiveSegmentParams;

      const config = getConfig();

      return await servePublicFile(
        request,
        reply,
        config.paths.videosDirectoryPath,
        [videoId, 'adaptive', format, resolution, segmentName],
        'video/mp2t',
        {
          onBytes: (bytes) => {
            this.trackProgressiveBandwidth(bytes, videoId);
          },
        }
      );
    } catch (error) {
      this.logger.error('Get adaptive segment failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  /**
   * GET /external/videos/:videoId/progressive/:format/:progressiveFilename
   *
   * Serve progressive video files with range request support
   */
  getProgressive = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId, format, progressiveFilename } = request.params as ProgressiveParams;

      const config = getConfig();

      return await servePublicFile(
        request,
        reply,
        config.paths.videosDirectoryPath,
        [videoId, 'progressive', format, progressiveFilename],
        format === 'ogv' ? 'video/ogg' : `video/${format}`,
        {
          ranges: true,
          onBytes: (bytes) => {
            this.trackProgressiveBandwidth(bytes, videoId);
          },
        }
      );
    } catch (error) {
      this.logger.error('Get progressive video failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node', 500);
    }
  };

  private trackProgressiveBandwidth(bytes: number, videoId: string): void {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
      return;
    }
    this.bandwidth.set(videoId, (this.bandwidth.get(videoId) ?? 0) + bytes);
    this.bandwidthTimer ??= setTimeout(() => {
      this.bandwidthTimer = undefined;
      void this.flushBandwidth();
    }, 100);
  }

  async flushBandwidth(): Promise<void> {
    clearTimeout(this.bandwidthTimer);
    this.bandwidthTimer = undefined;
    const pending = [...this.bandwidth];
    this.bandwidth.clear();
    const write = this.writeBandwidth(pending);
    this.bandwidthWrites.add(write);
    try {
      await Promise.all(this.bandwidthWrites);
    } finally {
      this.bandwidthWrites.delete(write);
    }
  }

  private async writeBandwidth(pending: [string, number][]): Promise<void> {
    for (const [videoId, bytes] of pending) {
      try {
        await this.videosService.updateBandwidth(videoId, bytes);
      } catch (error) {
        this.logger.error('Bandwidth update failed', error);
      }
    }
  }
}
