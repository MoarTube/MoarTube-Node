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
import { v4 as uuidv4 } from 'uuid';

import { initializeConfig, getConfig } from './config';
import { ClusterMaster, ClusterWorker } from './core/cluster';
import { createDatabase, getDatabase } from './database';
import { logDebugMessageToConsole } from './utils/logger';

// Determine base directory (where config.json lives)
const baseDir = path.resolve(__dirname, '..');

/**
 * Initialize configuration
 */
function loadConfig(): void {
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
  initializeConfig(baseDir);
}

/**
 * Start master process
 */
async function startMaster(): Promise<void> {
  const config = getConfig();

  logDebugMessageToConsole('Starting MoarTube Node', null, null);
  logDebugMessageToConsole(
    `Configured MoarTube Node to use data directory path: ${config.paths.dataDirectoryPath}`,
    null,
    null
  );

  // Create database connection for master
  const dbConfig = config.nodeSettings.databaseConfig;
  const dbDialect = dbConfig.databaseDialect as 'sqlite' | 'postgres';

  if (dbDialect === 'postgres') {
    const pgConfig = dbConfig as {
      postgresUser?: string;
      postgresPassword?: string;
      postgresHost?: string;
      postgresPort?: number;
      postgresDatabase?: string;
    };
    createDatabase({
      dialect: 'postgres',
      connectionString: `postgres://${pgConfig.postgresUser ?? 'postgres'}:${pgConfig.postgresPassword ?? ''}@${pgConfig.postgresHost ?? 'localhost'}:${pgConfig.postgresPort ?? 5432}/${pgConfig.postgresDatabase ?? 'moartube'}`,
    });
  } else {
    createDatabase({
      dialect: 'sqlite',
      filepath: config.paths.databaseFilePath,
    });
  }

  const master = new ClusterMaster({
    database: {
      provision: (): Promise<void> => {
        // Database is already provisioned via Drizzle migrations
        logDebugMessageToConsole('Database provisioned', null, null);
        return Promise.resolve();
      },
      open: (): Promise<void> => {
        // Database connection is managed by the connection module
        logDebugMessageToConsole('Database opened', null, null);
        return Promise.resolve();
      },
      executeWrite: (query: string, parameters: unknown[]): Promise<void> => {
        // Raw query execution - use repository methods instead
        const db = getDatabase();
        if ('run' in db) {
          // SQLite
          (db as { run: (sql: string, ...params: unknown[]) => void }).run(query, ...parameters);
        }
        return Promise.resolve();
      },
      readAll: <T>(query: string, _parameters: unknown[]): Promise<T[]> => {
        // Raw query execution - use repository methods instead
        const db = getDatabase();
        if ('all' in db) {
          // SQLite
          return Promise.resolve((db as { all: (sql: string) => T[] }).all(query));
        }
        return Promise.resolve([]);
      },
    },
    getNodeSettings: (): Record<string, unknown> =>
      config.nodeSettings as unknown as Record<string, unknown>,
    setNodeSettings: (settings): void => {
      config.updateNodeSettings(settings as Parameters<typeof config.updateNodeSettings>[0]);
    },
    getNodeIdentification: (): { moarTubeTokenProof: string } => {
      const ident = config.nodeIdentification;
      return ident ? { moarTubeTokenProof: ident.moarTubeTokenProof } : { moarTubeTokenProof: '' };
    },
    performNodeIdentification: (): Promise<void> => {
      // Node identification is handled elsewhere
      return Promise.resolve();
    },
    generateVideoId: (): Promise<string> => {
      return Promise.resolve(uuidv4().replace(/-/g, ''));
    },
    getNodeIconPngBase64: (): string => '',
    getNodeAvatarPngBase64: (): string => '',
    getVideoPreviewJpgBase64: (): Promise<string> => Promise.resolve(''),
    submitDatabaseWriteJob: (): Promise<void> => {
      // Use repository methods instead
      return Promise.resolve();
    },
  });

  await master.start();
}

/**
 * Start worker process
 */
async function startWorker(): Promise<void> {
  const config = getConfig();

  // Create database connection for worker
  const dbConfig = config.nodeSettings.databaseConfig;
  const dbDialect = dbConfig.databaseDialect as 'sqlite' | 'postgres';

  if (dbDialect === 'postgres') {
    const pgConfig = dbConfig as {
      postgresUser?: string;
      postgresPassword?: string;
      postgresHost?: string;
      postgresPort?: number;
      postgresDatabase?: string;
    };
    createDatabase({
      dialect: 'postgres',
      connectionString: `postgres://${pgConfig.postgresUser ?? 'postgres'}:${pgConfig.postgresPassword ?? ''}@${pgConfig.postgresHost ?? 'localhost'}:${pgConfig.postgresPort ?? 5432}/${pgConfig.postgresDatabase ?? 'moartube'}`,
    });
  } else {
    createDatabase({
      dialect: 'sqlite',
      filepath: config.paths.databaseFilePath,
    });
  }

  // Import Fastify app setup dynamically to avoid loading in master
  const { createFastifyApp } = await import('./plugins');
  const app = await createFastifyApp();

  const worker = new ClusterWorker({
    openDatabase: async () => {
      // Database is already opened above
    },
    restartHttpServer: async () => {
      await app.close();
      const newApp = await createFastifyApp();
      const nodeSettings = config.nodeSettings;
      await newApp.listen({
        port: nodeSettings.nodeListeningPort,
        host: '0.0.0.0',
      });
    },
    setJwtSecret: (secret) => {
      config.setJwtSecret(secret);
    },
    getHttpServer: () => null, // Fastify manages its own server
    getWebSocketClients: () => new Set(),
  });

  await worker.start();

  // Start HTTP server
  const nodeSettings = config.nodeSettings;
  const port = nodeSettings.nodeListeningPort;

  try {
    await app.listen({ port, host: '0.0.0.0' });
    logDebugMessageToConsole(`Worker ${cluster.worker?.id} listening on port ${port}`, null, null);
  } catch (err) {
    logDebugMessageToConsole(`Worker ${cluster.worker?.id} failed to start`, err as Error, null);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    loadConfig();

    if (cluster.isPrimary) {
      await startMaster();
    } else {
      await startWorker();
    }
  } catch (error) {
    logDebugMessageToConsole('Fatal error during startup', error as Error, new Error().stack);
    process.exit(1);
  }
}

// Run
void main();
