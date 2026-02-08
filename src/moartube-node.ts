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

  // Startup provisioning: reset stale streaming/importing flags, clean up chat messages, finalize manifests
  await performStartupProvisioning(logger, container);

  // Get services from container
  const indexer = container.resolve('indexerService');
  const cloudflare = container.resolve('cloudflareService');

  const master = new ClusterMaster(logger, indexer, cloudflare);

  master.start();
}

/**
 * Startup provisioning
 *
 * Ensures database state is clean after a potential crash mid-stream.
 * Legacy equivalent: database.js provisioning at startup.
 */
async function performStartupProvisioning(
  logger: Logger,
  container: Awaited<ReturnType<typeof createAppContainer>>
): Promise<void> {
  try {
    const streamsService = container.resolve('streamsService');
    const videosRepository = container.resolve('videosRepository');
    const liveChatMessagesRepository = container.resolve('liveChatMessagesRepository');

    // Mark any currently-streaming videos as streamed
    const streamingVideos = await videosRepository.findStreaming();
    for (const video of streamingVideos) {
      await videosRepository.update(video.video_id, {
        is_streamed: true,
      });
    }

    // Reset all in-progress flags
    const allVideos = await videosRepository.findAll();
    for (const video of allVideos) {
      if (video.is_importing || video.is_publishing || video.is_streaming) {
        await videosRepository.update(video.video_id, {
          is_importing: false,
          is_publishing: false,
          is_streaming: false,
        });
      }
    }

    // Delete all live chat messages
    await liveChatMessagesRepository.deleteAll();

    // Finalize any streamed HLS manifest files
    await streamsService.finalizeAllStreamedManifests();

    logger.info('Startup provisioning completed');
  } catch (error) {
    logger.error('Startup provisioning failed', error);
  }
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
