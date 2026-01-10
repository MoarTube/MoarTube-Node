/**
 * Core Module
 *
 * Barrel export for core functionality including dependency injection
 * container and cluster management.
 */

// Dependency Injection Container
export {
  createAppContainer,
  getContainer,
  type Container,
  type ContainerCradle,
} from '@core/container.js';

// Cluster Management
export * from '@core/cluster/index.js';
