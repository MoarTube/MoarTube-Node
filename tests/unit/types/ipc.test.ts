import { describe, it, expect } from 'vitest';
import type {
  IPCCommand,
  IPCMessage,
  GetJwtSecretMessage,
  WebSocketBroadcastMessage,
  LiveStreamWorkerStatsResponseMessage,
  GetJwtSecretResponseMessage,
  LiveStreamWorkerStatsUpdateMessage,
} from '@/types/ipc.js';

describe('types/ipc.ts', () => {
  describe('IPCCommand types', () => {
    it('should accept valid IPC commands', () => {
      const commandsToMaster: IPCCommand[] = [
        'get_jwt_secret',
        'update_node_name',
        'websocket_broadcast',
        'websocket_broadcast_chat',
        'live_stream_worker_stats_response',
        'restart_server',
        'restart_database',
      ];

      const commandsToWorker: IPCCommand[] = [
        'get_jwt_secret_response',
        'update_node_name_response',
        'websocket_broadcast_response',
        'websocket_broadcast_chat_response',
        'live_stream_worker_stats_request',
        'live_stream_worker_stats_update',
        'restart_server_response',
        'restart_database_response',
      ];

      expect(commandsToMaster).toHaveLength(7);
      expect(commandsToWorker).toHaveLength(8);
      expect(commandsToMaster).toContain('get_jwt_secret');
      expect(commandsToWorker).toContain('live_stream_worker_stats_update');
    });
  });

  describe('IPC message types', () => {
    it('should create GetJwtSecretMessage', () => {
      const message: GetJwtSecretMessage = {
        cmd: 'get_jwt_secret',
      };

      expect(message.cmd).toBe('get_jwt_secret');
    });

    it('should create WebSocketBroadcastMessage', () => {
      const message: WebSocketBroadcastMessage = {
        cmd: 'websocket_broadcast',
        message: {
          eventName: 'echo',
          data: {
            eventName: 'test',
            payload: { key: 'value' },
          },
        },
      };

      expect(message.cmd).toBe('websocket_broadcast');
      expect(message.message.eventName).toBe('echo');
    });

    it('should create LiveStreamWorkerStatsResponseMessage', () => {
      const message: LiveStreamWorkerStatsResponseMessage = {
        cmd: 'live_stream_worker_stats_response',
        workerId: 1,
        liveStreamWatchingCounts: {
          'video-1': 25,
          'video-2': 10,
        },
      };

      expect(message.cmd).toBe('live_stream_worker_stats_response');
      expect(message.workerId).toBe(1);
      expect(message.liveStreamWatchingCounts['video-1']).toBe(25);
    });

    it('should create GetJwtSecretResponseMessage', () => {
      const message: GetJwtSecretResponseMessage = {
        cmd: 'get_jwt_secret_response',
        jwtSecret: 'super-secret-jwt-key',
      };

      expect(message.cmd).toBe('get_jwt_secret_response');
      expect(message.jwtSecret).toBe('super-secret-jwt-key');
    });

    it('should create LiveStreamWorkerStatsUpdateMessage', () => {
      const message: LiveStreamWorkerStatsUpdateMessage = {
        cmd: 'live_stream_worker_stats_update',
        liveStreamWatchingCountsTracker: {
          1: { 'video-1': 25 },
          2: { 'video-2': 10 },
        },
      };

      expect(message.cmd).toBe('live_stream_worker_stats_update');
      expect(message.liveStreamWatchingCountsTracker[1]['video-1']).toBe(25);
      expect(message.liveStreamWatchingCountsTracker[2]['video-2']).toBe(10);
    });

    it('should handle IPCMessage union type', () => {
      const messages: IPCMessage[] = [
        { cmd: 'get_jwt_secret' },
        { cmd: 'get_jwt_secret_response', jwtSecret: 'secret' },
        {
          cmd: 'live_stream_worker_stats_response',
          workerId: 1,
          liveStreamWatchingCounts: {},
        },
      ];

      expect(messages).toHaveLength(3);
      expect(messages[0].cmd).toBe('get_jwt_secret');
      expect(messages[1].cmd).toBe('get_jwt_secret_response');
      expect(messages[2].cmd).toBe('live_stream_worker_stats_response');
    });
  });
});