/**
 * Cluster Module
 *
 * Barrel export for cluster-related functionality including
 * IPC communication, master process, and worker process.
 */

// IPC Channel
export {
  IPCChannel,
  getIPCChannel,
  resetIPCChannel,
  type IPCHandler,
  type IPCLogger,
} from './ipc-channel';

// Master process
export {
  ClusterMaster,
  type ClusterMasterConfig,
  type MasterDatabaseOperations,
  type MasterIndexerOperations,
  type MasterCloudflareOperations,
  type NodeIdentification,
} from './master';

// Worker process
export { ClusterWorker, type ClusterWorkerConfig } from './worker';
