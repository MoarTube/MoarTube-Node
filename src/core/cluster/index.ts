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
} from './ipc-channel.js';

// Master process
export {
  ClusterMaster,
  type ClusterMasterOptions,
  type MasterIndexerOperations,
  type MasterCloudflareOperations,
  type NodeIdentification,
} from './master.js';

// Worker process
export { ClusterWorker, type ClusterWorkerOptions } from './worker.js';
