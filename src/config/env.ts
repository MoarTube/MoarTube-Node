/**
 * Environment configuration module
 * Handles environment variable loading and type-safe access
 */

import { z } from 'zod';

/**
 * Environment variable schema with validation
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  IS_DOCKER_ENVIRONMENT: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  MOARTUBE_DATA_DIR: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PORT: z
    .string()
    .optional()
    .transform((val) => (val !== undefined && val !== '' ? parseInt(val, 10) : undefined)),
  HOST: z.string().optional(),
});

/**
 * Parsed environment configuration type
 */
export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Environment configuration singleton
 */
class Env {
  private static instance: Env | undefined;
  private config: EnvConfig;

  private constructor() {
    this.config = this.loadAndValidate();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): Env {
    Env.instance ??= new Env();
    return Env.instance;
  }

  /**
   * Load and validate environment variables
   */
  private loadAndValidate(): EnvConfig {
    const result = EnvSchema.safeParse({
      NODE_ENV: process.env['NODE_ENV'],
      IS_DOCKER_ENVIRONMENT: process.env['IS_DOCKER_ENVIRONMENT'],
      MOARTUBE_DATA_DIR: process.env['MOARTUBE_DATA_DIR'],
      DATABASE_URL: process.env['DATABASE_URL'],
      LOG_LEVEL: process.env['LOG_LEVEL'],
      PORT: process.env['PORT'],
      HOST: process.env['HOST'],
    });

    if (!result.success) {
      throw new Error(`Invalid environment configuration: ${result.error.message}`);
    }

    return result.data;
  }

  /**
   * Get all environment configuration
   */
  getAll(): Readonly<EnvConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Check if running in development mode
   */
  get isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  /**
   * Check if running in production mode
   */
  get isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  /**
   * Check if running in test mode
   */
  get isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }

  /**
   * Check if running in Docker environment
   */
  get isDockerEnvironment(): boolean {
    return this.config.IS_DOCKER_ENVIRONMENT;
  }

  /**
   * Get the data directory path from environment
   */
  get dataDirectory(): string | undefined {
    return this.config.MOARTUBE_DATA_DIR;
  }

  /**
   * Get the database URL from environment
   */
  get databaseUrl(): string | undefined {
    return this.config.DATABASE_URL;
  }

  /**
   * Get the log level
   */
  get logLevel(): EnvConfig['LOG_LEVEL'] {
    return this.config.LOG_LEVEL;
  }

  /**
   * Get the port from environment
   */
  get port(): number | undefined {
    return this.config.PORT;
  }

  /**
   * Get the host from environment
   */
  get host(): string | undefined {
    return this.config.HOST;
  }

  /**
   * Get the current NODE_ENV
   */
  get nodeEnv(): EnvConfig['NODE_ENV'] {
    return this.config.NODE_ENV;
  }
}

/**
 * Export singleton instance getter
 */
export function getEnv(): Env {
  return Env.getInstance();
}

/**
 * Export the Env class for testing purposes
 */
export { Env };
