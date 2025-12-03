/**
 * Core Module
 *
 * Barrel export for core application functionality including
 * DI container, cluster management, and shutdown handling.
 */

// Dependency Injection Container
export {
  createAppContainer,
  getContainer,
  isContainerInitialized,
  resolve,
  disposeContainer,
  createScope,
  type Container,
  type ContainerCradle,
} from './container.js';

// Cluster management
export {
  IPCChannel,
  getIPCChannel,
  ClusterMaster,
  ClusterWorker,
  type IPCHandler,
  type IPCLogger,
  type ClusterMasterConfig,
  type ClusterWorkerConfig,
} from './cluster/index.js';

// Graceful shutdown
export {
  GracefulShutdown,
  createGracefulShutdown,
  type GracefulShutdownConfig,
  type ShutdownLogger,
} from './shutdown.js';
