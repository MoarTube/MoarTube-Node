/**
 * MoarTube-Node Entry Point
 *
 * Main entry point for MoarTube-Node. Handles both master and worker processes
 * in a Node.js cluster configuration.
 *
 * Usage:
 *   node moartube-node.js
 *   npm start
 */

import cluster from 'node:cluster';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeConfig } from './config/index.js';
import { ClusterMaster, ClusterWorker } from './core/cluster/index.js';
import { getLogger } from './utils/logger.js';

/**
 * Initialize configuration
 */
function loadConfig(): void {
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

  // ESM equivalent of __dirname
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Determine base directory where config json files live
  const baseDir = path.resolve(__dirname, '..');

  initializeConfig(baseDir, 'config_test.json');
}

/**
 * Start master process
 */
function startMaster(): void {
  const master = new ClusterMaster();

  master.start();
}

/**
 * Start worker process
 */
async function startWorker(): Promise<void> {
  const worker = new ClusterWorker();

  await worker.start();
}

/**
 * Main entry point using top-level await (ESM)
 */
try {
  loadConfig();

  if (cluster.isPrimary) {
    startMaster();
  } else {
    await startWorker();
  }
} catch (error) {
  getLogger().error('Fatal error during startup', error);
  process.exit(1);
}
