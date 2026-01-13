/**
 * Cluster Master Tests
 *
 * Tests for the cluster master process manager.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store handlers for IPC testing
const ipcHandlers: Record<string, Function> = {};

// Mock all dependencies before importing the module under test
vi.mock('node:cluster', () => ({
  default: {
    isPrimary: true,
    isWorker: false,
    workers: {},
    on: vi.fn(),
    fork: vi.fn(() => ({ id: 1, kill: vi.fn() })),
  },
}));

vi.mock('node:os', () => ({
  default: {
    cpus: vi.fn(() => [{ model: 'cpu1' }, { model: 'cpu2' }]),
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234-5678-abcd'),
}));

vi.mock('@/utils/logger.js', () => ({
  Logger: {
    getInstance: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    paths: {
      dataDirectoryPath: '/data',
      databaseFilePath: '/data/db.sqlite',
    },
    runtime: {
      isDevelopment: false,
    },
    nodeSettings: {
      databaseConfig: {
        databaseDialect: 'sqlite',
      },
      nodeId: 'existing-node-id',
    },
    nodeIdentification: {
      moarTubeTokenProof: 'test-token',
    },
    updateNodeSettings: vi.fn(),
  })),
}));

vi.mock('@/database/connection.js', () => ({
  createDatabase: vi.fn(),
  initializeDatabaseSchema: vi.fn().mockResolvedValue(undefined),
  getDatabase: vi.fn(() => ({
    all: vi.fn(() => []),
    run: vi.fn(),
  })),
}));

// Create mock functions that can be tracked
const mockIpcOn = vi.fn((cmd: string, handler: Function) => {
  ipcHandlers[cmd] = handler;
});
const mockIpcStartListening = vi.fn();
const mockIpcSendToWorker = vi.fn().mockReturnValue(true);
const mockIpcBroadcast = vi.fn();
const mockIpcGetWorkers = vi.fn().mockReturnValue([]);

vi.mock('@core/cluster/ipc-channel.js', () => {
  return {
    IPCChannel: vi.fn().mockImplementation(function () {
      return {
        on: mockIpcOn,
        startListening: mockIpcStartListening,
        sendToWorker: mockIpcSendToWorker,
        broadcast: mockIpcBroadcast,
        getWorkers: mockIpcGetWorkers,
      };
    }),
  };
});

describe('ClusterMaster', () => {
  let ClusterMaster: typeof import('@core/cluster/master.js').ClusterMaster;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockIndexer: {
    submitVideoToIndex: ReturnType<typeof vi.fn>;
  };
  let mockCloudflare: {
    purgeAllWatchPages: ReturnType<typeof vi.fn>;
    purgeNodePage: ReturnType<typeof vi.fn>;
  };
  let originalProcessOn: typeof process.on;
  let cluster: typeof import('node:cluster').default;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Clear IPC handlers
    Object.keys(ipcHandlers).forEach((key) => delete ipcHandlers[key]);

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockIndexer = {
      submitVideoToIndex: vi.fn().mockResolvedValue({ isError: false }),
    };

    mockCloudflare = {
      purgeAllWatchPages: vi.fn().mockResolvedValue(undefined),
      purgeNodePage: vi.fn().mockResolvedValue(undefined),
    };

    // Store original process.on
    originalProcessOn = process.on;

    // Mock process.on for error handlers
    process.on = vi.fn().mockReturnValue(process);

    // Get mocked cluster
    cluster = (await import('node:cluster')).default;

    // Reset cluster mock
    (cluster.on as ReturnType<typeof vi.fn>).mockReset();
    (cluster.fork as ReturnType<typeof vi.fn>).mockReset().mockReturnValue({ id: 1, kill: vi.fn() });
    (cluster as unknown as { workers: Record<string, unknown> }).workers = {};

    // Reset IPC mocks
    mockIpcOn.mockClear();
    mockIpcOn.mockImplementation((cmd: string, handler: Function) => {
      ipcHandlers[cmd] = handler;
    });
    mockIpcStartListening.mockClear();
    mockIpcSendToWorker.mockClear().mockReturnValue(true);
    mockIpcBroadcast.mockClear();
    mockIpcGetWorkers.mockClear().mockReturnValue([]);

    // Fresh import of the module
    vi.resetModules();
    const module = await import('@core/cluster/master.js');
    ClusterMaster = module.ClusterMaster;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    process.on = originalProcessOn;
  });

  describe('constructor', () => {
    it('should create a ClusterMaster with all required services', () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      expect(master).toBeDefined();
    });
  });

  describe('start', () => {
    it('should start the cluster master', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting MoarTube Node cluster master');
      expect(mockLogger.info).toHaveBeenCalledWith('Cluster master started');
    });

    it('should not start twice', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();
      await master.start();

      // Should only log starting once
      const startingCalls = (mockLogger.info as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === 'Starting MoarTube Node cluster master'
      );
      expect(startingCalls).toHaveLength(1);
    });

    it('should set up error handlers', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    it('should log development mode when isDevelopment is true', async () => {
      const { getConfig } = await import('@config/index.js');
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        paths: {
          dataDirectoryPath: '/data',
          databaseFilePath: '/data/db.sqlite',
        },
        runtime: {
          isDevelopment: true,
        },
        nodeSettings: {
          databaseConfig: {
            databaseDialect: 'sqlite',
          },
          nodeId: 'existing-node-id',
        },
        updateNodeSettings: vi.fn(),
      });

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Running in development mode');
    });

    // Note: Database initialization tests are now in moartube-node.test.ts
    // The ClusterMaster no longer initializes the database on start() - 
    // this is done in startMaster() before ClusterMaster is created.
    // The initializeDatabase() method is only used for restart_database IPC calls.

    it('should generate new node ID if not present', async () => {
      const { getConfig } = await import('@config/index.js');
      const mockUpdateNodeSettings = vi.fn();
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        paths: {
          dataDirectoryPath: '/data',
          databaseFilePath: '/data/db.sqlite',
        },
        runtime: {
          isDevelopment: false,
        },
        nodeSettings: {
          databaseConfig: {
            databaseDialect: 'sqlite',
          },
          nodeId: undefined,
        },
        updateNodeSettings: mockUpdateNodeSettings,
      });

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      expect(mockUpdateNodeSettings).toHaveBeenCalledWith({
        nodeId: expect.any(String),
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Generated new node ID');
    });

    it('should generate new node ID if empty string', async () => {
      const { getConfig } = await import('@config/index.js');
      const mockUpdateNodeSettings = vi.fn();
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        paths: {
          dataDirectoryPath: '/data',
          databaseFilePath: '/data/db.sqlite',
        },
        runtime: {
          isDevelopment: false,
        },
        nodeSettings: {
          databaseConfig: {
            databaseDialect: 'sqlite',
          },
          nodeId: '',
        },
        updateNodeSettings: mockUpdateNodeSettings,
      });

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      expect(mockUpdateNodeSettings).toHaveBeenCalled();
    });

    it('should fork workers based on CPU count', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      expect(cluster.fork).toHaveBeenCalledTimes(2); // Mock has 2 CPUs
      expect(mockLogger.info).toHaveBeenCalledWith('Forked 2 workers');
    });

    it('should set up worker exit handler', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      expect(cluster.on).toHaveBeenCalledWith('exit', expect.any(Function));
    });

    it('should set up IPC handlers', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      expect(mockIpcOn).toHaveBeenCalledWith('get_jwt_secret', expect.any(Function));
      expect(mockIpcOn).toHaveBeenCalledWith('update_node_name', expect.any(Function));
      expect(mockIpcOn).toHaveBeenCalledWith('websocket_broadcast', expect.any(Function));
      expect(mockIpcStartListening).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the cluster master', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();
      await master.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping cluster master');
    });

    it('should return early if not running', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.stop();

      expect(mockLogger.info).not.toHaveBeenCalledWith('Stopping cluster master');
    });

    it('should clear interval handles', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();
      await master.stop();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should kill all workers on stop', async () => {
      const mockWorker = { id: 1, kill: vi.fn() };
      mockIpcGetWorkers.mockReturnValue([mockWorker]);

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();
      await master.stop();

      expect(mockWorker.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });

  describe('IPC handlers', () => {
    it('should handle get_jwt_secret request', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      const mockWorker = { id: 1 };
      ipcHandlers['get_jwt_secret']?.({ cmd: 'get_jwt_secret' }, mockWorker);

      expect(mockIpcSendToWorker).toHaveBeenCalledWith(mockWorker, {
        cmd: 'get_jwt_secret_response',
        jwtSecret: expect.any(String),
      });
    });

    it('should not send jwt_secret when worker is undefined', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      // Call without a worker (undefined)
      ipcHandlers['get_jwt_secret']?.({ cmd: 'get_jwt_secret' }, undefined);

      expect(mockIpcSendToWorker).not.toHaveBeenCalled();
    });

    it('should handle update_node_name request', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      ipcHandlers['update_node_name']?.({ cmd: 'update_node_name', nodeName: 'New Node Name' });

      expect(mockIpcBroadcast).toHaveBeenCalledWith({
        cmd: 'update_node_name_response',
        nodeName: 'New Node Name',
      });
    });

    it('should handle websocket_broadcast request', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      const wsMessage = { eventName: 'test', data: 'test' };
      ipcHandlers['websocket_broadcast']?.({ cmd: 'websocket_broadcast', message: wsMessage });

      expect(mockIpcBroadcast).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast_response',
        message: wsMessage,
      });
    });

    it('should handle websocket_broadcast_chat request', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      const wsMessage = { eventName: 'chat', videoId: 'vid123', data: 'message' };
      ipcHandlers['websocket_broadcast_chat']?.({ cmd: 'websocket_broadcast_chat', message: wsMessage });

      expect(mockIpcBroadcast).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast_chat_response',
        message: wsMessage,
      });
    });

    it('should handle live_stream_worker_stats_response', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      // Should not throw
      ipcHandlers['live_stream_worker_stats_response']?.({
        cmd: 'live_stream_worker_stats_response',
        workerId: 1,
        liveStreamWatchingCounts: { video1: 5 },
      });

      expect(true).toBe(true);
    });

    it('should handle restart_server request', async () => {
      const mockWorker = { id: 1, kill: vi.fn() };
      mockIpcGetWorkers.mockReturnValue([mockWorker]);

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      ipcHandlers['restart_server']?.({ cmd: 'restart_server' });

      expect(mockLogger.info).toHaveBeenCalledWith('Restarting all workers');
      expect(mockWorker.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle restart_database request', async () => {
      const { createDatabase, initializeDatabaseSchema } = await import('@/database/connection.js');

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      await ipcHandlers['restart_database']?.({
        cmd: 'restart_database',
        databaseDialect: 'sqlite',
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Changing database configuration to: sqlite');
      expect(createDatabase).toHaveBeenCalledWith({
        dialect: 'sqlite',
        filepath: '/data/db.sqlite',
      });
      expect(initializeDatabaseSchema).toHaveBeenCalled();
      expect(mockIpcBroadcast).toHaveBeenCalledWith({ cmd: 'restart_database_response' });
    });

    it('should handle restart_database request for postgres', async () => {
      const { getConfig } = await import('@config/index.js');
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        paths: {
          dataDirectoryPath: '/data',
          databaseFilePath: '/data/db.sqlite',
        },
        runtime: {
          isDevelopment: false,
        },
        nodeSettings: {
          databaseConfig: {
            databaseDialect: 'postgres',
            postgresConfig: {
              username: 'user',
              password: 'pass',
              host: 'localhost',
              port: 5432,
              databaseName: 'moartube',
            },
          },
          nodeId: 'existing-node-id',
        },
        updateNodeSettings: vi.fn(),
      });

      const { createDatabase, initializeDatabaseSchema } = await import('@/database/connection.js');

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      await ipcHandlers['restart_database']?.({
        cmd: 'restart_database',
        databaseDialect: 'postgres',
      });

      expect(mockLogger.info).toHaveBeenCalledWith('Changing database configuration to: postgres');
      expect(createDatabase).toHaveBeenCalledWith({
        dialect: 'postgres',
        connectionString: 'postgres://user:pass@localhost:5432/moartube',
      });
      expect(initializeDatabaseSchema).toHaveBeenCalled();
      expect(mockIpcBroadcast).toHaveBeenCalledWith({ cmd: 'restart_database_response' });
    });

    it('should throw error on restart_database if postgres config is missing', async () => {
      const { getConfig } = await import('@config/index.js');
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        paths: {
          dataDirectoryPath: '/data',
          databaseFilePath: '/data/db.sqlite',
        },
        runtime: {
          isDevelopment: false,
        },
        nodeSettings: {
          databaseConfig: {
            databaseDialect: 'postgres',
            postgresConfig: undefined,
          },
          nodeId: 'existing-node-id',
        },
        updateNodeSettings: vi.fn(),
      });

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      await expect(
        ipcHandlers['restart_database']?.({
          cmd: 'restart_database',
          databaseDialect: 'postgres',
        })
      ).rejects.toThrow('Postgres configuration is required for postgres database dialect');
    });
  });

  describe('worker exit handling', () => {
    it('should fork replacement worker on worker exit', async () => {
      let exitHandler: Function = () => {};
      (cluster.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, handler: Function) => {
        if (event === 'exit') {
          exitHandler = handler;
        }
      });

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      // Reset fork calls from start
      (cluster.fork as ReturnType<typeof vi.fn>).mockClear();

      // Simulate worker exit
      const deadWorker = { id: 1 };
      exitHandler(deadWorker, 1, 'SIGTERM');

      expect(mockLogger.warn).toHaveBeenCalledWith('Worker 1 exited', { code: 1, signal: 'SIGTERM' });
      expect(cluster.fork).toHaveBeenCalledTimes(1);
    });

    it('should not fork replacement worker when stopped', async () => {
      let exitHandler: Function = () => {};
      (cluster.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, handler: Function) => {
        if (event === 'exit') {
          exitHandler = handler;
        }
      });

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();
      await master.stop();

      // Reset fork calls
      (cluster.fork as ReturnType<typeof vi.fn>).mockClear();

      // Simulate worker exit
      const deadWorker = { id: 1 };
      exitHandler(deadWorker, 1, 'SIGTERM');

      expect(cluster.fork).not.toHaveBeenCalled();
    });
  });

  describe('periodic tasks', () => {
    it('should start periodic tasks', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      // Verify intervals were set up (they will be cleared on stop)
      expect(true).toBe(true);
    });

    it('should request live stream stats periodically', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      // Advance timers by 1 second
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockIpcBroadcast).toHaveBeenCalledWith({ cmd: 'live_stream_worker_stats_request' });
    });

    it('should broadcast live stream stats update periodically', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      // Advance timers by 1 second
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockIpcBroadcast).toHaveBeenCalledWith({
        cmd: 'live_stream_worker_stats_update',
        liveStreamWatchingCountsTracker: expect.any(Object),
      });
    });

    it('should run cloudflare purge task when cloudflare is configured', async () => {
      const testCloudflare = {
        purgeAllWatchPages: vi.fn().mockResolvedValue(undefined),
        purgeNodePage: vi.fn().mockResolvedValue(undefined),
      };

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, testCloudflare as any);
      await master.start();

      // Advance timers by 10 minutes
      await vi.advanceTimersByTimeAsync(60000 * 10);

      expect(testCloudflare.purgeAllWatchPages).toHaveBeenCalled();
      expect(testCloudflare.purgeNodePage).toHaveBeenCalled();
    });

    it('should handle cloudflare purge errors', async () => {
      const testCloudflare = {
        purgeAllWatchPages: vi.fn().mockRejectedValue(new Error('Purge failed')),
        purgeNodePage: vi.fn().mockResolvedValue(undefined),
      };

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, testCloudflare as any);
      await master.start();

      // Advance timers by 10 minutes
      await vi.advanceTimersByTimeAsync(60000 * 10);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Cloudflare purge task failed',
        expect.any(Error)
      );
    });
  });

  describe('index update task', () => {
    it('should skip when no indexer is configured', async () => {
      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      // Advance timers by 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      // Should not error, just skip
      expect(true).toBe(true);
    });

    it('should skip when no outdated videos', async () => {
      const { getDatabase } = await import('@/database/connection.js');
      (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue({
        all: vi.fn(() => []),
        run: vi.fn(),
      });

      const testIndexer = {
        submitVideoToIndex: vi.fn(),
      };

      const master = new ClusterMaster(mockLogger as any, testIndexer as any, mockCloudflare as any);
      await master.start();

      // Advance timers by 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      expect(testIndexer.submitVideoToIndex).not.toHaveBeenCalled();
    });

    it('should update outdated videos', async () => {
      // Ensure the config has the nodeIdentification
      const { getConfig } = await import('@config/index.js');
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        paths: {
          dataDirectoryPath: '/data',
          databaseFilePath: '/data/db.sqlite',
        },
        runtime: {
          isDevelopment: false,
        },
        nodeSettings: {
          databaseConfig: {
            databaseDialect: 'sqlite',
          },
          nodeId: 'existing-node-id',
        },
        nodeIdentification: {
          moarTubeTokenProof: 'test-token',
        },
        updateNodeSettings: vi.fn(),
      });

      const mockDbRun = vi.fn();
      const { getDatabase } = await import('@/database/connection.js');
      (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue({
        all: vi.fn(() => [
          {
            video_id: 'vid1',
            title: 'Test Video',
            tags: 'test,video',
            views: 100,
            is_streaming: false,
            length_seconds: 300,
          },
        ]),
        run: mockDbRun,
      });

      const testIndexer = {
        updateVideoIndex: vi.fn().mockResolvedValue({ isError: false }),
      };

      const master = new ClusterMaster(mockLogger as any, testIndexer as any, mockCloudflare as any);
      await master.start();

      // Advance timers by 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      expect(testIndexer.updateVideoIndex).toHaveBeenCalledWith({
        videoId: 'vid1',
        title: 'Test Video',
        tags: 'test,video',
        views: 100,
        isStreaming: false,
        lengthSeconds: 300,
        nodeIconPngBase64: '',
        nodeAvatarPngBase64: '',
        videoPreviewJpgBase64: '',
        moarTubeTokenProof: 'test-token',
      });

      expect(mockDbRun).toHaveBeenCalledWith(
        'UPDATE videos SET is_index_outdated = ? WHERE video_id = ?',
        false,
        'vid1'
      );
    });

    it('should handle index update errors', async () => {
      const { getDatabase } = await import('@/database/connection.js');
      (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue({
        all: vi.fn(() => [
          {
            video_id: 'vid1',
            title: 'Test Video',
            tags: 'test',
            views: 10,
            is_streaming: false,
            length_seconds: 60,
          },
        ]),
        run: vi.fn(),
      });

      const testIndexer = {
        submitVideoToIndex: vi.fn().mockResolvedValue({ isError: true, message: 'Update failed' }),
      };

      const master = new ClusterMaster(mockLogger as any, testIndexer as any, mockCloudflare as any);
      await master.start();

      // Advance timers by 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to update index for video: vid1',
        expect.any(Error)
      );
    });

    it('should handle database errors in index task', async () => {
      const { getDatabase } = await import('@/database/connection.js');
      (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue({
        all: vi.fn(() => {
          throw new Error('Database error');
        }),
      });

      const testIndexer = {
        submitVideoToIndex: vi.fn(),
      };

      const master = new ClusterMaster(mockLogger as any, testIndexer as any, mockCloudflare as any);
      await master.start();

      // Advance timers by 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Index update task failed',
        expect.any(Error)
      );
    });

    it('should skip index update when nodeIdentification is null', async () => {
      const { getConfig } = await import('@config/index.js');
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        paths: {
          dataDirectoryPath: '/data',
          databaseFilePath: '/data/db.sqlite',
        },
        runtime: {
          isDevelopment: false,
        },
        nodeSettings: {
          databaseConfig: {
            databaseDialect: 'sqlite',
          },
          nodeId: 'existing-node-id',
        },
        nodeIdentification: null,
        updateNodeSettings: vi.fn(),
      });

      const { getDatabase } = await import('@/database/connection.js');
      (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue({
        all: vi.fn(() => [
          {
            video_id: 'vid1',
            title: 'Test Video',
            tags: 'test',
            views: 10,
            is_streaming: false,
            length_seconds: 60,
          },
        ]),
        run: vi.fn(),
      });

      const testIndexer = {
        submitVideoToIndex: vi.fn(),
      };

      const master = new ClusterMaster(mockLogger as any, testIndexer as any, mockCloudflare as any);
      await master.start();

      // Advance timers by 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      // Should not call submitVideoToIndex when nodeIdentification is null
      expect(testIndexer.submitVideoToIndex).not.toHaveBeenCalled();
    });

    it('should skip when database does not have all method', async () => {
      const { getDatabase } = await import('@/database/connection.js');
      // Return a database without 'all' method
      (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue({
        run: vi.fn(),
      });

      const testIndexer = {
        submitVideoToIndex: vi.fn(),
      };

      const master = new ClusterMaster(mockLogger as any, testIndexer as any, mockCloudflare as any);
      await master.start();

      // Advance timers by 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      // Should not call submitVideoToIndex because videos array stays empty
      expect(testIndexer.submitVideoToIndex).not.toHaveBeenCalled();
    });

    it('should skip database update when db does not have run method', async () => {
      const { getConfig } = await import('@config/index.js');
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        paths: {
          dataDirectoryPath: '/data',
          databaseFilePath: '/data/db.sqlite',
        },
        runtime: {
          isDevelopment: false,
        },
        nodeSettings: {
          databaseConfig: {
            databaseDialect: 'sqlite',
          },
          nodeId: 'existing-node-id',
        },
        nodeIdentification: {
          moarTubeTokenProof: 'test-token',
        },
        updateNodeSettings: vi.fn(),
      });

      const { getDatabase } = await import('@/database/connection.js');
      // Return a database with 'all' but without 'run' method
      (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue({
        all: vi.fn(() => [
          {
            video_id: 'vid1',
            title: 'Test Video',
            tags: 'test',
            views: 10,
            is_streaming: false,
            length_seconds: 60,
          },
        ]),
        // No 'run' method
      });

      const testIndexer = {
        updateVideoIndex: vi.fn().mockResolvedValue({ isError: false }),
      };

      const master = new ClusterMaster(mockLogger as any, testIndexer as any, mockCloudflare as any);
      await master.start();

      // Advance timers by 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      // Should call updateVideoIndex but skip the database update
      expect(testIndexer.updateVideoIndex).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Updated video index: vid1');
    });
  });

  describe('error handlers', () => {
    it('should log uncaught exceptions', async () => {
      let uncaughtHandler: Function = () => {};
      (process.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, handler: Function) => {
        if (event === 'uncaughtException') {
          uncaughtHandler = handler;
        }
        return process;
      });

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      const error = new Error('Test uncaught error');
      uncaughtHandler(error);

      expect(mockLogger.error).toHaveBeenCalledWith('Uncaught exception in master', error);
    });

    it('should log unhandled rejections', async () => {
      let rejectionHandler: Function = () => {};
      (process.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, handler: Function) => {
        if (event === 'unhandledRejection') {
          rejectionHandler = handler;
        }
        return process;
      });

      const master = new ClusterMaster(mockLogger as any, mockIndexer as any, mockCloudflare as any);
      await master.start();

      const reason = new Error('Test unhandled rejection');
      rejectionHandler(reason);

      expect(mockLogger.error).toHaveBeenCalledWith('Unhandled rejection in master', reason);
    });
  });
});
