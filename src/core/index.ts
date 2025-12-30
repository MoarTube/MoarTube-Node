/**
 * Core Module
 *
 * Barrel export for core application functionality.
 */

// Dependency Injection Container (Container type is used)
export {
  type Container,
} from '@core/container.js';

// Cluster management (ClusterMaster and ClusterWorker are used)
export {
  ClusterMaster,
  ClusterWorker,
} from '@core/cluster/index.js';
