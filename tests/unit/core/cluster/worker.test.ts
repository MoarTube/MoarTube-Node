/**
 * Cluster Worker Tests
 *
 * Tests for the cluster worker process that handles HTTP/WebSocket requests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store handlers for IPC testing
const ipcHandlers: Record<string, Function> = {};

// Mock all dependencies
vi.mock('node:cluster', () => ({
  default: {
    isPrimary: false,
    isWorker: true,
    worker: {
      id: 1,
    },
  },
}));

vi.mock('@/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(function () {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }),
}));

const mockSetJwtSecret = vi.fn();

vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(() => ({
    paths: {
      dataDirectoryPath: '/data',
      databaseFilePath: '/data/db.sqlite',
    },
    nodeSettings: {
      databaseConfig: {
        databaseDialect: 'sqlite',
      },
      nodeId: 'test-node-id',
      nodeListeningPort: 3000,
    },
    setJwtSecret: mockSetJwtSecret,
  })),
}));

vi.mock('@/database/index.js', () => ({
  createDatabase: vi.fn(),
}));

// Create mockable WebSocketManager
const mockWsBroadcast = vi.fn();
const mockWsBroadcastToRoom = vi.fn();
const mockWsBroadcastToVideo = vi.fn();
const mockWsGetCurrentConnectionCounts = vi.fn().mockReturnValue({});
const mockWsGetLiveStreamWatchingCounts = vi.fn().mockReturnValue({});
const mockWsGetClients = vi.fn().mockReturnValue([]);
const mockWsSendTo = vi.fn();
const mockWsSetJwtSecret = vi.fn();
const mockWsStartHeartbeat = vi.fn();
const mockWsSetContainer = vi.fn();
const mockWsAddClient = vi.fn().mockReturnValue({ ip: '' });
const mockWsRemoveClient = vi.fn();
const mockWsHandleMessage = vi.fn();
const mockWsCloseAll = vi.fn();

vi.mock('@websocket/websocket-manager.js', () => ({
  WebSocketManager: vi.fn().mockImplementation(function () {
    return {
      broadcast: mockWsBroadcast,
      broadcastToRoom: mockWsBroadcastToRoom,
      broadcastToVideo: mockWsBroadcastToVideo,
      getCurrentConnectionCounts: mockWsGetCurrentConnectionCounts,
      getLiveStreamWatchingCounts: mockWsGetLiveStreamWatchingCounts,
      getClients: mockWsGetClients,
      sendTo: mockWsSendTo,
      setJwtSecret: mockWsSetJwtSecret,
      startHeartbeat: mockWsStartHeartbeat,
      setContainer: mockWsSetContainer,
      addClient: mockWsAddClient,
      removeClient: mockWsRemoveClient,
      handleMessage: mockWsHandleMessage,
      closeAll: mockWsCloseAll,
    };
  }),
}));

vi.mock('@core/container.js', () => ({
  getContainer: vi.fn(() => ({
    cradle: {
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    },
  })),
}));

// Create mock functions for IPC
const mockIpcOn = vi.fn((cmd: string, handler: Function) => {
  ipcHandlers[cmd] = handler;
});
const mockIpcStartListening = vi.fn();
const mockIpcSendToMaster = vi.fn();
const mockIpcGetWorkerId = vi.fn().mockReturnValue(1);

vi.mock('@core/cluster/ipc-channel.js', () => {
  return {
    IPCChannel: vi.fn().mockImplementation(function () {
      return {
        on: mockIpcOn,
        startListening: mockIpcStartListening,
        sendToMaster: mockIpcSendToMaster,
        getWorkerId: mockIpcGetWorkerId,
      };
    }),
  };
});

// Mock Fastify
const mockFastifyListen = vi.fn().mockResolvedValue(undefined);
const mockFastifyClose = vi.fn().mockResolvedValue(undefined);
const mockFastifyServerHandlers: Record<string, Function> = {};
const mockFastifyServer = {
  on: vi.fn((event: string, handler: Function) => {
    mockFastifyServerHandlers[event] = handler;
  }),
};

vi.mock('@plugins/index.js', () => ({
  createFastifyApp: vi.fn(async () => ({
    listen: mockFastifyListen,
    close: mockFastifyClose,
    server: mockFastifyServer,
    register: vi.fn(),
    addHook: vi.fn(),
    decorateRequest: vi.fn(),
  })),
}));

// Mock WebSocket server handlers storage
const mockWssHandlers: Record<string, Function> = {};
const mockWssClose = vi.fn();
const mockWssHandleUpgrade = vi.fn();
const mockWssEmit = vi.fn();
vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(function () {
    return {
      on: vi.fn((event: string, handler: Function) => {
        mockWssHandlers[event] = handler;
      }),
      close: mockWssClose,
      handleUpgrade: mockWssHandleUpgrade,
      emit: mockWssEmit,
    };
  }),
}));

describe('ClusterWorker', () => {
  let ClusterWorker: typeof import('@core/cluster/worker.js').ClusterWorker;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let originalProcessOn: typeof process.on;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Clear IPC handlers
    Object.keys(ipcHandlers).forEach((key) => delete ipcHandlers[key]);

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Store originals
    originalProcessOn = process.on;

    // Mock process
    process.on = vi.fn().mockReturnValue(process);

    // Reset config mock to default
    const { getConfig } = await import('@config/index.js');
    mockSetJwtSecret.mockClear();
    (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      paths: {
        dataDirectoryPath: '/data',
        databaseFilePath: '/data/db.sqlite',
      },
      nodeSettings: {
        databaseConfig: {
          databaseDialect: 'sqlite',
        },
        nodeId: 'test-node-id',
        nodeListeningPort: 3000,
      },
      setJwtSecret: mockSetJwtSecret,
    });

    // Reset IPC mocks
    mockIpcOn.mockClear();
    mockIpcOn.mockImplementation((cmd: string, handler: Function) => {
      ipcHandlers[cmd] = handler;
    });
    mockIpcStartListening.mockClear();
    mockIpcSendToMaster.mockClear();
    mockIpcGetWorkerId.mockClear().mockReturnValue(1);

    // Reset WebSocket mocks
    mockWsBroadcast.mockClear();
    mockWsBroadcastToRoom.mockClear();
    mockWsBroadcastToVideo.mockClear();
    mockWsGetCurrentConnectionCounts.mockClear().mockReturnValue({});
    mockWsGetLiveStreamWatchingCounts.mockClear().mockReturnValue({});
    mockWsGetClients.mockClear().mockReturnValue([]);
    mockWsSendTo.mockClear();
    mockWsSetJwtSecret.mockClear();
    mockWsStartHeartbeat.mockClear();
    mockWsSetContainer.mockClear();

    // Reset WebSocketServer mocks
    mockWssClose.mockClear();
    mockWssHandleUpgrade.mockClear();
    mockWssEmit.mockClear();
    Object.keys(mockWssHandlers).forEach((key) => delete mockWssHandlers[key]);

    // Reset Fastify server mocks
    Object.keys(mockFastifyServerHandlers).forEach((key) => delete mockFastifyServerHandlers[key]);

    // Reset Fastify mocks (including mock implementations)
    mockFastifyListen.mockReset().mockResolvedValue(undefined);
    mockFastifyClose.mockReset().mockResolvedValue(undefined);

    // Fresh import of the module (don't reset modules to preserve mock state)
    const module = await import('@core/cluster/worker.js');
    ClusterWorker = module.ClusterWorker;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.on = originalProcessOn;
  });

  describe('constructor', () => {
    it('should create a ClusterWorker with default options', () => {
      const worker = new ClusterWorker();
      expect(worker).toBeDefined();
    });

    it('should create a ClusterWorker with custom logger', () => {
      const worker = new ClusterWorker(mockLogger as any);
      expect(worker).toBeDefined();
    });
  });

  describe('getWebSocketManager', () => {
    it('should return the WebSocket manager', () => {
      const worker = new ClusterWorker(mockLogger as any);
      const wsManager = worker.getWebSocketManager();
      expect(wsManager).toBeDefined();
    });
  });

  describe('start', () => {
    it('should start the worker', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting worker');
      expect(mockLogger.info).toHaveBeenCalledWith('Worker started');
    });

    it('should not start twice', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();
      await worker.start();

      const startingCalls = (mockLogger.info as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === 'Starting worker'
      );
      expect(startingCalls).toHaveLength(1);
    });

    it('should connect to database for SQLite', async () => {
      const { createDatabase } = await import('@/database/index.js');

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      expect(createDatabase).toHaveBeenCalledWith({
        dialect: 'sqlite',
        filepath: '/data/db.sqlite',
      });
    });

    it('should connect to database for PostgreSQL', async () => {
      const { getConfig } = await import('@config/index.js');
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        paths: {
          dataDirectoryPath: '/data',
          databaseFilePath: '/data/db.sqlite',
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
          nodeId: 'test-node-id',
          nodeListeningPort: 3000,
        },
      });

      const { createDatabase } = await import('@/database/index.js');

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      expect(createDatabase).toHaveBeenCalledWith({
        dialect: 'postgres',
        connectionString: 'postgres://user:pass@localhost:5432/moartube',
      });
    });

    it('should throw error if postgres config is missing', async () => {
      const { getConfig } = await import('@config/index.js');
      (getConfig as ReturnType<typeof vi.fn>).mockReturnValue({
        paths: {
          dataDirectoryPath: '/data',
          databaseFilePath: '/data/db.sqlite',
        },
        nodeSettings: {
          databaseConfig: {
            databaseDialect: 'postgres',
            postgresConfig: undefined,
          },
          nodeListeningPort: 3000,
        },
      });

      const worker = new ClusterWorker(mockLogger as any);

      await expect(worker.start()).rejects.toThrow(
        'Postgres configuration is required for postgres database dialect'
      );
    });

    it('should request JWT secret from master', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      expect(mockIpcSendToMaster).toHaveBeenCalledWith({ cmd: 'get_jwt_secret' });
    });

    it('should set up IPC handlers', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      expect(mockIpcOn).toHaveBeenCalledWith('get_jwt_secret_response', expect.any(Function));
      expect(mockIpcOn).toHaveBeenCalledWith('websocket_broadcast_response', expect.any(Function));
      expect(mockIpcStartListening).toHaveBeenCalled();
    });

    it('should start HTTP server', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      expect(mockFastifyListen).toHaveBeenCalledWith({ port: 3000, host: '0.0.0.0' });
    });

    it('should start WebSocket heartbeat', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      expect(mockWsStartHeartbeat).toHaveBeenCalled();
    });

    it('should set container on WebSocketManager', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      expect(mockWsSetContainer).toHaveBeenCalled();
    });

    it('should handle server start failure', async () => {
      mockFastifyListen.mockRejectedValueOnce(new Error('Address in use'));

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exited');
      });

      const worker = new ClusterWorker(mockLogger as any);

      await expect(worker.start()).rejects.toThrow('Process exited');
      expect(mockLogger.error).toHaveBeenCalled();

      mockExit.mockRestore();
    });

    it('should set up WebSocket server connection handler', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      // Verify WebSocket server handlers are registered
      expect(mockWssHandlers['connection']).toBeDefined();
    });

    it('should handle HTTP upgrade requests', async () => {
      mockWssHandleUpgrade.mockImplementation(
        (req: unknown, socket: unknown, head: unknown, callback: Function) => {
          callback({});
        }
      );

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      // Simulate an upgrade request
      const mockSocket = { destroy: vi.fn() };
      const mockRequest = { headers: {} };
      const mockHead = Buffer.from('');

      // Trigger the upgrade handler
      if (mockFastifyServerHandlers['upgrade']) {
        mockFastifyServerHandlers['upgrade'](mockRequest, mockSocket, mockHead);
        expect(mockWssHandleUpgrade).toHaveBeenCalled();
      }
    });

    it('should destroy socket when wss is null during upgrade', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      // Store the upgrade handler
      const upgradeHandler = mockFastifyServerHandlers['upgrade'];
      expect(upgradeHandler).toBeDefined();

      // Stop the worker to set wss to null
      await worker.stop();

      // Now simulate an upgrade request when wss is null
      const mockSocket = { destroy: vi.fn() };
      const mockRequest = { headers: {} };
      const mockHead = Buffer.from('');

      // Trigger the upgrade handler - wss is now null
      upgradeHandler(mockRequest, mockSocket, mockHead);

      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should log error and return early when server is not available for WebSocket upgrade', async () => {
      // Import the mocked createFastifyApp
      const { createFastifyApp } = await import('@plugins/index.js');
      const mockedCreateFastifyApp = vi.mocked(createFastifyApp);

      // Temporarily mock createFastifyApp to return an app without a server
      mockedCreateFastifyApp.mockResolvedValueOnce({
        listen: mockFastifyListen,
        close: mockFastifyClose,
        server: undefined as any, // No server available
        register: vi.fn(),
        addHook: vi.fn(),
        decorateRequest: vi.fn(),
      } as any);

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      // Should have logged an error about server not being available
      expect(mockLogger.error).toHaveBeenCalledWith('Server not available for WebSocket upgrade handling');

      // No upgrade handler should have been registered
      expect(mockFastifyServerHandlers['upgrade']).toBeUndefined();
    });
  });

  describe('WebSocket handling', () => {
    it('should handle WebSocket connection', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      // Simulate a WebSocket connection
      const mockWsOn = vi.fn();
      const mockWs = {
        on: mockWsOn,
      };
      const mockRequest = {
        headers: { 'cf-connecting-ip': '1.2.3.4' },
        socket: { remoteAddress: '192.168.1.1' },
      };

      // Trigger the connection handler
      if (mockWssHandlers['connection']) {
        mockWssHandlers['connection'](mockWs, mockRequest);
        expect(mockWsAddClient).toHaveBeenCalledWith(mockWs, 'viewer', false);
        expect(mockLogger.debug).toHaveBeenCalledWith('WebSocket client connected');
      }
    });

    it('should handle WebSocket connection without cf-connecting-ip', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const mockWsOn = vi.fn();
      const mockWs = {
        on: mockWsOn,
      };
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '::ffff:192.168.1.1' },
      };

      if (mockWssHandlers['connection']) {
        mockWssHandlers['connection'](mockWs, mockRequest);
        expect(mockWsAddClient).toHaveBeenCalled();
      }
    });

    it('should handle WebSocket connection with undefined remoteAddress', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const mockWsOn = vi.fn();
      const mockWs = {
        on: mockWsOn,
      };
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: undefined },
      };

      if (mockWssHandlers['connection']) {
        mockWssHandlers['connection'](mockWs, mockRequest);
        expect(mockWsAddClient).toHaveBeenCalled();
      }
    });

    it('should handle WebSocket client disconnection', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const wsEventHandlers: Record<string, Function> = {};
      const mockWs = {
        on: vi.fn((event: string, handler: Function) => {
          wsEventHandlers[event] = handler;
        }),
      };
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };

      const mockClient = { ip: '' };
      mockWsAddClient.mockReturnValue(mockClient);

      if (mockWssHandlers['connection']) {
        mockWssHandlers['connection'](mockWs, mockRequest);

        // Trigger close handler
        if (wsEventHandlers['close']) {
          wsEventHandlers['close']();
          expect(mockLogger.debug).toHaveBeenCalledWith('WebSocket client disconnected');
          expect(mockWsRemoveClient).toHaveBeenCalledWith(mockClient);
        }
      }
    });

    it('should handle WebSocket messages (Buffer)', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const wsEventHandlers: Record<string, Function> = {};
      const mockWs = {
        on: vi.fn((event: string, handler: Function) => {
          wsEventHandlers[event] = handler;
        }),
      };
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };

      const mockClient = { ip: '' };
      mockWsAddClient.mockReturnValue(mockClient);

      if (mockWssHandlers['connection']) {
        mockWssHandlers['connection'](mockWs, mockRequest);

        // Trigger message handler with Buffer
        if (wsEventHandlers['message']) {
          const data = Buffer.from('test message');
          wsEventHandlers['message'](data);
          expect(mockWsHandleMessage).toHaveBeenCalledWith(mockClient, data);
        }
      }
    });

    it('should handle WebSocket messages (ArrayBuffer)', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const wsEventHandlers: Record<string, Function> = {};
      const mockWs = {
        on: vi.fn((event: string, handler: Function) => {
          wsEventHandlers[event] = handler;
        }),
      };
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };

      const mockClient = { ip: '' };
      mockWsAddClient.mockReturnValue(mockClient);

      if (mockWssHandlers['connection']) {
        mockWssHandlers['connection'](mockWs, mockRequest);

        // Trigger message handler with ArrayBuffer
        if (wsEventHandlers['message']) {
          const arrayBuffer = new ArrayBuffer(8);
          wsEventHandlers['message'](arrayBuffer);
          expect(mockWsHandleMessage).toHaveBeenCalled();
        }
      }
    });

    it('should handle WebSocket messages (string)', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const wsEventHandlers: Record<string, Function> = {};
      const mockWs = {
        on: vi.fn((event: string, handler: Function) => {
          wsEventHandlers[event] = handler;
        }),
      };
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };

      const mockClient = { ip: '' };
      mockWsAddClient.mockReturnValue(mockClient);

      if (mockWssHandlers['connection']) {
        mockWssHandlers['connection'](mockWs, mockRequest);

        // Trigger message handler with string
        if (wsEventHandlers['message']) {
          const data = 'test string message';
          wsEventHandlers['message'](data);
          expect(mockWsHandleMessage).toHaveBeenCalled();
        }
      }
    });

    it('should handle WebSocket messages (array of Buffers)', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const wsEventHandlers: Record<string, Function> = {};
      const mockWs = {
        on: vi.fn((event: string, handler: Function) => {
          wsEventHandlers[event] = handler;
        }),
      };
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };

      const mockClient = { ip: '' };
      mockWsAddClient.mockReturnValue(mockClient);

      if (mockWssHandlers['connection']) {
        mockWssHandlers['connection'](mockWs, mockRequest);

        // Trigger message handler with array of Buffers
        if (wsEventHandlers['message']) {
          const data = [Buffer.from('part1'), Buffer.from('part2')];
          wsEventHandlers['message'](data);
          expect(mockWsHandleMessage).toHaveBeenCalled();
        }
      }
    });

    it('should handle WebSocket messages (array with ArrayBuffer)', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const wsEventHandlers: Record<string, Function> = {};
      const mockWs = {
        on: vi.fn((event: string, handler: Function) => {
          wsEventHandlers[event] = handler;
        }),
      };
      const mockRequest = {
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };

      const mockClient = { ip: '' };
      mockWsAddClient.mockReturnValue(mockClient);

      if (mockWssHandlers['connection']) {
        mockWssHandlers['connection'](mockWs, mockRequest);

        // Trigger message handler with array containing ArrayBuffer (not Buffer)
        if (wsEventHandlers['message']) {
          const arrayBuffer = new ArrayBuffer(4);
          const data = [Buffer.from('part1'), arrayBuffer];
          wsEventHandlers['message'](data);
          expect(mockWsHandleMessage).toHaveBeenCalled();
        }
      }
    });
  });

  describe('stop', () => {
    it('should stop the worker', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();
      await worker.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping worker');
    });

    it('should return early if not running', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.stop();

      expect(mockLogger.info).not.toHaveBeenCalledWith('Stopping worker');
    });

    it('should close HTTP server', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();
      await worker.stop();

      expect(mockFastifyClose).toHaveBeenCalled();
    });

    it('should close WebSocket server', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();
      await worker.stop();

      expect(mockWssClose).toHaveBeenCalled();
    });

    it('should handle stop when app is null', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();
      
      // Manually set app to null to test the falsy branch
      (worker as any).app = null;
      
      await worker.stop();

      expect(mockFastifyClose).not.toHaveBeenCalled(); // Should not try to close null app
      expect(mockWssClose).toHaveBeenCalled(); // But should still close wss
    });

    it('should handle stop when wss is null', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();
      
      // Manually set wss to null to test the falsy branch
      (worker as any).wss = null;
      
      await worker.stop();

      expect(mockFastifyClose).toHaveBeenCalled(); // Should close app
      expect(mockWssClose).not.toHaveBeenCalled(); // Should not try to close null wss
    });

    it('should close all WebSocket connections', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();
      await worker.stop();

      expect(mockWsCloseAll).toHaveBeenCalled();
    });
  });

  describe('IPC handlers', () => {
    it('should handle get_jwt_secret_response', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      ipcHandlers['get_jwt_secret_response']?.({
        cmd: 'get_jwt_secret_response',
        jwtSecret: 'test-secret',
      });

      // The code calls config.setJwtSecret, not wsManager.setJwtSecret
      expect(mockSetJwtSecret).toHaveBeenCalledWith('test-secret');
      expect(mockLogger.debug).toHaveBeenCalledWith('Received JWT secret');
    });

    it('should handle websocket_broadcast_response', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const wsMessage = { eventName: 'test', data: 'test data' };
      ipcHandlers['websocket_broadcast_response']?.({
        cmd: 'websocket_broadcast_response',
        message: wsMessage,
      });

      // The code passes the whole message object to broadcast
      expect(mockWsBroadcast).toHaveBeenCalledWith(wsMessage);
    });

    it('should handle websocket_broadcast_chat_response', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const wsMessage = { eventName: 'chat', videoId: 'vid123', data: 'hello' };
      ipcHandlers['websocket_broadcast_chat_response']?.({
        cmd: 'websocket_broadcast_chat_response',
        message: wsMessage,
      });

      // The code calls broadcastToVideo(videoId, message)
      expect(mockWsBroadcastToVideo).toHaveBeenCalledWith('vid123', wsMessage);
    });

    it('should handle live_stream_worker_stats_request', async () => {
      const counts = { video1: 5, video2: 3 };
      mockWsGetLiveStreamWatchingCounts.mockReturnValue(counts);

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      ipcHandlers['live_stream_worker_stats_request']?.({
        cmd: 'live_stream_worker_stats_request',
      });

      expect(mockIpcSendToMaster).toHaveBeenCalledWith({
        cmd: 'live_stream_worker_stats_response',
        workerId: 1,
        liveStreamWatchingCounts: counts,
      });
    });

    it('should handle live_stream_worker_stats_request when cluster.worker is null', async () => {
      // Temporarily mock cluster.worker to be null
      const clusterMock = vi.mocked(await import('node:cluster'));
      const originalWorker = clusterMock.default.worker;
      clusterMock.default.worker = null as any;

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      // Clear any calls made during start
      mockIpcSendToMaster.mockClear();

      ipcHandlers['live_stream_worker_stats_request']?.({
        cmd: 'live_stream_worker_stats_request',
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Worker context not available');
      expect(mockIpcSendToMaster).not.toHaveBeenCalled();

      // Restore original mock
      clusterMock.default.worker = originalWorker;
    });

    it('should handle live_stream_worker_stats_update', async () => {
      // Set up a mock client that is watching a video
      const mockClient = {
        socketType: 'node_peer',
        videoId: 'video1',
      };
      mockWsGetClients.mockReturnValue([mockClient]);

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      ipcHandlers['live_stream_worker_stats_update']?.({
        cmd: 'live_stream_worker_stats_update',
        liveStreamWatchingCountsTracker: {
          1: { video1: 5 },
          2: { video1: 3 },
        },
      });

      // Should send aggregated stats to the client watching video1
      expect(mockWsSendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'live_stream_stats',
        watchingCount: 8, // 5 + 3 aggregated
      });
    });

    it('should handle restart_server_response', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      // Reset mocks to check calls
      mockFastifyClose.mockClear();
      const { createFastifyApp } = await import('@plugins/index.js');
      (createFastifyApp as any).mockClear();
      mockFastifyListen.mockClear();

      // The handler is async, need to handle the promise
      ipcHandlers['restart_server_response']?.({ cmd: 'restart_server_response' });

      // Wait for the async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLogger.info).toHaveBeenCalledWith('Received server restart request');
      expect(mockFastifyClose).toHaveBeenCalled();
      expect(createFastifyApp).toHaveBeenCalled();
      expect(mockFastifyListen).toHaveBeenCalledWith({ port: 3000, host: '0.0.0.0' });
      expect(mockLogger.info).toHaveBeenCalledWith('Worker 1 restarted on port 3000');
    });

    it('should handle restart_server_response when cluster.worker is null', async () => {
      // Temporarily mock cluster.worker to be null
      const clusterMock = vi.mocked(await import('node:cluster'));
      const originalWorker = clusterMock.default.worker;
      clusterMock.default.worker = null as any;

      try {
        const worker = new ClusterWorker(mockLogger as any);
        await worker.start();

        // Reset mocks to check calls
        mockFastifyClose.mockClear();
        const { createFastifyApp } = await import('@plugins/index.js');
        (createFastifyApp as any).mockClear();
        mockFastifyListen.mockClear();

        // The handler is async, need to handle the promise
        ipcHandlers['restart_server_response']?.({ cmd: 'restart_server_response' });

        // Wait for the async operation to complete
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockLogger.info).toHaveBeenCalledWith('Received server restart request');
        expect(mockFastifyClose).toHaveBeenCalled();
        expect(createFastifyApp).toHaveBeenCalled();
        expect(mockFastifyListen).toHaveBeenCalledWith({ port: 3000, host: '0.0.0.0' });
        expect(mockLogger.info).toHaveBeenCalledWith('Worker unknown restarted on port 3000');
      } finally {
        // Restore original mock
        clusterMock.default.worker = originalWorker;
      }
    });

    it('should handle restart_server_response when app is null', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      // Manually set app to null to test the falsy branch
      (worker as any).app = null;

      // Reset mocks to check calls
      mockFastifyClose.mockClear();
      const { createFastifyApp } = await import('@plugins/index.js');
      (createFastifyApp as any).mockClear();
      mockFastifyListen.mockClear();

      // The handler is async, need to handle the promise
      ipcHandlers['restart_server_response']?.({ cmd: 'restart_server_response' });

      // Wait for the async operation to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLogger.info).toHaveBeenCalledWith('Received server restart request');
      expect(mockFastifyClose).not.toHaveBeenCalled(); // Should not try to close null app
      expect(createFastifyApp).toHaveBeenCalled();
      expect(mockFastifyListen).toHaveBeenCalledWith({ port: 3000, host: '0.0.0.0' });
      expect(mockLogger.info).toHaveBeenCalledWith('Worker 1 restarted on port 3000');
    });

    it('should handle restart_database_response', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      ipcHandlers['restart_database_response']?.({ cmd: 'restart_database_response' });

      expect(mockLogger.info).toHaveBeenCalledWith('Received database restart request');
    });

    it('should handle update_node_name_response', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      ipcHandlers['update_node_name_response']?.({
        cmd: 'update_node_name_response',
        nodeName: 'New Node Name',
      });

      // The code logs with debug('Node name updated', { nodeName })
      expect(mockLogger.debug).toHaveBeenCalledWith('Node name updated', { nodeName: 'New Node Name' });
    });

    it('should handle live_stream_worker_stats_update with null worker counts', async () => {
      const mockClient = {
        socketType: 'node_peer',
        videoId: 'video1',
      };
      mockWsGetClients.mockReturnValue([mockClient]);

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      // Include null values in the tracker
      ipcHandlers['live_stream_worker_stats_update']?.({
        cmd: 'live_stream_worker_stats_update',
        liveStreamWatchingCountsTracker: {
          1: { video1: 5 },
          2: null,
          3: { video1: 2 },
        },
      });

      // Should only aggregate non-null entries: 5 + 2 = 7
      expect(mockWsSendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'live_stream_stats',
        watchingCount: 7,
      });
    });

    it('should handle live_stream_worker_stats_update for client without videoId', async () => {
      const mockClient = {
        socketType: 'node_peer',
        videoId: undefined, // No videoId
      };
      mockWsGetClients.mockReturnValue([mockClient]);

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      ipcHandlers['live_stream_worker_stats_update']?.({
        cmd: 'live_stream_worker_stats_update',
        liveStreamWatchingCountsTracker: {
          1: { video1: 5 },
        },
      });

      // Should not send stats to client without videoId
      expect(mockWsSendTo).not.toHaveBeenCalled();
    });

    it('should handle live_stream_worker_stats_update for non node_peer client', async () => {
      const mockClient = {
        socketType: 'viewer', // Not a node_peer
        videoId: 'video1',
      };
      mockWsGetClients.mockReturnValue([mockClient]);

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      ipcHandlers['live_stream_worker_stats_update']?.({
        cmd: 'live_stream_worker_stats_update',
        liveStreamWatchingCountsTracker: {
          1: { video1: 5 },
        },
      });

      // Should not send stats to non-node_peer client
      expect(mockWsSendTo).not.toHaveBeenCalled();
    });

    it('should handle live_stream_worker_stats_update with video not in aggregatedCounts', async () => {
      const mockClient = {
        socketType: 'node_peer',
        videoId: 'video999', // Video not in the counts
      };
      mockWsGetClients.mockReturnValue([mockClient]);

      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      ipcHandlers['live_stream_worker_stats_update']?.({
        cmd: 'live_stream_worker_stats_update',
        liveStreamWatchingCountsTracker: {
          1: { video1: 5 },
        },
      });

      // Should send 0 count for video not in aggregated counts
      expect(mockWsSendTo).toHaveBeenCalledWith(mockClient, {
        eventName: 'live_stream_stats',
        watchingCount: 0,
      });
    });
  });

  describe('public methods', () => {
    it('should broadcast to all workers', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const message = { eventName: 'test_event', data: 'test_data' };
      worker.broadcastToAllWorkers(message);

      expect(mockIpcSendToMaster).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast',
        message,
      });
    });

    it('should broadcast chat to all workers', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      const message = { eventName: 'chat', videoId: 'vid123', data: 'hello' };
      worker.broadcastChatToAllWorkers(message);

      expect(mockIpcSendToMaster).toHaveBeenCalledWith({
        cmd: 'websocket_broadcast_chat',
        message,
      });
    });

    it('should request server restart', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      worker.requestServerRestart();

      expect(mockIpcSendToMaster).toHaveBeenCalledWith({
        cmd: 'restart_server',
      });
    });

    it('should request database restart', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      worker.requestDatabaseRestart('postgres');

      expect(mockIpcSendToMaster).toHaveBeenCalledWith({
        cmd: 'restart_database',
        databaseDialect: 'postgres',
      });
    });

    it('should request node name update', async () => {
      const worker = new ClusterWorker(mockLogger as any);
      await worker.start();

      worker.requestNodeNameUpdate('New Name');

      expect(mockIpcSendToMaster).toHaveBeenCalledWith({
        cmd: 'update_node_name',
        nodeName: 'New Name',
      });
    });
  });
});
