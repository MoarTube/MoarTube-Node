/**
 * Cluster Master
 *
 * Master process manager for the MoarTube-Node cluster.
 * Handles worker forking, IPC coordination, and periodic tasks.
 */

import cluster from 'node:cluster';
import os from 'node:os';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  LiveStreamWorkerStatsResponseMessage,
  RestartDatabaseMessage,
  LiveStreamWatchingCountsTracker,
  WebSocketMessage,
} from '@/types/index.js';
import { IPCChannel, type IPCLogger } from '@core/cluster/ipc-channel.js';
import { Logger } from '@utils/index.js';
import { getConfig } from '@config/index.js';
import {
  createDatabase,
  initializeDatabaseSchema,
  getDatabase,
} from '@database/index.js';

/**
 * Indexer operations interface
 */
export interface MasterIndexerOperations {
  doIndexUpdate: (data: unknown) => Promise<{ isError: boolean; message?: string }>;
}

/**
 * Cloudflare operations interface
 */
export interface MasterCloudflareOperations {
  purgeAllWatchPages: () => Promise<void>;
  purgeNodePage: () => Promise<void>;
}

/**
 * Optional master configuration for advanced use cases
 */
export interface ClusterMasterOptions {
  /** Logger instance */
  logger?: IPCLogger;
  /** Indexer operations */
  indexer?: MasterIndexerOperations;
  /** Cloudflare operations */
  cloudflare?: MasterCloudflareOperations;
}

/**
 * Get default logger (lazy initialization to ensure Config is loaded)
 */
function getDefaultLogger(): IPCLogger {
  return Logger.getInstance();
}

/**
 * Cluster Master Process Manager
 *
 * Coordinates the cluster, handles IPC, and runs periodic tasks.
 */
export class ClusterMaster {
  private readonly ipc: IPCChannel;
  private readonly logger: IPCLogger;
  private readonly options: ClusterMasterOptions;
  private readonly jwtSecret: string;
  private liveStreamWatchingCountsTracker: LiveStreamWatchingCountsTracker = {};
  private intervalHandles: NodeJS.Timeout[] = [];
  private isRunning = false;

  constructor(options: ClusterMasterOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? getDefaultLogger();
    this.ipc = new IPCChannel(this.logger);
    this.jwtSecret = crypto.randomBytes(32).toString('hex');
  }

  /**
   * Start the cluster master
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const config = getConfig();

    this.logger.info('Starting MoarTube Node cluster master');

    this.logger.info(
      `Configured MoarTube Node to use data directory path: ${config.paths.dataDirectoryPath}`
    );

    // Set up global error handlers
    this.setupErrorHandlers();

    // Initialize database
    await this.initializeDatabase();

    // Ensure node has an ID
    this.ensureNodeId();

    // Set up IPC handlers
    this.setupIPCHandlers();
    this.ipc.startListening();

    // Fork workers
    this.forkWorkers();

    // Set up worker exit handler
    this.setupWorkerExitHandler();

    // Start periodic tasks
    this.startPeriodicTasks();

    this.isRunning = true;

    this.logger.info('Cluster master started');
  }

  /**
   * Stop the cluster master
   */
  stop(): Promise<void> {
    if (!this.isRunning) {
      return Promise.resolve();
    }

    this.logger.info('Stopping cluster master');

    // Clear intervals
    for (const handle of this.intervalHandles) {
      clearInterval(handle);
    }
    this.intervalHandles = [];

    // Gracefully shut down workers
    for (const worker of this.ipc.getWorkers()) {
      worker.kill('SIGTERM');
    }

    this.isRunning = false;
    return Promise.resolve();
  }

