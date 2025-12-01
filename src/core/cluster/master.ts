/**
 * Cluster Master
 *
 * Master process manager for the MoarTube-Node cluster.
 * Handles worker forking, IPC coordination, and periodic tasks.
 */

import cluster from 'node:cluster';
import os from 'node:os';
import crypto from 'node:crypto';
import { Mutex } from 'async-mutex';
import type {
  DatabaseWriteJobMessage,
  LiveStreamWorkerStatsResponseMessage,
  RestartDatabaseMessage,
  LiveStreamWatchingCountsTracker,
} from '../../types/ipc';
import type { WebSocketMessage } from '../../types/websocket';
import { IPCChannel, type IPCLogger } from './ipc-channel';

/**
 * Database operations interface
 */
export interface MasterDatabaseOperations {
  provision: () => Promise<void>;
  open: () => Promise<void>;
  executeWrite: (query: string, parameters: unknown[]) => Promise<void>;
  readAll: <T>(query: string, parameters: unknown[]) => Promise<T[]>;
}

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
 * Node identification interface
 */
export interface NodeIdentification {
  moarTubeTokenProof: string;
}

/**
 * Master configuration
 */
export interface ClusterMasterConfig {
  /** Logger instance */
  logger?: IPCLogger;
  /** Database operations */
  database: MasterDatabaseOperations;
  /** Indexer operations */
  indexer?: MasterIndexerOperations;
  /** Cloudflare operations */
  cloudflare?: MasterCloudflareOperations;
  /** Get node settings */
  getNodeSettings: () => Record<string, unknown>;
  /** Set node settings */
  setNodeSettings: (settings: Record<string, unknown>) => void;
  /** Get node identification */
  getNodeIdentification: () => NodeIdentification;
  /** Perform node identification */
  performNodeIdentification: () => Promise<void>;
  /** Generate video ID */
  generateVideoId: () => Promise<string>;
  /** Get node icon */
  getNodeIconPngBase64: () => string;
  /** Get node avatar */
  getNodeAvatarPngBase64: () => string;
  /** Get video preview */
  getVideoPreviewJpgBase64: (
    nodeSettings: Record<string, unknown>,
    videoId: string
  ) => Promise<string>;
  /** Submit database write job */
  submitDatabaseWriteJob: (query: string, parameters: unknown[]) => Promise<void>;
}

/**
 * Default logger
 */
const defaultLogger: IPCLogger = {
  debug: (message, context) => {
    if (process.env['NODE_ENV'] === 'development') {
      console.debug(`[Master] ${message}`, context ?? '');
    }
  },
  info: (message, context) => {
    console.info(`[Master] ${message}`, context ?? '');
  },
  warn: (message, context) => {
    console.warn(`[Master] ${message}`, context ?? '');
  },
  error: (message, error, context) => {
    console.error(`[Master] ${message}`, error ?? '', context ?? '');
  },
};

/**
 * Cluster Master Process Manager
 *
 * Coordinates the cluster, handles IPC, and runs periodic tasks.
 */
export class ClusterMaster {
  private readonly ipc: IPCChannel;
  private readonly logger: IPCLogger;
  private readonly config: ClusterMasterConfig;
  private readonly mutex = new Mutex();
  private readonly jwtSecret: string;
  private liveStreamWatchingCountsTracker: LiveStreamWatchingCountsTracker = {};
  private intervalHandles: NodeJS.Timeout[] = [];
  private isRunning = false;

