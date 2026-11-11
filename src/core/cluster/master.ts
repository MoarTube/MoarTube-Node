/**
 * Cluster Master
 *
 * Master process manager for the MoarTube-Node cluster.
 * Handles worker forking, IPC coordination, and periodic tasks.
 */

import cluster from 'node:cluster';
import os from 'node:os';
import crypto from 'node:crypto';
import type { Worker } from 'node:cluster';
import type { WorkerCountRequest, WorkerCountSnapshot } from '@/types/ipc.js';
import { getContainer } from '@/core/container.js';
import { withDistributionTransition } from '@/utils/distribution-admission.js';
import type {
  LiveStreamWorkerStatsResponseMessage,
  RestartDatabaseMessage,
  LiveStreamWatchingCountsTracker,
  WebSocketMessage,
} from '@/types/index.js';
import { IPCChannel, type IPCLogger } from '@core/cluster/ipc-channel.js';
import { getConfig } from '@config/index.js';
import { createDatabase, initializeDatabaseSchema } from '@database/index.js';
import type { CloudflareService } from '@services/cloudflare.js';
import { primaryTunnelManager } from '@/services/cloudflare-tunnel-runtime.js';
import type { CloudflareTunnelManager } from '@/services/cloudflare-tunnel.js';
import type { CloudflareTunnelRequestMessage } from '@/types/ipc.js';

/**
 * Cluster Master Process Manager
 *
 * Coordinates the cluster, handles IPC, and runs periodic tasks.
 */
export class ClusterMaster {
  private readonly ipc: IPCChannel;
  private readonly logger: IPCLogger;
  private readonly cloudflare: CloudflareService;
  private readonly jwtSecret: string;
  private liveStreamWatchingCountsTracker: LiveStreamWatchingCountsTracker = {};
  private intervalHandles: NodeJS.Timeout[] = [];
  private isRunning = false;
  private tunnel?: CloudflareTunnelManager;
  private originPort?: string;
  private stopping?: Promise<void>;
  private desiredWorkers = 1;
  private adjustingWorkers = false;
  private readonly retiringWorkers = new Set<number>();

  private workerSnapshot(): WorkerCountSnapshot {
    return {
      workerCount: getConfig().nodeSettings.workerCount,
      runningWorkers: this.ipc.getWorkers().filter((w) => !this.retiringWorkers.has(w.id)).length,
      maxWorkers: Math.max(1, os.cpus().length),
    };
  }

