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
  type ClusterMasterOptions,
  type ClusterWorkerOptions,
} from './cluster/index.js';

// Graceful shutdown
export {
  GracefulShutdown,
  createGracefulShutdown,
  type GracefulShutdownConfig,
} from './shutdown.js';