  constructor(config: ClusterMasterConfig) {
    this.config = config;
    this.logger = config.logger ?? defaultLogger;
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

    this.logger.info('Starting MoarTube Node cluster master');

    // Set up global error handlers
    this.setupErrorHandlers();

    // Provision database
    await this.config.database.provision();

    // Ensure node has an ID
    await this.ensureNodeId();

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
   * Ensure node has an ID
   */
  private async ensureNodeId(): Promise<void> {
    const nodeSettings = this.config.getNodeSettings() as { nodeId?: string };

    if (nodeSettings.nodeId === undefined || nodeSettings.nodeId === '') {
      nodeSettings.nodeId = await this.config.generateVideoId();
      this.config.setNodeSettings(nodeSettings);
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

    // Database write job
    this.ipc.on<DatabaseWriteJobMessage>('database_write_job', async (message, worker) => {
      const release = await this.mutex.acquire();

      try {
        await this.config.database.executeWrite(message.query, message.parameters);

        if (worker !== undefined) {
          this.ipc.sendToWorker(worker, {
            cmd: 'database_write_job_result',
            databaseWriteJobId: message.databaseWriteJobId,
          });
        }
      } catch (error) {
        if (worker !== undefined) {
          this.ipc.sendToWorker(worker, {
            cmd: 'database_write_job_result',
            databaseWriteJobId: message.databaseWriteJobId,
            error: error as Error,
          });
        }
      } finally {
        release();
      }
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
      this.ipc.broadcast({ cmd: 'restart_server_response' });
    });

    // Database restart request
    this.ipc.on<RestartDatabaseMessage>('restart_database', async (message) => {
      this.logger.info(`Changing database configuration to: ${message.databaseDialect}`);
      await this.config.database.open();
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

    this.logger.info(`Forked ${numCPUs} workers`);
  }

  /**
   * Set up handler for worker exit
   */
  private setupWorkerExitHandler(): void {
    cluster.on('exit', (worker, code, signal) => {
      this.logger.warn(`Worker ${worker.id} exited`, { code, signal });

      // Clean up tracking - use assignment to undefined to avoid dynamic delete
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.liveStreamWatchingCountsTracker[worker.id];

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
    this.intervalHandles.push(
      setInterval(() => {
        void this.runIndexUpdateTask();
      }, 3000)
    );

    // Cloudflare purge task (every 10 minutes)
    if (this.config.cloudflare !== undefined) {
      this.intervalHandles.push(
        setInterval(() => {
          void this.runCloudflarePurgeTask();
        }, 60000 * 10)
      );
    }

    // Request live stream stats from workers (every second)
    this.intervalHandles.push(
      setInterval(() => {
        this.ipc.broadcast({ cmd: 'live_stream_worker_stats_request' });
      }, 1000)
    );

    // Broadcast aggregated live stream stats (every second)
    this.intervalHandles.push(
      setInterval(() => {
        this.ipc.broadcast({
          cmd: 'live_stream_worker_stats_update',
          liveStreamWatchingCountsTracker: this.liveStreamWatchingCountsTracker,
        });
      }, 1000)
    );
  }

  /**
   * Run index update task
   */
  private async runIndexUpdateTask(): Promise<void> {
    if (this.config.indexer === undefined) {
      return;
    }

    try {
      const videos = await this.config.database.readAll<{
        video_id: string;
        title: string;
        tags: string;
        views: number;
        is_streaming: boolean;
        length_seconds: number;
      }>('SELECT * FROM videos WHERE is_indexed = ? AND is_index_outdated = ?', [true, true]);

      if (videos.length === 0) {
        return;
      }

      await this.config.performNodeIdentification();

      const nodeSettings = this.config.getNodeSettings();
      const nodeIdentification = this.config.getNodeIdentification();

      for (const video of videos) {
        try {
          const videoPreviewJpgBase64 = await this.config.getVideoPreviewJpgBase64(
            nodeSettings,
            video.video_id
          );

          const data = {
            videoId: video.video_id,
            title: video.title,
            tags: video.tags,
            views: video.views,
            isStreaming: Boolean(video.is_streaming),
            lengthSeconds: video.length_seconds,
            nodeIconPngBase64: this.config.getNodeIconPngBase64(),
            nodeAvatarPngBase64: this.config.getNodeAvatarPngBase64(),
            videoPreviewJpgBase64,
            moarTubeTokenProof: nodeIdentification.moarTubeTokenProof,
          };

          const response = await this.config.indexer.doIndexUpdate(data);

          if (response.isError) {
            throw new Error(response.message);
          }

          await this.config.submitDatabaseWriteJob(
            'UPDATE videos SET is_index_outdated = ? WHERE video_id = ?',
            [false, video.video_id]
          );

          this.logger.debug(`Updated video index: ${video.video_id}`);
        } catch (error) {
          this.logger.error(`Failed to update index for video: ${video.video_id}`, error as Error);
        }
      }
    } catch (error) {
      this.logger.error('Index update task failed', error as Error);
    }
  }

  /**
   * Run Cloudflare purge task
   */
  private async runCloudflarePurgeTask(): Promise<void> {
    if (this.config.cloudflare === undefined) {
      return;
    }

    try {
      await this.config.cloudflare.purgeAllWatchPages();
      await this.config.cloudflare.purgeNodePage();
    } catch (error) {
      this.logger.error('Cloudflare purge task failed', error as Error);
    }
  }
}
