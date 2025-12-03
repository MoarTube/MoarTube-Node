/**
 * Graceful Shutdown
 *
 * Handles graceful shutdown of the application, ensuring all
 * connections are closed properly and resources are cleaned up.
 */

import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import { createHttpTerminator, type HttpTerminator } from 'http-terminator';
import type { WebSocketManager } from '../websocket/websocket-manager.js';

/**
 * Logger interface for shutdown
 */
export interface ShutdownLogger {
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, error?: Error, context?: Record<string, unknown>) => void;
}

/**
 * Shutdown configuration
 */
export interface GracefulShutdownConfig {
  /** HTTP server to terminate */
  server: HttpServer | HttpsServer;
  /** WebSocket manager for closing connections */
  wsManager?: WebSocketManager;
  /** Cleanup function to run before exit */
  cleanup?: () => Promise<void>;
  /** Logger instance */
  logger?: ShutdownLogger;
  /** Graceful termination timeout in ms */
  terminationTimeout?: number;
}

/**
 * Default console logger
 */
const defaultLogger: ShutdownLogger = {
  info: (message, context) => {
    console.info(`[Shutdown] ${message}`, context ?? '');
  },
  warn: (message, context) => {
    console.warn(`[Shutdown] ${message}`, context ?? '');
  },
  error: (message, error, context) => {
    console.error(`[Shutdown] ${message}`, error ?? '', context ?? '');
  },
};

/**
 * Graceful Shutdown Manager
 *
 * Handles clean shutdown of HTTP server, WebSocket connections,
 * and other resources.
 */
export class GracefulShutdown {
  private isShuttingDown = false;
  private readonly httpTerminator: HttpTerminator;
  private readonly wsManager: WebSocketManager | undefined;
  private readonly cleanup: (() => Promise<void>) | undefined;
  private readonly logger: ShutdownLogger;
  private readonly terminationTimeout: number;

  constructor(config: GracefulShutdownConfig) {
    this.wsManager = config.wsManager;
    this.cleanup = config.cleanup;
    this.logger = config.logger ?? defaultLogger;
    this.terminationTimeout = config.terminationTimeout ?? 10000;

    this.httpTerminator = createHttpTerminator({
      server: config.server,
      gracefulTerminationTimeout: this.terminationTimeout,
    });
  }

  /**
   * Register shutdown handlers for process signals
   */
  register(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

    for (const signal of signals) {
      process.on(signal, () => {
        void this.shutdown(signal);
      });
    }

    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', error);
      void this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.error('Unhandled rejection', reason as Error);
      void this.shutdown('unhandledRejection');
    });

    this.logger.info('Shutdown handlers registered');
  }

  /**
   * Perform graceful shutdown
   */
  async shutdown(reason: string): Promise<void> {
    // Prevent multiple shutdown attempts
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    this.logger.info(`Shutting down (reason: ${reason})...`);

    try {
      // Step 1: Stop accepting new HTTP connections
      this.logger.info('Terminating HTTP connections...');
      await this.httpTerminator.terminate();

      // Step 2: Close WebSocket connections
      if (this.wsManager !== undefined) {
        this.logger.info('Closing WebSocket connections...');
        this.wsManager.closeAll(1001, 'Server shutting down');
      }

      // Step 3: Run custom cleanup
      if (this.cleanup !== undefined) {
        this.logger.info('Running cleanup tasks...');
        await this.cleanup();
      }

      this.logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during shutdown', error as Error);
      process.exit(1);
    }
  }

  /**
   * Check if shutdown is in progress
   */
  isInProgress(): boolean {
    return this.isShuttingDown;
  }
}

/**
 * Create a graceful shutdown manager
 */
export function createGracefulShutdown(config: GracefulShutdownConfig): GracefulShutdown {
  return new GracefulShutdown(config);
}
