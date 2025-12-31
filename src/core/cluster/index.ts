/**
 * Cluster Module
 *
 * Barrel export for cluster-related functionality including
 * IPC communication, master process, and worker process.
 */

// IPC Channel
export {
  IPCChannel,
  type IPCHandler,
  type IPCLogger,
} from '@core/cluster/ipc-channel.js';

// Master process
export {
  ClusterMaster,
  type ClusterMasterOptions,
  type MasterIndexerOperations,
  type MasterCloudflareOperations,
} from '@core/cluster/master.js';

// Worker process
export { ClusterWorker, type ClusterWorkerOptions } from '@core/cluster/worker.js';
