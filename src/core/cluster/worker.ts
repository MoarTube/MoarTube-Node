/**
 * Cluster Worker
 *
 * Worker process for handling HTTP requests and WebSocket connections.
 */

import cluster from 'node:cluster';
import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { LiveStreamWatchingCountsTracker, LiveStreamWatchingCounts } from '../../types/ipc.js';
import type { LiveStreamStatsMessage, WebSocketMessage } from '../../types/websocket.js';
import type { WebSocket as WsWebSocket } from 'ws';
import { IPCChannel, type IPCLogger } from './ipc-channel.js';
import { WebSocketManager } from '../../websocket/websocket-manager.js';
import { Logger } from '../../utils/logger.js';

/**
 * Worker configuration
 */
export interface ClusterWorkerConfig {
  /** Logger instance */
  logger?: IPCLogger;
  /** Open database connection */
  openDatabase: () => Promise<void>;
  /** Restart HTTP server */
  restartHttpServer: () => Promise<void>;
  /** Set JWT secret */
  setJwtSecret: (secret: string) => void;
  /** Get HTTP server */
  getHttpServer: () => HttpServer | HttpsServer | null;
  /** Get WebSocket server clients */
  getWebSocketClients: () => Set<WsWebSocket>;
}

/**
 * Get default logger (lazy initialization to ensure Config is loaded)
 */
function getDefaultLogger(): IPCLogger {
  return new Logger({
    prefix: `Worker ${String(cluster.worker?.id ?? 'unknown')}`,
  });
}

/**
 * Cluster Worker Process Manager
 *
 * Handles HTTP requests and WebSocket connections in a worker process.
 */
export class ClusterWorker {
  private readonly ipc: IPCChannel;
  private readonly logger: IPCLogger;
  private readonly config: ClusterWorkerConfig;
  private readonly wsManager: WebSocketManager;
  private isRunning = false;

  constructor(config: ClusterWorkerConfig) {
    this.config = config;
    this.logger = config.logger ?? getDefaultLogger();
    this.ipc = new IPCChannel(this.logger);
    this.wsManager = new WebSocketManager({ logger: this.logger });
  }

  /**
   * Get the WebSocket manager
   */
  getWebSocketManager(): WebSocketManager {
    return this.wsManager;
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.logger.info('Starting worker');

    // Open database connection
    await this.config.openDatabase();

    // Set up IPC handlers
    this.setupIPCHandlers();
    this.ipc.startListening();

    // Request JWT secret from master
    this.ipc.sendToMaster({ cmd: 'get_jwt_secret' });

    // Start WebSocket heartbeat
    this.wsManager.startHeartbeat();

    this.isRunning = true;
    this.logger.info('Worker started');
  }

  /**
   * Stop the worker
   */
  stop(): Promise<void> {
    if (!this.isRunning) {
      return Promise.resolve();
    }

    this.logger.info('Stopping worker');

    // Close WebSocket connections
    this.wsManager.closeAll();

    this.isRunning = false;
    return Promise.resolve();
  }

  /**
   * Set up IPC message handlers
   */
  private setupIPCHandlers(): void {
    // JWT secret response
    this.ipc.on('get_jwt_secret_response', (message) => {
      const jwtSecret = (message as { jwtSecret: string }).jwtSecret;
      this.config.setJwtSecret(jwtSecret);
      this.logger.debug('Received JWT secret');
    });

    // WebSocket broadcast response
    this.ipc.on('websocket_broadcast_response', (message) => {
      const wsMessage = (message as { message: WebSocketMessage }).message;
      this.wsManager.broadcast(wsMessage);
    });

    // WebSocket chat broadcast response
    this.ipc.on('websocket_broadcast_chat_response', (message) => {
      const wsMessage = (
        message as {
          message: WebSocketMessage & { videoId: string };
        }
      ).message;
      this.wsManager.broadcastToVideo(wsMessage.videoId, wsMessage);
    });

    // Database write job result
    this.ipc.on('database_write_job_result', (message) => {
      const { databaseWriteJobId, error } = message as {
        databaseWriteJobId: string;
        error?: Error | string;
      };

      // This would be handled by the write queue in the database module
      // For now, we emit an event that can be listened to
      this.logger.debug('Database write job completed', { databaseWriteJobId, error });
    });

    // Live stream stats request
    this.ipc.on('live_stream_worker_stats_request', () => {
      const liveStreamWatchingCounts = this.wsManager.getLiveStreamWatchingCounts();

      this.ipc.sendToMaster({
        cmd: 'live_stream_worker_stats_response',
        workerId: cluster.worker?.id ?? 0,
        liveStreamWatchingCounts,
      });
    });

    // Live stream stats update (aggregated from all workers)
    this.ipc.on('live_stream_worker_stats_update', (message) => {
      const { liveStreamWatchingCountsTracker } = message as {
        liveStreamWatchingCountsTracker: LiveStreamWatchingCountsTracker;
      };

      // Aggregate counts across all workers
      const aggregatedCounts: LiveStreamWatchingCounts = {};

      for (const workerCounts of Object.values(liveStreamWatchingCountsTracker)) {
        if (workerCounts !== null && typeof workerCounts === 'object') {
          for (const [videoId, count] of Object.entries(workerCounts as LiveStreamWatchingCounts)) {
            aggregatedCounts[videoId] = (aggregatedCounts[videoId] ?? 0) + count;
          }
        }
      }

      // Send to clients watching each stream
      for (const client of this.wsManager.getClients()) {
        if (client.socketType === 'node_peer' && client.videoId !== undefined) {
          const watchingCount = aggregatedCounts[client.videoId] ?? 0;
          const statsMessage: LiveStreamStatsMessage = {
            eventName: 'live_stream_stats',
            watchingCount,
          };
          this.wsManager.sendTo(client, statsMessage);
        }
      }
    });

    // Server restart response
    this.ipc.on('restart_server_response', () => {
      this.logger.info('Received server restart request');
      void this.config.restartHttpServer();
    });

    // Database restart response
    this.ipc.on('restart_database_response', () => {
      this.logger.info('Received database restart request');
      void this.config.openDatabase();
    });

    // Node name update response
    this.ipc.on('update_node_name_response', (message) => {
      const { nodeName } = message as { nodeName: string };
      this.logger.debug('Node name updated', { nodeName });
      // This could trigger a WebSocket broadcast to clients
    });
  }

  /**
   * Send WebSocket broadcast request to master (for cross-worker broadcast)
   */
  broadcastToAllWorkers(message: WebSocketMessage): void {
    this.ipc.sendToMaster({
      cmd: 'websocket_broadcast',
      message,
    });
  }

  /**
   * Send chat broadcast request to master
   */
  broadcastChatToAllWorkers(message: WebSocketMessage & { videoId: string }): void {
    this.ipc.sendToMaster({
      cmd: 'websocket_broadcast_chat',
      message,
    });
  }

  /**
   * Request server restart across all workers
   */
  requestServerRestart(): void {
    this.ipc.sendToMaster({ cmd: 'restart_server' });
  }

  /**
   * Request database restart across all workers
   */
  requestDatabaseRestart(databaseDialect: 'sqlite' | 'postgres'): void {
    this.ipc.sendToMaster({
      cmd: 'restart_database',
      databaseDialect,
    });
  }

  /**
   * Request node name update broadcast
   */
  requestNodeNameUpdate(nodeName: string): void {
    this.ipc.sendToMaster({
      cmd: 'update_node_name',
      nodeName,
    });
  }
}
