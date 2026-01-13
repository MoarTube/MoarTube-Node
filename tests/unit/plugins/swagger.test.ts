/**
 * Swagger Plugin Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Swagger Plugin', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['NODE_ENV'];
    delete process.env['ENABLE_SWAGGER_IN_PRODUCTION'];
  });

  describe('swaggerPlugin', () => {
    it('should export a fastify-plugin wrapped function', async () => {
      const { default: swaggerPlugin } = await import('@plugins/swagger.js');
      
      expect(swaggerPlugin).toBeDefined();
      expect(typeof swaggerPlugin).toBe('function');
    });

    it('should register swagger in development mode', async () => {
      process.env['NODE_ENV'] = 'development';
      
      const { default: swaggerPlugin } = await import('@plugins/swagger.js');
      
      const mockLog = { info: vi.fn() };
      const mockApp = {
        register: vi.fn().mockResolvedValue(undefined),
        log: mockLog,
      };

      // Call the plugin function directly (unwrapped)
      // The plugin is wrapped by fastify-plugin, so we simulate it
      await swaggerPlugin(mockApp as never, {}, vi.fn());

      // Should have registered both swagger and swagger-ui
      expect(mockApp.register).toHaveBeenCalledTimes(2);
      expect(mockLog.info).toHaveBeenCalledWith('Swagger documentation available at /documentation');
    });

    it('should skip swagger in production mode without override', async () => {
      process.env['NODE_ENV'] = 'production';
      
      const { default: swaggerPlugin } = await import('@plugins/swagger.js');
      
      const mockLog = { info: vi.fn() };
      const mockApp = {
        register: vi.fn().mockResolvedValue(undefined),
        log: mockLog,
      };

      await swaggerPlugin(mockApp as never, {}, vi.fn());

      // Should NOT have registered swagger plugins
      expect(mockApp.register).not.toHaveBeenCalled();
      expect(mockLog.info).toHaveBeenCalledWith('Swagger documentation disabled in production');
    });

    it('should register swagger in production when explicitly enabled', async () => {
      process.env['NODE_ENV'] = 'production';
      process.env['ENABLE_SWAGGER_IN_PRODUCTION'] = 'true';
      
      const { default: swaggerPlugin } = await import('@plugins/swagger.js');
      
      const mockLog = { info: vi.fn() };
      const mockApp = {
        register: vi.fn().mockResolvedValue(undefined),
        log: mockLog,
      };

      await swaggerPlugin(mockApp as never, {}, vi.fn());

      // Should have registered both swagger and swagger-ui
      expect(mockApp.register).toHaveBeenCalledTimes(2);
      expect(mockLog.info).toHaveBeenCalledWith('Swagger documentation available at /documentation');
    });

    it('should not enable swagger in production when override is not "true"', async () => {
      process.env['NODE_ENV'] = 'production';
      process.env['ENABLE_SWAGGER_IN_PRODUCTION'] = 'false';
      
      const { default: swaggerPlugin } = await import('@plugins/swagger.js');
      
      const mockLog = { info: vi.fn() };
      const mockApp = {
        register: vi.fn().mockResolvedValue(undefined),
        log: mockLog,
      };

      await swaggerPlugin(mockApp as never, {}, vi.fn());

      // Should NOT have registered swagger plugins
      expect(mockApp.register).not.toHaveBeenCalled();
    });
  });
});
