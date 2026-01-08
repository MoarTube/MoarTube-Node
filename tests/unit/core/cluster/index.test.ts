/**
 * Cluster Index Tests
 *
 * Tests for the cluster module exports.
 */

import { describe, it, expect } from 'vitest';

describe('Cluster Module Exports', () => {
  it('should export IPCChannel class', async () => {
    const { IPCChannel } = await import('@core/cluster/index.js');
    expect(IPCChannel).toBeDefined();
    expect(typeof IPCChannel).toBe('function');
  });

  it('should export ClusterMaster class', async () => {
    const { ClusterMaster } = await import('@core/cluster/index.js');
    expect(ClusterMaster).toBeDefined();
    expect(typeof ClusterMaster).toBe('function');
  });

  it('should export ClusterWorker class', async () => {
    const { ClusterWorker } = await import('@core/cluster/index.js');
    expect(ClusterWorker).toBeDefined();
    expect(typeof ClusterWorker).toBe('function');
  });

  it('should export all types', async () => {
    // Types are checked at compile time, but we can verify the module loads
    const module = await import('@core/cluster/index.js');
    expect(module).toBeDefined();
    
    // Check that the main classes are exported
    expect('IPCChannel' in module).toBe(true);
    expect('ClusterMaster' in module).toBe(true);
    expect('ClusterWorker' in module).toBe(true);
  });
});