  private async addReadyWorker(added: Worker[]): Promise<void> {
    const worker = cluster.fork();
    added.push(worker);
    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        worker.off('message', onMessage);
        worker.off('exit', onExit);
      };
      const onMessage = (message: { cmd?: string }): void => {
        if (message.cmd === 'worker_http_ready') {
          cleanup();
          resolve();
        }
      };
      const onExit = (): void => {
        cleanup();
        reject(new Error('An additional worker failed to start.'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('An additional worker did not become ready.'));
      }, 20_000);
      worker.on('message', onMessage);
      worker.once('exit', onExit);
    });
  }

  private async removeWorkers(workers: Worker[]): Promise<void> {
    // Mark every removal before sending signals, so exits cannot trigger replacements.
    for (const worker of workers) {
      this.retiringWorkers.add(worker.id);
    }
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((resolve, reject) => {
            if (worker.isDead()) {
              this.retiringWorkers.delete(worker.id);
              resolve();
              return;
            }
            const timer = setTimeout(() => {
              worker.off('exit', onExit);
              reject(
                new Error(
                  'Worker removal could not be confirmed. Refresh settings before retrying.'
                )
              );
            }, 5000);
            const onExit = (): void => {
              clearTimeout(timer);
              resolve();
            };
            worker.once('exit', onExit);
            worker.kill('SIGKILL');
          })
      )
    );
  }

  private async applyWorkerCount(
    message: WorkerCountRequest,
    requester: Worker
  ): Promise<WorkerCountSnapshot> {
    if (this.adjustingWorkers || !this.isRunning) {
      throw new Error('Another worker adjustment or shutdown is in progress.');
    }
    const count = message.workerCount;
    const maximum = Math.max(1, os.cpus().length);
    if (count === undefined || !Number.isInteger(count) || count < 0) {
      throw new Error('Select Automatic or a positive whole-number worker count.');
    }
    const target = count === 0 ? maximum : Math.min(count, maximum);
    this.adjustingWorkers = true;
    try {
      const current = this.ipc.getWorkers().filter((w) => !this.retiringWorkers.has(w.id));
      if (target < current.length) {
        if (message.confirmDecrease !== true) {
          throw new Error(
            'Confirm that lowering the worker count may interrupt requests, playback, and connections.'
          );
        }
        await withDistributionTransition(async () => {
          const videos = getContainer().resolve('videosService');
          for (let offset = 0; ; offset += 100) {
            const page = await videos.getAllVideosData({ limit: 100, offset });
            if (
              page.some(
                (video) =>
                  video.isImporting === true || video.isPublishing === true || video.isStreaming
              )
            ) {
              throw new Error(
                'Stop active imports, publishing jobs, uploads, and live streams before lowering the worker count.'
              );
            }
            if (page.length < 100) {
              break;
            }
          }
          const remove = current
            .filter((w) => w.id !== requester.id)
            .slice(0, current.length - target);
          if (remove.length !== current.length - target) {
            throw new Error('Worker state changed. Please retry.');
          }
          // Save before terminating anything: a failed settings write leaves workers untouched.
          getConfig().updateNodeSettings({ workerCount: count });
          this.desiredWorkers = target;
          await this.removeWorkers(remove);
        }, 'lowering the worker count');
      } else {
        const added: Worker[] = [];
        try {
          await Promise.all(
            Array.from({ length: Math.max(0, target - current.length) }, () =>
              this.addReadyWorker(added)
            )
          );
          if (this.stopping !== undefined) {
            throw new Error('Node is shutting down.');
          }
          if (this.workerSnapshot().runningWorkers !== target) {
            throw new Error('Worker state changed during startup. Please retry.');
          }
          getConfig().updateNodeSettings({ workerCount: count });
          this.desiredWorkers = target;
        } catch (error) {
          await this.removeWorkers(added);
          throw error;
        }
      }
      return this.workerSnapshot();
    } finally {
      this.adjustingWorkers = false;
      // A pre-existing worker may have crashed while additional workers were starting.
      if (this.stopping === undefined) {
        const missing = this.desiredWorkers - this.workerSnapshot().runningWorkers;
        for (let i = 0; i < missing; i++) {
          cluster.fork();
        }
      }
    }
  }

  constructor(logger: IPCLogger, cloudflare: CloudflareService) {
    this.logger = logger;
    this.cloudflare = cloudflare;
    this.ipc = new IPCChannel(this.logger);
    this.jwtSecret = crypto.randomBytes(32).toString('hex');
  }

  /**
   * Start the cluster master
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    const config = getConfig();

    this.logger.info('Starting MoarTube Node cluster master');

    this.logger.info(
      `Running in ${config.runtime.isDevelopment ? 'development' : 'production'} mode`
    );

    this.logger.info(`Data directory path: ${config.paths.dataDirectoryPath}`);

    // Set up global error handlers
    this.setupErrorHandlers();

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
    if (this.stopping !== undefined) {
      return this.stopping;
    }
    if (!this.isRunning) {
      return Promise.resolve();
    }

    this.logger.info('Stopping cluster master');

    // Clear intervals
    for (const handle of this.intervalHandles) {
      clearInterval(handle);
    }
    this.intervalHandles = [];

    // Mark stopped before any exit event can fork replacement workers.
    this.isRunning = false;
    this.stopping = (async (): Promise<void> => {
      try {
        await this.tunnel?.shutdown();
      } finally {
        await Promise.all(
          this.ipc.getWorkers().map(
            (worker) =>
              new Promise<void>((resolve) => {
                if (worker.isDead()) {
                  resolve();
                  return;
                }
                worker.once('exit', () => {
                  resolve();
                });
                worker.kill('SIGTERM');
              })
          )
        );
      }
    })();
    return this.stopping;
  }

  /**
   * Set up global error handlers
   */
  private setupErrorHandlers(): void {
    const shutdown = (): void => {
      void this.stop()
        .then(() => {
          getConfig().cleanup();
          process.exit(0);
        })
        .catch(() => {
          this.logger.error('Node shutdown failed');
          process.exit(1);
        });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception in master', error);
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.error('Unhandled rejection in master', reason as Error);
    });
  }

  /**
   * Initialize database connection (used for database restart)
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

    this.logger.debug('Database re-initialized');
  }

  /**
   * Set up IPC message handlers
   */
  private setupIPCHandlers(): void {
    this.ipc.on<WorkerCountRequest>('worker_count_request', async (message, worker) => {
      if (!worker) {
        return;
      }
      try {
        const operation: unknown = message.operation;
        if (operation !== 'snapshot' && operation !== 'apply') {
          throw new Error('Invalid worker operation.');
        }
        const snapshot =
          message.operation === 'snapshot'
            ? this.workerSnapshot()
            : await this.applyWorkerCount(message, worker);
        this.ipc.sendToWorker(worker, {
          cmd: 'worker_count_response',
          requestId: message.requestId,
          snapshot,
        });
      } catch (error) {
        this.ipc.sendToWorker(worker, {
          cmd: 'worker_count_response',
          requestId: message.requestId,
          error: error instanceof Error ? error.message : 'Unable to change worker count.',
        });
      }
    });
    this.ipc.on('worker_http_ready', (message) => {
      const port = String((message as { port: number | string }).port);
      if (!this.isRunning || this.originPort === port) {
        return;
      }
      this.originPort = port;
      this.tunnel ??= primaryTunnelManager();
      // Tunnel failures are isolated from worker HTTP availability.
      void this.tunnel.reconcile().catch(() => {
        this.logger.warn('Cloudflare Tunnel reconciliation failed');
      });
    });
    this.ipc.on<CloudflareTunnelRequestMessage>(
      'cloudflare_tunnel_request',
      async (message, worker) => {
        if (worker === undefined) {
          return;
        }
        this.tunnel ??= primaryTunnelManager();
        try {
          const tunnel =
            message.operation === 'snapshot' || !this.isRunning || this.originPort === undefined
              ? this.tunnel.snapshot()
              : await (message.operation === 'restart'
                  ? this.tunnel.restart()
                  : message.operation === 'prepare_cdn_clear'
                    ? this.tunnel.prepareCdnClear()
                    : this.tunnel.reconcile());
          this.ipc.sendToWorker(worker, {
            cmd: 'cloudflare_tunnel_response',
            requestId: message.requestId,
            tunnel,
          });
        } catch {
          this.ipc.sendToWorker(worker, {
            cmd: 'cloudflare_tunnel_response',
            requestId: message.requestId,
            tunnel: this.tunnel.snapshot(),
            error: 'Cloudflare Tunnel operation failed.',
          });
        }
      }
    );
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

    // Node headline update
    this.ipc.on('update_node_headline', (message) => {
      const nodeHeadline = (message as { nodeHeadline: string }).nodeHeadline;
      this.ipc.broadcast({
        cmd: 'update_node_headline_response',
        nodeHeadline,
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
    const availableWorkers = Math.max(1, os.cpus().length);
    const configured = getConfig().nodeSettings.workerCount;
    const numCPUs = Math.max(
      1,
      Math.min(
        availableWorkers,
        configured === 0
          ? availableWorkers
          : Number.isInteger(configured) && configured > 0
            ? configured
            : 1
      )
    );

    this.desiredWorkers = numCPUs;
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
      const retiring = this.retiringWorkers.delete(worker.id);
      if (
        this.isRunning &&
        !retiring &&
        this.ipc.getWorkers().filter((w) => w.id !== worker.id && !this.retiringWorkers.has(w.id))
          .length < this.desiredWorkers
      ) {
        cluster.fork();
      }
    });
  }

  /**
   * Start periodic tasks
   */
  private startPeriodicTasks(): void {
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

    this.intervalHandles.push(temp2, temp3);
    this.intervalHandles.push(
      setInterval(() => {
        void this.cloudflare.retryPendingPurges().catch((error: unknown) => {
          this.logger.error('Pending Cloudflare invalidation failed', error);
        });
      }, 10_000)
    );
  }
}
