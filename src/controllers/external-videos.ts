/**
 * External Videos Controller
 *
 * Handles serving video content (thumbnails, previews, posters, adaptive streams, progressive downloads).
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { BaseController } from './base.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import { getConfig } from '../config/index.js';
import {
  isVideoIdValid,
  isProgressiveFormatValid,
  isProgressiveFilenameValid,
} from '../utils/index.js';

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
  // Bandwidth tracking state
  private segmentBandwidthCounter = 0;
  private segmentBandwidthTimer: ReturnType<typeof setTimeout> | null = null;
  private progressiveBandwidthCounter = 0;
  private progressiveBandwidthTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly videoRepository: VideosRepository) {
    super('ExternalVideosController');
  }

  /**
   * GET /external/videos/baseUrl
   *
   * Get external videos base URL
   */
  getBaseUrl = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const config = getConfig();
      const externalVideosBaseUrl = config.getExternalVideosBaseUrl();

      this.sendSuccess(reply, { externalVideosBaseUrl });
    } catch (error) {
      this.logger.error('Get base URL failed', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /external/videos/:videoId/images/thumbnail.jpg
   *
   * Serve video thumbnail image
   */
  getThumbnail = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const { videoId } = request.params as VideoIdParams;

    const config = getConfig();

    const thumbnailPath = path.join(
      config.paths.videosDirectoryPath,
      videoId,
      'images',
      'thumbnail.jpg'
    );

    if (!fs.existsSync(thumbnailPath)) {
      return reply.status(404).send('thumbnail not found');
    }

    const stat = fs.statSync(thumbnailPath);
    const stream = fs.createReadStream(thumbnailPath);

    return reply
      .header('Content-Type', 'image/jpeg')
      .header('Content-Length', stat.size)
      .send(stream);
  };

  /**
   * GET /external/videos/:videoId/images/preview.jpg
   *
   * Serve video preview image
   */
  getPreview = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const { videoId } = request.params as VideoIdParams;

    const config = getConfig();

    const previewPath = path.join(
      config.paths.videosDirectoryPath,
      videoId,
      'images',
      'preview.jpg'
    );

    if (!fs.existsSync(previewPath)) {
      return reply.status(404).send('preview not found');
    }

    const stats = fs.statSync(previewPath);
    const fileStream = fs.createReadStream(previewPath);

    return reply
      .header('Content-Type', 'image/jpeg')
      .header('Content-Length', stats.size)
      .send(fileStream);
  };

  /**
   * GET /external/videos/:videoId/images/poster.jpg
   *
   * Serve video poster image
   */
  getPoster = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    const { videoId } = request.params as VideoIdParams;

    const config = getConfig();

    const posterPath = path.join(config.paths.videosDirectoryPath, videoId, 'images', 'poster.jpg');

    if (!fs.existsSync(posterPath)) {
      return reply.status(404).send('poster not found');
    }

    const stats = fs.statSync(posterPath);
    const fileStream = fs.createReadStream(posterPath);

    return reply
      .header('Content-Type', 'image/jpeg')
      .header('Content-Length', stats.size)
      .send(fileStream);
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

      const manifestPath = path.join(
        config.paths.videosDirectoryPath,
        videoId,
        'adaptive',
        format,
        manifestName
      );

      if (!fs.existsSync(manifestPath)) {
        return await reply.status(404).send('video not found');
      }

      const stats = fs.statSync(manifestPath);
      const fileStream = fs.createReadStream(manifestPath);
      return await reply
        .header('Content-Type', 'application/vnd.apple.mpegurl')
        .header('Content-Length', stats.size)
        .send(fileStream);
    } catch (error) {
      this.logger.error('Get adaptive manifest failed', error instanceof Error ? error : null);
      return await reply.status(404).send('video not found');
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

      const segmentPath = path.join(
        config.paths.videosDirectoryPath,
        videoId,
        'adaptive',
        format,
        resolution,
        segmentName
      );

      if (!fs.existsSync(segmentPath)) {
        return await reply.status(404).send('video not found');
      }

      // Track bandwidth asynchronously
      this.trackSegmentBandwidth(segmentPath, videoId);

      const stats = fs.statSync(segmentPath);
      const fileStream = fs.createReadStream(segmentPath);
      return await reply
        .header('Content-Type', 'video/mp2t')
        .header('Content-Length', stats.size)
        .send(fileStream);
    } catch (error) {
      this.logger.error('Get adaptive segment failed', error instanceof Error ? error : null);
      return await reply.status(404).send('video not found');
    }
  };

  /**
   * GET /external/videos/:videoId/progressive/:format/:progressiveFilename
   *
   * Serve progressive video files with range request support
   */
  getProgressive = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { videoId, format, progressiveFilename } = request.params as ProgressiveParams;

      if (
        !isVideoIdValid(videoId, false) ||
        !isProgressiveFormatValid(format) ||
        !isProgressiveFilenameValid(progressiveFilename)
      ) {
        void reply.status(404).send('video not found');
        return;
      }

      const config = getConfig();
      const filePath = path.join(
        config.paths.videosDirectoryPath,
        videoId,
        'progressive',
        format,
        progressiveFilename
      );

      if (!fs.existsSync(filePath)) {
        void reply.status(404).send('video not found');
        return;
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = request.headers.range;

      if (typeof range === 'string' && range.length > 0) {
        // Handle range request
        const parts = range.replace(/bytes=/, '').split('-');
        const startPart = parts[0];
        const endPart = parts[1];
        const start =
          startPart !== undefined && startPart !== '' ? Number.parseInt(startPart, 10) : 0;
        const end =
          endPart !== undefined && endPart !== '' ? Number.parseInt(endPart, 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        // Track bandwidth
        this.trackProgressiveBandwidth(chunkSize, videoId);

        const fileStream = fs.createReadStream(filePath, { start, end });

        void reply
          .status(206)
          .header('Content-Range', `bytes ${String(start)}-${String(end)}/${String(fileSize)}`)
          .header('Accept-Ranges', 'bytes')
          .header('Content-Length', chunkSize)
          .header('Content-Type', `video/${format}`)
          .send(fileStream);
      } else {
        // Full file request
        const fileStream = fs.createReadStream(filePath);

        void reply
          .header('Content-Length', fileSize)
          .header('Content-Type', `video/${format}`)
          .send(fileStream);
      }
    } catch (error) {
      this.logger.error('Get progressive video failed', error instanceof Error ? error : null);
      void reply.status(404).send('video not found');
    }
  };

  /**
   * Track bandwidth for adaptive segments (debounced)
   */
  private trackSegmentBandwidth(segmentPath: string, videoId: string): void {
    fs.stat(segmentPath, (error, stats) => {
      if (error) {
        return;
      }

      this.segmentBandwidthCounter += stats.size;

      if (this.segmentBandwidthTimer) {
        clearTimeout(this.segmentBandwidthTimer);
      }

      this.segmentBandwidthTimer = setTimeout(() => {
        const bandwidth = this.segmentBandwidthCounter;
        this.segmentBandwidthCounter = 0;

        // Update bandwidth in database
        void this.videoRepository.updateBandwidth(videoId, bandwidth);
      }, 100);
    });
  }

  /**
   * Track bandwidth for progressive downloads (debounced)
   */
  private trackProgressiveBandwidth(chunkSize: number, videoId: string): void {
    this.progressiveBandwidthCounter += chunkSize;

    if (this.progressiveBandwidthTimer) {
      clearTimeout(this.progressiveBandwidthTimer);
    }

    this.progressiveBandwidthTimer = setTimeout(() => {
      const bandwidth = this.progressiveBandwidthCounter;
      this.progressiveBandwidthCounter = 0;

      // Update bandwidth in database
      void this.videoRepository.updateBandwidth(videoId, bandwidth);
    }, 100);
  }
}
