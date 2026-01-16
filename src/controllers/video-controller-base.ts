/**
 * Video Controller Base
 *
 * Abstract base class providing common functionality for video-related controllers.
 * Includes video source building, URL configuration, and shared data structures.
 */
import type { FastifyReply } from 'fastify';
import { BaseController } from '@controllers/base.js';
import type { SQLiteVideo, PostgresVideo } from '@database/index.js';

/**
 * Video source info
 */
export interface VideoSource {
  src: string;
  type: string;
}

/**
 * Video sources result
 */
export interface VideoSourcesResult {
  adaptiveSources: VideoSource[];
  progressiveSources: VideoSource[];
  sourcesFormatsAndResolutions: {
    m3u8: string[];
    mp4: string[];
    webm: string[];
    ogv: string[];
  };
}

/**
 * Extended FastifyReply with view method
 */
export type FastifyReplyWithView = FastifyReply & {
  view(template: string, data: Record<string, unknown>): Promise<FastifyReply>;
};

/**
 * Video Controller Base class
 *
 * Provides shared functionality for video-related controllers including:
 * - Video source building (adaptive and progressive)
 * - External URL configuration
 * - Common error handling patterns
 */
export abstract class VideoControllerBase extends BaseController {
  /**
   * Build video sources from video metadata
   *
   * @param video - Video database record
   * @param externalVideosBaseUrl - Base URL for external video access
   * @returns Video sources and format information
   */
  protected buildVideoSources(
    video: SQLiteVideo | PostgresVideo,
    externalVideosBaseUrl: string
  ): VideoSourcesResult {
    const adaptiveSources: VideoSource[] = [];
    const progressiveSources: VideoSource[] = [];
    const sourcesFormatsAndResolutions = { m3u8: [], mp4: [], webm: [], ogv: [] } as {
      m3u8: string[];
      mp4: string[];
      webm: string[];
      ogv: string[];
    };

    // Return empty sources if video is not published or live
    if (!video.is_published && !video.is_live) {
      return {
        adaptiveSources,
        progressiveSources,
        sourcesFormatsAndResolutions,
      };
    }

    const outputs = JSON.parse(video.outputs) as Record<string, string[]>;
    const manifestType = video.is_streaming ? 'dynamic' : 'static';

    // Build sources for each format
    for (const format in outputs) {
      const resolutions = outputs[format];
      if (!resolutions) {
        continue;
      }

      for (const resolution of resolutions) {
        if (format === 'm3u8') {
          // Adaptive streaming (HLS)
          const src = `${externalVideosBaseUrl}/external/videos/${video.video_id}/adaptive/m3u8/${manifestType}/manifests/manifest-${resolution}.m3u8`;
          const source: VideoSource = { src, type: 'application/vnd.apple.mpegurl' };
          adaptiveSources.push(source);
          sourcesFormatsAndResolutions.m3u8.push(resolution);
        } else {
          // Progressive download
          const src = `${externalVideosBaseUrl}/external/videos/${video.video_id}/progressive/${format}/${resolution}.${format}`;

          let type: string;
          if (format === 'mp4') {
            type = 'video/mp4';
            sourcesFormatsAndResolutions.mp4.push(resolution);
          } else if (format === 'webm') {
            type = 'video/webm';
            sourcesFormatsAndResolutions.webm.push(resolution);
          } else if (format === 'ogv') {
            type = 'video/ogg';
            sourcesFormatsAndResolutions.ogv.push(resolution);
          } else {
            continue;
          }

          const source: VideoSource = { src, type };
          progressiveSources.push(source);
        }
      }
    }

    // Add master playlist for HLS if adaptive sources exist
    if (adaptiveSources.length > 0) {
      const src = `${externalVideosBaseUrl}/external/videos/${video.video_id}/adaptive/m3u8/${manifestType}/manifests/manifest-master.m3u8`;
      const source: VideoSource = { src, type: 'application/vnd.apple.mpegurl' };
      adaptiveSources.unshift(source);
    }

    return {
      adaptiveSources,
      progressiveSources,
      sourcesFormatsAndResolutions,
    };
  }
}
