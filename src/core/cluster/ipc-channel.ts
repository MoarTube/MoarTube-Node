/**
 * IPC Channel
 *
 * Abstraction layer for inter-process communication between
 * cluster master and worker processes.
 */

import cluster from 'node:cluster';
import type { Worker } from 'node:cluster';
import type {
  IPCCommand,
  IPCMessage,
  IPCMessageToMaster,
  IPCMessageToWorker,
} from '../../types/ipc.js';
import { Logger } from '../../utils/logger.js';

/**
 * IPC message handler function type
 */
export type IPCHandler<T extends IPCMessage = IPCMessage> = (
  message: T,
  worker?: Worker
) => void | Promise<void>;

/**
 * Logger interface for IPC
 */
export interface IPCLogger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, error?: Error, context?: Record<string, unknown>) => void;
}

/**
 * Default console logger using Logger utility
 */
const defaultLogger: IPCLogger = new Logger({ prefix: 'IPC' });

/**
 * IPC Channel for cluster communication
 *
 * Provides a typed interface for sending and receiving
 * messages between master and worker processes.
 */
export class IPCChannel {
  private readonly handlers = new Map<IPCCommand, IPCHandler>();
  private readonly logger: IPCLogger;
  private isListening = false;

  constructor(logger?: IPCLogger) {
    this.logger = logger ?? defaultLogger;
  }

  /**
   * Register a handler for a specific IPC command
   */
  on<T extends IPCMessage>(command: T['cmd'], handler: IPCHandler<T>): void {
    this.handlers.set(command, handler as IPCHandler);
    this.logger.debug(`Registered handler for: ${command}`);
  }

  /**
   * Remove a handler for a command
   */
  off(command: IPCCommand): void {
    this.handlers.delete(command);
  }

  /**
   * Start listening for IPC messages
   * Call this after registering handlers
   */
  startListening(): void {
    if (this.isListening) {
      return;
    }

    if (cluster.isPrimary) {
      this.startMasterListener();
    } else {
      this.startWorkerListener();
    }

    this.isListening = true;
  }

  /**
   * Set up message listener for master process
   */
  private startMasterListener(): void {
    // Listen for messages from each worker
    cluster.on('message', (worker: Worker, message: unknown) => {
      if (this.isValidIPCMessage(message)) {
        this.handleMessage(message, worker);
      } else {
        this.logger.warn('Received invalid IPC message', { message });
      }
    });

    this.logger.debug('Master IPC listener started');
  }

  /**
   * Set up message listener for worker process
   */
  private startWorkerListener(): void {
    process.on('message', (message: unknown) => {
      if (this.isValidIPCMessage(message)) {
        this.handleMessage(message);
      } else {
        this.logger.warn('Received invalid IPC message', { message });
      }
    });

    this.logger.debug('Worker IPC listener started');
  }

  /**
   * Type guard for IPC messages
   */
  private isValidIPCMessage(message: unknown): message is IPCMessage {
    return (
      typeof message === 'object' &&
      message !== null &&
      'cmd' in message &&
      typeof (message as { cmd: unknown }).cmd === 'string'
    );
  }

  /**
   * Handle incoming IPC message
   */
  private handleMessage(message: IPCMessage, worker?: Worker): void {
    const handler = this.handlers.get(message.cmd);

    if (handler === undefined) {
      this.logger.debug(`No handler for command: ${message.cmd}`);
      return;
    }

    try {
      void Promise.resolve(handler(message, worker)).catch((error: unknown) => {
        this.logger.error(`Handler error for ${message.cmd}`, error as Error);
      });
    } catch (error) {
      this.logger.error(`Sync handler error for ${message.cmd}`, error as Error);
    }
  }

  /**
   * Send a message from worker to master
   * Only call this from worker processes
   */
  sendToMaster(message: IPCMessageToMaster): boolean {
    if (cluster.isPrimary) {
      this.logger.warn('Cannot send to master from master process');
      return false;
    }

    if (process.send === undefined) {
      this.logger.error('process.send is not available');
      return false;
    }

    try {
      process.send(message);
      return true;
    } catch (error) {
      this.logger.error('Failed to send message to master', error as Error);
      return false;
    }
  }

  /**
   * Send a message from master to a specific worker
   * Only call this from master process
   */
  sendToWorker(worker: Worker, message: IPCMessageToWorker): boolean {
    if (!cluster.isPrimary) {
      this.logger.warn('Cannot send to worker from worker process');
      return false;
    }

    if (worker.isDead()) {
      this.logger.warn('Cannot send to dead worker', { workerId: worker.id });
      return false;
    }

    try {
      worker.send(message);
      return true;
    } catch (error) {
      this.logger.error('Failed to send message to worker', error as Error, {
        workerId: worker.id,
      });
      return false;
    }
  }

  /**
   * Broadcast a message from master to all workers
   * Only call this from master process
   */
  broadcast(message: IPCMessageToWorker): void {
    if (!cluster.isPrimary) {
      this.logger.warn('Cannot broadcast from worker process');
      return;
    }

    const workers = cluster.workers;
    if (workers === undefined) {
      return;
    }

    for (const worker of Object.values(workers)) {
      if (worker !== undefined && !worker.isDead()) {
        this.sendToWorker(worker, message);
      }
    }
  }

  /**
   * Get the current worker ID (only valid in worker process)
   */
  getWorkerId(): number | undefined {
    return cluster.worker?.id;
  }

  /**
   * Check if this is the master process
   */
  isMaster(): boolean {
    return cluster.isPrimary;
  }

  /**
   * Check if this is a worker process
   */
  isWorker(): boolean {
    return cluster.isWorker;
  }

  /**
   * Get all active workers (only valid in master process)
   */
  getWorkers(): Worker[] {
    if (!cluster.isPrimary) {
      return [];
    }

    const workers = cluster.workers;
    if (workers === undefined) {
      return [];
    }

    return Object.values(workers).filter((w): w is Worker => w !== undefined && !w.isDead());
  }
}

/**
 * Singleton IPC channel instance
 */
let ipcChannelInstance: IPCChannel | null = null;

/**
 * Get or create the IPC channel instance
 */
export function getIPCChannel(logger?: IPCLogger): IPCChannel {
  ipcChannelInstance ??= new IPCChannel(logger);
  return ipcChannelInstance;
}

/**
 * Reset the IPC channel (for testing)
 */
export function resetIPCChannel(): void {
  ipcChannelInstance = null;
}
