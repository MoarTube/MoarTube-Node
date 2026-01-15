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

// Load environment variables from .env file
import 'dotenv/config';

import cluster from 'node:cluster';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeConfig, getConfig } from '@config/index.js';
import { ClusterMaster, ClusterWorker } from '@core/cluster/index.js';
import { createAppContainer } from '@core/container.js';
import { Logger, getLogger } from '@utils/index.js';
import { createDatabase, initializeDatabaseSchema, getDatabase } from '@database/index.js';

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

  initializeConfig(baseDir, 'config_test.json', __dirname);
}

/**
 * Initialize database for master process
 */
async function initializeMasterDatabase(logger: Logger): Promise<void> {
  const config = getConfig();

  const dbConfig = config.nodeSettings.databaseConfig;
  const dbDialect = dbConfig.databaseDialect;

  if (dbDialect === 'sqlite') {
    createDatabase({
      dialect: 'sqlite',
      filepath: config.paths.databaseFilePath,
    });
  } else {
    const pgConfig = dbConfig.postgresConfig;

    if (pgConfig === undefined) {
      throw new Error('Postgres configuration is required for postgres database dialect');
    }

    createDatabase({
      dialect: 'postgres',
      connectionString: `postgres://${pgConfig.username}:${pgConfig.password}@${pgConfig.host}:${String(pgConfig.port)}/${pgConfig.databaseName}`,
    });
  }

  // Initialize database schema
  await initializeDatabaseSchema();

  logger.debug('Database initialized');
}

/**
 * Start master process
 */
async function startMaster(): Promise<void> {
  const logger = Logger.getInstance();

  // Initialize database first (services depend on it)
  await initializeMasterDatabase(logger);

  // Create DI container with all services
  const db = getDatabase();
  const container = await createAppContainer(db);

  // Get services from container
  const indexer = container.resolve('indexerService');
  const cloudflare = container.resolve('cloudflareService');

  const master = new ClusterMaster(logger, indexer, cloudflare);

  master.start();
}

/**
 * Start worker process
 */
async function startWorker(): Promise<void> {
  const logger = Logger.getInstance();

  const worker = new ClusterWorker(logger);

  await worker.start();
}

/**
 * Main entry point using top-level await (ESM)
 */
try {
  loadConfig();

  if (cluster.isPrimary) {
    await startMaster();
  } else {
    await startWorker();
  }
} catch (error) {
  getLogger().error('Fatal error during startup', error);

  process.exit(1);
}
