/**
 * Streams Controller
 *
 * Handles live streaming endpoints.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from '@controllers/base.js';
import type { StreamsService, VideosService, LiveChatService } from '@services/index.js';
import { getConfig } from '@config/index.js';

/**
 * Request body for starting a stream
 */
export interface StartStreamBody {
  title: string;
  description: string;
  tags: string;
  rtmpPort: number;
  uuid: string;
  isRecordingStreamRemotely: boolean;
  isRecordingStreamLocally: boolean;
  networkAddress: string;
  resolution: string;
  videoId?: string;
}

/**
 * Request params with videoId
 */
export interface VideoIdParams {
  videoId: string;
}

/**
 * Request params for segment removal
 */
export interface SegmentRemoveParams {
  videoId: string;
  format: string;
  resolution: string;
}

/**
 * Request body for segment removal
 */
export interface SegmentRemoveBody {
  segmentName: string;
}

/**
 * Request body for chat settings
 */
export interface ChatSettingsBody {
  isChatHistoryEnabled: boolean;
  chatHistoryLimit: number;
}

/**
 * StreamsController class
 *
 * Handles:
 * - Starting streams
 * - Stopping streams
 * - Stream segment management
 * - Stream bandwidth
 * - Chat settings and history
 */
export class StreamsController extends BaseController {
  constructor(
    private readonly videosService: VideosService,
    private readonly liveChatService: LiveChatService,
    private readonly streamService: StreamsService
  ) {
    super('StreamsController');
  }

  /**
   * POST /streams/start
   *
   * Start a new stream or resume an existing one
   */
  startStream = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const {
        title,
        description,
        tags,
        rtmpPort,
        isRecordingStreamRemotely,
        isRecordingStreamLocally,
        networkAddress,
        resolution,
        videoId,
      } = request.body as StartStreamBody;

      const options: {
        title: string;
        description: string;
        tags: string;
        rtmpPort: number;
        isRecordingStreamRemotely: boolean;
        isRecordingStreamLocally: boolean;
        networkAddress: string;
        resolution: string;
        existingVideoId?: string;
      } = {
        title,
        description,
        tags,
        rtmpPort: rtmpPort,
        isRecordingStreamRemotely,
        isRecordingStreamLocally,
        networkAddress,
        resolution,
      };

      if (videoId !== undefined) {
        options.existingVideoId = videoId;
      }

      const result = await this.streamService.startNewStream(options);

      return await this.sendSuccess(reply, { videoId: result.videoId });
    } catch (error) {
      this.logger.error('Start stream failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /streams/:videoId/stop
   *
   * Stop a stream
   */
  stopStream = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      await this.streamService.stopStream(videoId);

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Stop stream failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /streams/:videoId/adaptive/:format/:resolution/segments/remove
   *
   * Remove a segment file
   */
  removeSegment = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId, format, resolution } = request.params as SegmentRemoveParams;
      const { segmentName } = request.body as SegmentRemoveBody;

      // Delete the segment file directly
      const config = getConfig();

      const segmentPath = path.join(
        config.paths.videosDirectoryPath,
        videoId,
        'adaptive',
        format,
        resolution,
        segmentName
      );

      try {
        if (fs.existsSync(segmentPath)) {
          fs.unlinkSync(segmentPath);
        }
      } catch {
        // Ignore file deletion errors
      }

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Remove segment failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /streams/:videoId/bandwidth
   *
   * Get stream bandwidth
   */
  getBandwidth = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const video = await this.videosService.getVideo(videoId);

      if (video === null) {
        return await this.sendError(reply, 'that video does not exist');
      }

      return await this.sendSuccess(reply, { bandwidth: video.bandwidth });
    } catch (error) {
      this.logger.error('Get bandwidth failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /streams/:videoId/chat/settings
   *
   * Update chat settings for a stream
   */
  updateChatSettings = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { isChatHistoryEnabled, chatHistoryLimit } = request.body as ChatSettingsBody;

      const video = await this.videosService.getVideo(videoId);

      if (video === null) {
        return await this.sendError(reply, 'that video does not exist');
      }

      // Update meta with chat settings
      let meta: Record<string, unknown> = {};
      if (video.meta !== '') {
        try {
          meta = JSON.parse(video.meta) as Record<string, unknown>;
        } catch {
          // Invalid JSON
        }
      }

      const chatSettings = (meta['chatSettings'] as Record<string, unknown> | undefined) ?? {};
      chatSettings['isChatHistoryEnabled'] = isChatHistoryEnabled;
      chatSettings['chatHistoryLimit'] = chatHistoryLimit;
      meta['chatSettings'] = chatSettings;

      await this.videosService.updateVideoMeta(videoId, meta);

      // Clean up chat history if disabled or limited
      if (!isChatHistoryEnabled) {
        await this.liveChatService.deleteMessagesForVideo(videoId);
      } else if (chatHistoryLimit > 0) {
        await this.liveChatService.pruneOldMessages(videoId, chatHistoryLimit);
      }

      return await this.sendSuccess(reply);
    } catch (error) {
      this.logger.error('Update chat settings failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /streams/:videoId/chat/history
   *
   * Get chat history for a stream
   */
  getChatHistory = async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      const chatHistory = await this.liveChatService.getRecentMessages(videoId);

      return await this.sendSuccess(reply, { chatHistory });
    } catch (error) {
      this.logger.error('Get chat history failed', error);

      return await this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
