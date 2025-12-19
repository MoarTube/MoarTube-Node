/**
 * Cluster Worker
 *
 * Worker process for handling HTTP requests and WebSocket connections.
 */

import cluster from 'node:cluster';
import type { FastifyInstance } from 'fastify';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { LiveStreamWatchingCountsTracker, LiveStreamWatchingCounts } from '../../types/ipc.js';
import type { LiveStreamStatsMessage, WebSocketMessage } from '../../types/websocket.js';
import { IPCChannel, type IPCLogger } from './ipc-channel.js';
import { WebSocketManager } from '../../websocket/websocket-manager.js';
import { getContainer } from '../container.js';
import { Logger } from '../../utils/logger.js';
import { getConfig } from '../../config/index.js';
import { createDatabase } from '../../database/index.js';

/**
 * Optional worker configuration for advanced use cases
 */
export interface ClusterWorkerOptions {
  /** Logger instance */
  logger?: IPCLogger;
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
  private readonly wsManager: WebSocketManager;
  private app: FastifyInstance | null = null;
  private wss: WebSocketServer | null = null;
  private isRunning = false;

  constructor(options: ClusterWorkerOptions = {}) {
    this.logger = options.logger ?? getDefaultLogger();
    this.ipc = new IPCChannel(this.logger);

    // Create WebSocketManager (container will be provided later)
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

    // Connect to database
    this.connectDatabase();

    // Initialize Fastify app
    const { createFastifyApp } = await import('../../plugins/index.js');
    this.app = await createFastifyApp();

    // Set container on WebSocketManager now that it's available
    const container = getContainer();
    this.wsManager.setContainer(container);

    // Set up IPC handlers
    this.setupIPCHandlers();
    this.ipc.startListening();

    // Request JWT secret from master
    this.ipc.sendToMaster({ cmd: 'get_jwt_secret' });

    // Start WebSocket heartbeat
    this.wsManager.startHeartbeat();

    // Start HTTP server
    const config = getConfig();
    const port = config.nodeSettings.nodeListeningPort;

    try {
      await this.app.listen({ port, host: '0.0.0.0' });
      this.logger.info(`Worker ${String(cluster.worker?.id)} listening on port ${String(port)}`);

      // Set up WebSocket server
      this.setupWebSocketServer();
    } catch (err) {
      this.logger.error(`Worker ${String(cluster.worker?.id)} failed to start`, err as Error);
      process.exit(1);
    }

    this.isRunning = true;
    this.logger.info('Worker started');
  }

  /**
   * Set up WebSocket server
   */
  private setupWebSocketServer(): void {
    if (!this.app) {
      throw new Error('Fastify app not initialized');
    }

    // Create WebSocket server
    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
    });

    // Handle WebSocket connections
    this.wss.on('connection', (ws, request) => {
      this.logger.debug('WebSocket client connected');

      // Extract IP address
      let ip = request.headers['cf-connecting-ip'] as string;
      if (!ip) {
        ip = (request.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
      }

      // Add client to WebSocket manager
      const client = this.wsManager.addClient(ws, 'viewer', false);
      client.ip = ip;

      // Handle client disconnection
      ws.on('close', () => {
        this.logger.debug('WebSocket client disconnected');
        this.wsManager.removeClient(client);
      });

      // Handle incoming messages
      ws.on('message', (data) => {
        // Convert RawData to Buffer
        let bufferData: Buffer;
        if (Buffer.isBuffer(data)) {
          bufferData = data;
        } else if (data instanceof ArrayBuffer) {
          bufferData = Buffer.from(data);
        } else if (Array.isArray(data)) {
          // Handle array of Buffers/ArrayBuffers
          bufferData = Buffer.concat(
            data.map((item) => (Buffer.isBuffer(item) ? item : Buffer.from(item)))
          );
        } else {
          // Handle string case
          bufferData = Buffer.from(data as string);
        }
        this.wsManager.handleMessage(client, bufferData);
      });
    });

    // Handle HTTP upgrade requests for WebSocket connections
    const server = this.app.server;
    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!this.wss) {
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        if (this.wss) {
          this.wss.emit('connection', ws, request);
        }
      });
    });

    this.logger.info('WebSocket server set up');
  }

  /**
   * Stop the worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping worker');

    // Close HTTP server
    if (this.app) {
      await this.app.close();
    }

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close WebSocket connections
    this.wsManager.closeAll();

    this.isRunning = false;
  }

  /**
   * Connect to database
   */
  private connectDatabase(): void {
    const config = getConfig();

    const dbConfig = config.nodeSettings.databaseConfig;
    const dbDialect = dbConfig.databaseDialect;

    if (dbDialect === 'sqlite') {
      createDatabase({
        dialect: 'sqlite',
        filepath: config.paths.databaseFilePath,
      });
    } else {
      const pgConfig = dbConfig.postgresConfig;

      if (pgConfig === undefined) {
        throw new Error('Postgres configuration is required for postgres database dialect');
      }

      createDatabase({
        dialect: 'postgres',
        connectionString: `postgres://${pgConfig.username}:${pgConfig.password}@${pgConfig.host}:${String(pgConfig.port)}/${pgConfig.databaseName}`,
      });
    }
  }

  /**
   * Set up IPC message handlers
   */
  private setupIPCHandlers(): void {
    // JWT secret response
    this.ipc.on('get_jwt_secret_response', (message) => {
      const jwtSecret = (message as { jwtSecret: string }).jwtSecret;
      const config = getConfig();
      config.setJwtSecret(jwtSecret);
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
      void this.restartHttpServer();
    });

    // Database restart response
    this.ipc.on('restart_database_response', () => {
      this.logger.info('Received database restart request');
      this.connectDatabase();
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

  /**
   * Restart HTTP server
   */
  private async restartHttpServer(): Promise<void> {
    if (this.app) {
      await this.app.close();
    }

    const { createFastifyApp } = await import('../../plugins/index.js');
    this.app = await createFastifyApp();

    const config = getConfig();
    const port = config.nodeSettings.nodeListeningPort;

    await this.app.listen({ port, host: '0.0.0.0' });
    this.logger.info(`Worker ${String(cluster.worker?.id)} restarted on port ${String(port)}`);
  }
}
