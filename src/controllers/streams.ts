/**
 * Streams Controller
 *
 * Handles live streaming endpoints.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { BaseController } from './base.js';
import type { VideosRepository } from '../database/repositories/videos.js';
import type { LiveChatMessageRepository } from '../database/repositories/live-chat-messages.js';
import type { StreamService } from '../services/stream.js';
import { getConfig } from '../config/index.js';
import {
  isTitleValid,
  isDescriptionValid,
  isTagsValid,
  isPortValid,
  isVideoIdValid,
  isAdaptiveFormatValid,
  isResolutionValid,
  isSegmentNameValid,
  isBooleanValid,
  isNetworkAddressValid,
  isChatHistoryLimitValid,
} from '../utils/index.js';

/**
 * Request body for starting a stream
 */
export interface StartStreamBody {
  title: string;
  description: string;
  tags: string;
  rtmpPort: string;
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
    private readonly videoRepository: VideosRepository,
    private readonly liveChatMessageRepository: LiveChatMessageRepository,
    private readonly streamService: StreamService
  ) {
    super('StreamsController');
  }

  /**
   * POST /streams/start
   *
   * Start a new stream or resume an existing one
   */
  startStream = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const {
        title,
        description,
        tags,
        rtmpPort,
        uuid,
        isRecordingStreamRemotely,
        isRecordingStreamLocally,
        networkAddress,
        resolution,
        videoId = '',
      } = request.body as StartStreamBody;

      // Validate all parameters
      if (!isTitleValid(title)) {
        this.sendError(reply, 'title is not valid');
        return;
      }
      if (!isDescriptionValid(description)) {
        this.sendError(reply, 'description is not valid');
        return;
      }
      if (!isTagsValid(tags)) {
        this.sendError(reply, 'tags are not valid');
        return;
      }
      if (!isPortValid(rtmpPort)) {
        this.sendError(reply, 'rtmp port not valid');
        return;
      }
      if (uuid !== 'moartube') {
        this.sendError(reply, 'uuid not valid');
        return;
      }
      if (!isBooleanValid(isRecordingStreamRemotely)) {
        this.sendError(reply, 'isRecordingStreamRemotely not valid');
        return;
      }
      if (!isBooleanValid(isRecordingStreamLocally)) {
        this.sendError(reply, 'isRecordingStreamLocally not valid');
        return;
      }
      if (!isNetworkAddressValid(networkAddress)) {
        this.sendError(reply, 'networkAddress not valid');
        return;
      }
      if (!isResolutionValid(resolution)) {
        this.sendError(reply, 'resolution not valid');
        return;
      }
      if (!isVideoIdValid(videoId, true)) {
        this.sendError(reply, 'videoId not valid');
        return;
      }

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
        rtmpPort: Number.parseInt(rtmpPort, 10),
        isRecordingStreamRemotely,
        isRecordingStreamLocally,
        networkAddress,
        resolution,
      };

      if (videoId.length > 0) {
        options.existingVideoId = videoId;
      }

      const result = await this.streamService.startNewStream(options);

      this.sendSuccess(reply, { videoId: result.videoId });
    } catch (error) {
      this.logger.error('Start stream failed', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /streams/:videoId/stop
   *
   * Stop a stream
   */
  stopStream = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      if (!isVideoIdValid(videoId, false)) {
        this.sendError(reply, 'video id is not valid');
        return;
      }

      await this.streamService.stopStream(videoId);

      this.sendOk(reply);
    } catch (error) {
      this.logger.error('Stop stream failed', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /streams/:videoId/adaptive/:format/:resolution/segments/remove
   *
   * Remove a segment file
   */
  removeSegment = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { videoId, format, resolution } = request.params as SegmentRemoveParams;
      const { segmentName } = request.body as SegmentRemoveBody;

      if (
        !isVideoIdValid(videoId, false) ||
        !isAdaptiveFormatValid(format) ||
        !isResolutionValid(resolution) ||
        !isSegmentNameValid(segmentName)
      ) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

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

      this.sendOk(reply);
    } catch (error) {
      this.logger.error('Remove segment failed', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /streams/:videoId/bandwidth
   *
   * Get stream bandwidth
   */
  getBandwidth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      if (!isVideoIdValid(videoId, false)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const video = await this.videoRepository.findById(videoId);

      if (video === null) {
        this.sendError(reply, 'that video does not exist');
        return;
      }

      this.sendSuccess(reply, { bandwidth: video.bandwidth });
    } catch (error) {
      this.logger.error('Get bandwidth failed', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * POST /streams/:videoId/chat/settings
   *
   * Update chat settings for a stream
   */
  updateChatSettings = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { videoId } = request.params as VideoIdParams;
      const { isChatHistoryEnabled, chatHistoryLimit } = request.body as ChatSettingsBody;

      if (
        !isVideoIdValid(videoId, false) ||
        !isBooleanValid(isChatHistoryEnabled) ||
        !isChatHistoryLimitValid(chatHistoryLimit)
      ) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const video = await this.videoRepository.findById(videoId);

      if (video === null) {
        this.sendError(reply, 'that video does not exist');
        return;
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

      await this.videoRepository.update(videoId, { meta: JSON.stringify(meta) });

      // Clean up chat history if disabled or limited
      if (!isChatHistoryEnabled) {
        await this.liveChatMessageRepository.deleteByVideoId(videoId);
      } else if (chatHistoryLimit > 0) {
        await this.liveChatMessageRepository.pruneOldMessages(videoId, chatHistoryLimit);
      }

      this.sendOk(reply);
    } catch (error) {
      this.logger.error('Update chat settings failed', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };

  /**
   * GET /streams/:videoId/chat/history
   *
   * Get chat history for a stream
   */
  getChatHistory = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const { videoId } = request.params as VideoIdParams;

      if (!isVideoIdValid(videoId, false)) {
        this.sendError(reply, 'invalid parameters');
        return;
      }

      const chatHistory = await this.liveChatMessageRepository.findByVideoId(videoId);

      this.sendSuccess(reply, { chatHistory });
    } catch (error) {
      this.logger.error('Get chat history failed', error instanceof Error ? error : null);
      this.sendError(reply, 'error communicating with the MoarTube node');
    }
  };
}
