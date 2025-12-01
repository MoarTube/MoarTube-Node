/**
 * Workers Module
 *
 * Re-exports cluster worker functionality.
 * The actual implementation is in src/core/cluster.
 */

export { ClusterWorker, type ClusterWorkerConfig } from '../core/cluster';
