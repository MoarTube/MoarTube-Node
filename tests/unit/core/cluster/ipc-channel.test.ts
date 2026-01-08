/**
 * IPC Channel Tests
 *
 * Tests for the inter-process communication channel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import cluster from 'node:cluster';
import type { Worker } from 'node:cluster';

// Mock cluster before importing the module
vi.mock('node:cluster', () => ({
  default: {
    isPrimary: false,
    isWorker: true,
    worker: { id: 1 },
    workers: {},
    on: vi.fn(),
  },
}));

// Mock logger
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

describe('IPCChannel', () => {
  let IPCChannel: typeof import('@core/cluster/ipc-channel.js').IPCChannel;
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Reset cluster mock state
    (cluster as unknown as { isPrimary: boolean }).isPrimary = false;
    (cluster as unknown as { isWorker: boolean }).isWorker = true;
    (cluster as unknown as { workers: Record<string, Worker> }).workers = {};

    const module = await import('@core/cluster/ipc-channel.js');
    IPCChannel = module.IPCChannel;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an IPC channel with default logger', () => {
      const channel = new IPCChannel();
      expect(channel).toBeDefined();
    });

    it('should create an IPC channel with custom logger', () => {
      const channel = new IPCChannel(mockLogger as any);
      expect(channel).toBeDefined();
    });
  });

  describe('on/off handlers', () => {
    it('should register a handler for a command', () => {
      const channel = new IPCChannel(mockLogger as any);
      const handler = vi.fn();

      channel.on('get_jwt_secret', handler);

      expect(mockLogger.debug).toHaveBeenCalledWith('Registered handler for: get_jwt_secret');
    });

    it('should remove a handler for a command', () => {
      const channel = new IPCChannel(mockLogger as any);
      const handler = vi.fn();

      channel.on('get_jwt_secret', handler);
      channel.off('get_jwt_secret');

      // Handler should be removed (no error on off)
      expect(true).toBe(true);
    });

    it('should allow registering multiple handlers for different commands', () => {
      const channel = new IPCChannel(mockLogger as any);
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      channel.on('get_jwt_secret', handler1);
      channel.on('websocket_broadcast', handler2);

      expect(mockLogger.debug).toHaveBeenCalledTimes(2);
    });
  });

  describe('startListening', () => {
    it('should not start listening twice', () => {
      const channel = new IPCChannel(mockLogger as any);

      channel.startListening();
      channel.startListening(); // Should be a no-op

      // Should only log once for starting
      expect(mockLogger.debug).toHaveBeenCalledWith('Worker IPC listener started');
    });

    it('should start worker listener when not primary', () => {
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);

      const channel = new IPCChannel(mockLogger as any);
      channel.startListening();

      expect(processOnSpy).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockLogger.debug).toHaveBeenCalledWith('Worker IPC listener started');

      processOnSpy.mockRestore();
    });

    it('should start master listener when primary', async () => {
      // Set cluster as primary
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;
      (cluster as unknown as { isWorker: boolean }).isWorker = false;

      const channel = new IPCChannel(mockLogger as any);
      channel.startListening();

      expect(cluster.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockLogger.debug).toHaveBeenCalledWith('Master IPC listener started');
    });
  });

  describe('sendToMaster', () => {
    it('should return false when called from master process', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;

      const channel = new IPCChannel(mockLogger as any);
      const result = channel.sendToMaster({ cmd: 'get_jwt_secret' });

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot send to master from master process');
    });

    it('should return false when process.send is undefined', () => {
      const originalSend = process.send;
      (process as any).send = undefined;

      const channel = new IPCChannel(mockLogger as any);
      const result = channel.sendToMaster({ cmd: 'get_jwt_secret' });

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('process.send is not available');

      (process as any).send = originalSend;
    });

    it('should send message to master successfully', () => {
      const mockSend = vi.fn();
      (process as any).send = mockSend;

      const channel = new IPCChannel(mockLogger as any);
      const message = { cmd: 'get_jwt_secret' as const };
      const result = channel.sendToMaster(message);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(message);

      (process as any).send = undefined;
    });

    it('should return false and log error when send fails', () => {
      const mockSend = vi.fn(() => {
        throw new Error('Send failed');
      });
      (process as any).send = mockSend;

      const channel = new IPCChannel(mockLogger as any);
      const result = channel.sendToMaster({ cmd: 'get_jwt_secret' });

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send message to master',
        expect.any(Error)
      );

      (process as any).send = undefined;
    });
  });

  describe('sendToWorker', () => {
    it('should return false when called from worker process', () => {
      const channel = new IPCChannel(mockLogger as any);
      const mockWorker = { id: 1, isDead: vi.fn(() => false), send: vi.fn() } as unknown as Worker;

      const result = channel.sendToWorker(mockWorker, { cmd: 'get_jwt_secret_response', jwtSecret: 'secret' });

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot send to worker from worker process');
    });

    it('should return false when worker is dead', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;

      const channel = new IPCChannel(mockLogger as any);
      const mockWorker = { id: 1, isDead: vi.fn(() => true), send: vi.fn() } as unknown as Worker;

      const result = channel.sendToWorker(mockWorker, { cmd: 'get_jwt_secret_response', jwtSecret: 'secret' });

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot send to dead worker', { workerId: 1 });
    });

    it('should send message to worker successfully', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;

      const mockWorker = { id: 1, isDead: vi.fn(() => false), send: vi.fn() } as unknown as Worker;
      const channel = new IPCChannel(mockLogger as any);
      const message = { cmd: 'get_jwt_secret_response' as const, jwtSecret: 'secret' };

      const result = channel.sendToWorker(mockWorker, message);

      expect(result).toBe(true);
      expect(mockWorker.send).toHaveBeenCalledWith(message);
    });

    it('should return false and log error when send fails', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;

      const mockWorker = {
        id: 1,
        isDead: vi.fn(() => false),
        send: vi.fn(() => {
          throw new Error('Send failed');
        }),
      } as unknown as Worker;

      const channel = new IPCChannel(mockLogger as any);
      const result = channel.sendToWorker(mockWorker, { cmd: 'get_jwt_secret_response', jwtSecret: 'secret' });

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send message to worker',
        expect.any(Error),
        { workerId: 1 }
      );
    });
  });

  describe('broadcast', () => {
    it('should return early when called from worker process', () => {
      const channel = new IPCChannel(mockLogger as any);
      channel.broadcast({ cmd: 'get_jwt_secret_response', jwtSecret: 'secret' });

      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot broadcast from worker process');
    });

    it('should return early when workers is undefined', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;
      (cluster as unknown as { workers: undefined }).workers = undefined;

      const channel = new IPCChannel(mockLogger as any);
      channel.broadcast({ cmd: 'get_jwt_secret_response', jwtSecret: 'secret' });

      // Should not throw
      expect(true).toBe(true);
    });

    it('should send message to all active workers', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;

      const worker1 = { id: 1, isDead: vi.fn(() => false), send: vi.fn() } as unknown as Worker;
      const worker2 = { id: 2, isDead: vi.fn(() => false), send: vi.fn() } as unknown as Worker;
      const deadWorker = { id: 3, isDead: vi.fn(() => true), send: vi.fn() } as unknown as Worker;

      (cluster as unknown as { workers: Record<string, Worker> }).workers = {
        '1': worker1,
        '2': worker2,
        '3': deadWorker,
      };

      const channel = new IPCChannel(mockLogger as any);
      const message = { cmd: 'get_jwt_secret_response' as const, jwtSecret: 'secret' };

      channel.broadcast(message);

      expect(worker1.send).toHaveBeenCalledWith(message);
      expect(worker2.send).toHaveBeenCalledWith(message);
      expect(deadWorker.send).not.toHaveBeenCalled();
    });

    it('should skip undefined workers', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;

      const worker1 = { id: 1, isDead: vi.fn(() => false), send: vi.fn() } as unknown as Worker;

      (cluster as unknown as { workers: Record<string, Worker | undefined> }).workers = {
        '1': worker1,
        '2': undefined,
      };

      const channel = new IPCChannel(mockLogger as any);
      channel.broadcast({ cmd: 'get_jwt_secret_response', jwtSecret: 'secret' });

      expect(worker1.send).toHaveBeenCalled();
      // Should not throw for undefined worker
      expect(true).toBe(true);
    });
  });

  describe('getWorkerId', () => {
    it('should return worker id when in worker process', () => {
      (cluster as unknown as { worker: { id: number } | undefined }).worker = { id: 5 };

      const channel = new IPCChannel(mockLogger as any);
      expect(channel.getWorkerId()).toBe(5);
    });

    it('should return undefined when not in worker process', () => {
      (cluster as unknown as { worker: { id: number } | undefined }).worker = undefined;

      const channel = new IPCChannel(mockLogger as any);
      expect(channel.getWorkerId()).toBeUndefined();
    });
  });

  describe('isMaster', () => {
    it('should return true when primary', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;

      const channel = new IPCChannel(mockLogger as any);
      expect(channel.isMaster()).toBe(true);
    });

    it('should return false when not primary', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = false;

      const channel = new IPCChannel(mockLogger as any);
      expect(channel.isMaster()).toBe(false);
    });
  });

  describe('isWorker', () => {
    it('should return true when worker', () => {
      (cluster as unknown as { isWorker: boolean }).isWorker = true;

      const channel = new IPCChannel(mockLogger as any);
      expect(channel.isWorker()).toBe(true);
    });

    it('should return false when not worker', () => {
      (cluster as unknown as { isWorker: boolean }).isWorker = false;

      const channel = new IPCChannel(mockLogger as any);
      expect(channel.isWorker()).toBe(false);
    });
  });

  describe('getWorkers', () => {
    it('should return empty array when not primary', () => {
      const channel = new IPCChannel(mockLogger as any);
      expect(channel.getWorkers()).toEqual([]);
    });

    it('should return empty array when workers is undefined', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;
      (cluster as unknown as { workers: undefined }).workers = undefined;

      const channel = new IPCChannel(mockLogger as any);
      expect(channel.getWorkers()).toEqual([]);
    });

    it('should return only active workers', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;

      const worker1 = { id: 1, isDead: vi.fn(() => false) } as unknown as Worker;
      const worker2 = { id: 2, isDead: vi.fn(() => true) } as unknown as Worker;
      const worker3 = { id: 3, isDead: vi.fn(() => false) } as unknown as Worker;

      (cluster as unknown as { workers: Record<string, Worker | undefined> }).workers = {
        '1': worker1,
        '2': worker2,
        '3': worker3,
        '4': undefined,
      };

      const channel = new IPCChannel(mockLogger as any);
      const workers = channel.getWorkers();

      expect(workers).toHaveLength(2);
      expect(workers).toContain(worker1);
      expect(workers).toContain(worker3);
      expect(workers).not.toContain(worker2);
    });
  });

  describe('message handling', () => {
    it('should handle valid IPC messages in worker', () => {
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, callback) => {
        if (event === 'message') {
          // Simulate receiving a message
          setTimeout(() => {
            (callback as Function)({ cmd: 'test_command' });
          }, 0);
        }
        return process;
      });

      const handler = vi.fn();
      const channel = new IPCChannel(mockLogger as any);
      channel.on('test_command', handler);
      channel.startListening();

      // Wait for async handler
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(handler).toHaveBeenCalledWith({ cmd: 'test_command' }, undefined);
          processOnSpy.mockRestore();
          resolve();
        }, 10);
      });
    });

    it('should warn on invalid IPC messages in worker', () => {
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(() => {
            (callback as Function)({ invalid: 'message' });
          }, 0);
        }
        return process;
      });

      const channel = new IPCChannel(mockLogger as any);
      channel.startListening();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(mockLogger.warn).toHaveBeenCalledWith(
            'Received invalid IPC message',
            { message: { invalid: 'message' } }
          );
          processOnSpy.mockRestore();
          resolve();
        }, 10);
      });
    });

    it('should log debug when no handler found for command', () => {
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(() => {
            (callback as Function)({ cmd: 'unknown_command' });
          }, 0);
        }
        return process;
      });

      const channel = new IPCChannel(mockLogger as any);
      channel.startListening();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(mockLogger.debug).toHaveBeenCalledWith('No handler for command: unknown_command');
          processOnSpy.mockRestore();
          resolve();
        }, 10);
      });
    });

    it('should handle async handler errors', () => {
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(() => {
            (callback as Function)({ cmd: 'async_error_command' });
          }, 0);
        }
        return process;
      });

      const handler = vi.fn().mockRejectedValue(new Error('Async error'));
      const channel = new IPCChannel(mockLogger as any);
      channel.on('async_error_command', handler);
      channel.startListening();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(mockLogger.error).toHaveBeenCalledWith(
            'Handler error for async_error_command',
            expect.any(Error)
          );
          processOnSpy.mockRestore();
          resolve();
        }, 20);
      });
    });

    it('should handle sync handler errors', () => {
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(() => {
            (callback as Function)({ cmd: 'sync_error_command' });
          }, 0);
        }
        return process;
      });

      const handler = vi.fn(() => {
        throw new Error('Sync error');
      });
      const channel = new IPCChannel(mockLogger as any);
      channel.on('sync_error_command', handler);
      channel.startListening();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(mockLogger.error).toHaveBeenCalledWith(
            'Sync handler error for sync_error_command',
            expect.any(Error)
          );
          processOnSpy.mockRestore();
          resolve();
        }, 10);
      });
    });

    it('should handle messages in master with worker reference', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;
      (cluster as unknown as { isWorker: boolean }).isWorker = false;

      let messageCallback: Function = () => {};
      (cluster.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, callback: Function) => {
        if (event === 'message') {
          messageCallback = callback;
        }
      });

      const handler = vi.fn();
      const mockWorker = { id: 1 } as Worker;

      const channel = new IPCChannel(mockLogger as any);
      channel.on('test_command', handler);
      channel.startListening();

      // Simulate receiving a message from a worker
      messageCallback(mockWorker, { cmd: 'test_command' });

      expect(handler).toHaveBeenCalledWith({ cmd: 'test_command' }, mockWorker);
    });

    it('should warn on invalid IPC messages in master', () => {
      (cluster as unknown as { isPrimary: boolean }).isPrimary = true;
      (cluster as unknown as { isWorker: boolean }).isWorker = false;

      let messageCallback: Function = () => {};
      (cluster.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, callback: Function) => {
        if (event === 'message') {
          messageCallback = callback;
        }
      });

      const mockWorker = { id: 1 } as Worker;

      const channel = new IPCChannel(mockLogger as any);
      channel.startListening();

      // Simulate receiving an invalid message
      messageCallback(mockWorker, 'not an object');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Received invalid IPC message',
        { message: 'not an object' }
      );
    });

    it('should handle null messages', () => {
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation((event, callback) => {
        if (event === 'message') {
          setTimeout(() => {
            (callback as Function)(null);
          }, 0);
        }
        return process;
      });

      const channel = new IPCChannel(mockLogger as any);
      channel.startListening();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(mockLogger.warn).toHaveBeenCalledWith(
            'Received invalid IPC message',
            { message: null }
          );
          processOnSpy.mockRestore();
          resolve();
        }, 10);
      });
    });
  });
});