  /**
   * Set up global error handlers
   */
  private setupErrorHandlers(): void {
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception in master', error);
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.error('Unhandled rejection in master', reason as Error);
    });
  }

  /**
   * Initialize database connection
   */
  private async initializeDatabase(): Promise<void> {
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

    // Initialize database schema
    await initializeDatabaseSchema();

    this.logger.debug('Database initialized');
  }

  /**
   * Ensure node has an ID
   */
  private ensureNodeId(): void {
    const config = getConfig();
    const nodeSettings = config.nodeSettings as { nodeId?: string };

    if (nodeSettings.nodeId === undefined || nodeSettings.nodeId === '') {
      const newNodeId = uuidv4().replaceAll('-', '');
      config.updateNodeSettings({ nodeId: newNodeId });
      this.logger.info('Generated new node ID');
    }
  }

  /**
   * Set up IPC message handlers
   */
  private setupIPCHandlers(): void {
    // JWT secret request
    this.ipc.on('get_jwt_secret', (_message, worker) => {
      if (worker !== undefined) {
        this.ipc.sendToWorker(worker, {
          cmd: 'get_jwt_secret_response',
          jwtSecret: this.jwtSecret,
        });
      }
    });

    // Node name update
    this.ipc.on('update_node_name', (message) => {
      const nodeName = (message as { nodeName: string }).nodeName;
      this.ipc.broadcast({
        cmd: 'update_node_name_response',
        nodeName,
      });
    });

    // WebSocket broadcast
    this.ipc.on('websocket_broadcast', (message) => {
      const wsMessage = (message as { message: unknown }).message;
      this.ipc.broadcast({
        cmd: 'websocket_broadcast_response',
        message: wsMessage as WebSocketMessage,
      });
    });

    // WebSocket chat broadcast
    this.ipc.on('websocket_broadcast_chat', (message) => {
      const wsMessage = (message as { message: unknown }).message;
      this.ipc.broadcast({
        cmd: 'websocket_broadcast_chat_response',
        message: wsMessage as WebSocketMessage & { videoId: string },
      });
    });

    // Live stream stats response from worker
    this.ipc.on<LiveStreamWorkerStatsResponseMessage>(
      'live_stream_worker_stats_response',
      (message) => {
        this.liveStreamWatchingCountsTracker[message.workerId] = message.liveStreamWatchingCounts;
      }
    );

    // Server restart request
    this.ipc.on('restart_server', () => {
      this.logger.info('Restarting all workers');
      for (const worker of this.ipc.getWorkers()) {
        worker.kill('SIGTERM');
      }
    });

    // Database restart request
    this.ipc.on<RestartDatabaseMessage>('restart_database', async (message) => {
      this.logger.info(`Changing database configuration to: ${message.databaseDialect}`);
      await this.initializeDatabase();
      this.ipc.broadcast({ cmd: 'restart_database_response' });
    });
  }

  /**
   * Fork worker processes
   */
  private forkWorkers(): void {
    const numCPUs = os.cpus().length;

    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    this.logger.info(`Forked ${String(numCPUs)} workers`);
  }

  /**
   * Set up handler for worker exit
   */
  private setupWorkerExitHandler(): void {
    cluster.on('exit', (worker, code, signal) => {
      this.logger.warn(`Worker ${String(worker.id)} exited`, { code, signal });

      // Clean up tracking
      Reflect.deleteProperty(this.liveStreamWatchingCountsTracker, worker.id);

      // Fork replacement worker
      if (this.isRunning) {
        cluster.fork();
      }
    });
  }

  /**
   * Start periodic tasks
   */
  private startPeriodicTasks(): void {
    // Index update task (every 3 seconds)
    const temp1 = setInterval(() => {
      void this.runIndexUpdateTask();
    }, 3000);

    // Request live stream stats from workers (every second)
    const temp2 = setInterval(() => {
      this.ipc.broadcast({ cmd: 'live_stream_worker_stats_request' });
    }, 1000);

    // Broadcast aggregated live stream stats (every second)
    const temp3 = setInterval(() => {
      this.ipc.broadcast({
        cmd: 'live_stream_worker_stats_update',
        liveStreamWatchingCountsTracker: this.liveStreamWatchingCountsTracker,
      });
    }, 1000);

    this.intervalHandles.push(temp1, temp2, temp3);

    // Cloudflare purge task (every 10 minutes)
    if (this.options.cloudflare !== undefined) {
      this.intervalHandles.push(
        setInterval(() => {
          void this.runCloudflarePurgeTask();
        }, 60000 * 10)
      );
    }
  }

  /**
   * Run index update task
   */
  private async runIndexUpdateTask(): Promise<void> {
    if (this.options.indexer === undefined) {
      return;
    }

    try {
      const db = getDatabase();
      let videos: Array<{
        video_id: string;
        title: string;
        tags: string;
        views: number;
        is_streaming: boolean;
        length_seconds: number;
      }> = [];

      if ('all' in db) {
        videos = (db as { all: (sql: string) => typeof videos }).all(
          'SELECT * FROM videos WHERE is_indexed = 1 AND is_index_outdated = 1'
        );
      }

      if (videos.length === 0) {
        return;
      }

      const config = getConfig();

      const nodeIdentification = config.nodeIdentification;

      if(nodeIdentification !== null) {
        for (const video of videos) {
          try {
            const data = {
              videoId: video.video_id,
              title: video.title,
              tags: video.tags,
              views: video.views,
              isStreaming: video.is_streaming,
              lengthSeconds: video.length_seconds,
              nodeIconPngBase64: '',
              nodeAvatarPngBase64: '',
              videoPreviewJpgBase64: '',
              moarTubeTokenProof: nodeIdentification.moarTubeTokenProof,
            };

            const response = await this.options.indexer.doIndexUpdate(data);

            if (response.isError) {
              throw new Error(response.message);
            }

            // Update via direct database access
            if ('run' in db) {
              (db as { run: (sql: string, ...params: unknown[]) => void }).run(
                'UPDATE videos SET is_index_outdated = ? WHERE video_id = ?',
                false,
                video.video_id
              );
            }

            this.logger.debug(`Updated video index: ${video.video_id}`);
          } catch (error) {
            this.logger.error(`Failed to update index for video: ${video.video_id}`, error);
          }
        }
      }
    } catch (error) {
      this.logger.error('Index update task failed', error);
    }
  }

  /**
   * Run Cloudflare purge task
   */
  private async runCloudflarePurgeTask(): Promise<void> {
    try {
      await this.options.cloudflare?.purgeAllWatchPages();
      await this.options.cloudflare?.purgeNodePage();
    } catch (error) {
      this.logger.error('Cloudflare purge task failed', error);
    }
  }
}
