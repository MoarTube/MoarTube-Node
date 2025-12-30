/**
 * Core Module
 *
 * Barrel export for core application functionality.
 */

// Dependency Injection Container (Container type is used)
export {
  type Container,
} from './container.js';

// Cluster management (ClusterMaster and ClusterWorker are used)
export {
  ClusterMaster,
  ClusterWorker,
} from './cluster/index.js';
