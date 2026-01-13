/**
 * Cluster Module
 *
 * Barrel export for cluster-related functionality including
 * IPC communication, master process, and worker process.
 */

// IPC Channel
export { IPCChannel, type IPCHandler, type IPCLogger } from '@core/cluster/ipc-channel.js';

// Master process
export { ClusterMaster } from '@core/cluster/master.js';

// Worker process
export { ClusterWorker } from '@core/cluster/worker.js';
