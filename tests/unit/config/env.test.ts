import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock process.env before importing the module
const originalEnv = process.env;

// Create a mock process.env for each test
function mockProcessEnv(envVars: Record<string, string | undefined>) {
  const mockEnv = { ...originalEnv };
  Object.keys(envVars).forEach(key => {
    if (envVars[key] === undefined) {
      delete mockEnv[key];
    } else {
      mockEnv[key] = envVars[key];
    }
  });
  process.env = mockEnv;
}

describe('config/env.ts', () => {
  // Import after mocking setup
  let Env: any, getEnv: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset process.env to original
    process.env = { ...originalEnv };

    // Re-import the module to get a fresh singleton
    const envModule = await import('@/config/env.js');
    Env = envModule.Env;
    getEnv = envModule.getEnv;

    // Reset singleton instance
    Env.resetInstance();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Env singleton', () => {
    it('should be a singleton', () => {
      mockProcessEnv({ NODE_ENV: 'production' });

      const env1 = Env.getInstance();
      const env2 = Env.getInstance();
      expect(env1).toBe(env2);
    });

    it('should return the same instance via getEnv()', () => {
      mockProcessEnv({ NODE_ENV: 'production' });

      const env1 = getEnv();
      const env2 = getEnv();
      expect(env1).toBe(env2);
    });
  });

  describe('Environment loading and validation', () => {
    it('should load default values when no environment variables are set', () => {
      mockProcessEnv({ NODE_ENV: 'production' });

      const env = new Env();

      expect(env.nodeEnv).toBe('production');
      expect(env.isDockerEnvironment).toBe(false); // transform converts undefined to false
    });

    it('should load NODE_ENV=development correctly', () => {
      mockProcessEnv({ NODE_ENV: 'development' });

      const env = new Env();

      expect(env.nodeEnv).toBe('development');
      expect(env.isDevelopment).toBe(true);
      expect(env.isProduction).toBe(false);
    });

    it('should load NODE_ENV=production correctly', () => {
      mockProcessEnv({ NODE_ENV: 'production' });

      const env = new Env();

      expect(env.nodeEnv).toBe('production');
      expect(env.isDevelopment).toBe(false);
      expect(env.isProduction).toBe(true);
    });

    it('should load IS_DOCKER_ENVIRONMENT=true correctly', () => {
      mockProcessEnv({ NODE_ENV: 'production', IS_DOCKER_ENVIRONMENT: 'true' });

      const env = new Env();

      expect(env.isDockerEnvironment).toBe(true);
    });

    it('should load IS_DOCKER_ENVIRONMENT=false correctly', () => {
      mockProcessEnv({ NODE_ENV: 'production', IS_DOCKER_ENVIRONMENT: 'false' });

      const env = new Env();

      expect(env.isDockerEnvironment).toBe(false);
    });

    it('should handle undefined IS_DOCKER_ENVIRONMENT', () => {
      mockProcessEnv({ NODE_ENV: 'production', IS_DOCKER_ENVIRONMENT: undefined });

      const env = new Env();

      expect(env.isDockerEnvironment).toBe(false); // transform converts undefined to false
    });

    it('should throw error for invalid NODE_ENV', () => {
      mockProcessEnv({ NODE_ENV: 'invalid' });

      expect(() => new Env()).toThrow('Invalid environment configuration');
    });

    it('should load optional environment variables', () => {
      mockProcessEnv({
        NODE_ENV: 'production',
        MOARTUBE_DATA_DIR: '/custom/data/dir',
        DATABASE_URL: 'postgresql://localhost:5432/db',
        LOG_LEVEL: 'debug',
        PORT: '3000',
        HOST: 'localhost'
      });

      const env = new Env();

      expect(env.dataDirectory).toBe('/custom/data/dir');
      expect(env.databaseUrl).toBe('postgresql://localhost:5432/db');
      expect(env.logLevel).toBe('debug');
      expect(env.port).toBe(3000);
      expect(env.host).toBe('localhost');
    });

    it('should handle empty PORT as undefined', () => {
      mockProcessEnv({ NODE_ENV: 'production', PORT: '' });

      const env = new Env();

      expect(env.port).toBeUndefined();
    });

    it('should convert PORT string to number', () => {
      mockProcessEnv({ NODE_ENV: 'production', PORT: '8080' });

      const env = new Env();

      expect(env.port).toBe(8080);
      expect(typeof env.port).toBe('number');
    });
  });

  describe('Environment access methods', () => {
    let env: any;

    beforeEach(() => {
      mockProcessEnv({
        NODE_ENV: 'development',
        IS_DOCKER_ENVIRONMENT: 'true',
        MOARTUBE_DATA_DIR: '/test/data',
        DATABASE_URL: 'sqlite:///test.db',
        LOG_LEVEL: 'trace',
        PORT: '4000',
        HOST: '0.0.0.0'
      });

      env = new Env();
    });

    it('should return frozen config object from getAll()', () => {
      const config = env.getAll();

      expect(config).toEqual({
        NODE_ENV: 'development',
        IS_DOCKER_ENVIRONMENT: true,
        MOARTUBE_DATA_DIR: '/test/data',
        DATABASE_URL: 'sqlite:///test.db',
        LOG_LEVEL: 'trace',
        PORT: 4000,
        HOST: '0.0.0.0',
      });

      // Should be frozen/read-only
      expect(() => {
        (config as any).NODE_ENV = 'production';
      }).toThrow();
    });

    it('should provide correct boolean getters', () => {
      expect(env.isDevelopment).toBe(true);
      expect(env.isProduction).toBe(false);
      expect(env.isDockerEnvironment).toBe(true);
    });

    it('should provide correct value getters', () => {
      expect(env.dataDirectory).toBe('/test/data');
      expect(env.databaseUrl).toBe('sqlite:///test.db');
      expect(env.logLevel).toBe('trace');
      expect(env.port).toBe(4000);
      expect(env.host).toBe('0.0.0.0');
      expect(env.nodeEnv).toBe('development');
    });
  });

  describe('Default values', () => {
    it('should use correct defaults when env vars are missing', () => {
      mockProcessEnv({ NODE_ENV: 'production' });

      const env = new Env();
      const config = env.getAll();

      expect(config.NODE_ENV).toBe('production');
      expect(config.IS_DOCKER_ENVIRONMENT).toBe(false); // transform converts undefined to false
      expect(config.MOARTUBE_DATA_DIR).toBeUndefined();
      expect(config.DATABASE_URL).toBeUndefined();
      expect(config.LOG_LEVEL).toBe('info');
      expect(config.PORT).toBeUndefined();
      expect(config.HOST).toBeUndefined();
    });
  });
});