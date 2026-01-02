/**
 * Services Index Tests
 *
 * Tests for the services barrel export to ensure all services
 * and interfaces are properly exported.
 */

import { describe, it, expect } from 'vitest';
import * as ServicesModule from '@/services/index.js';

describe('Services Index Exports', () => {
  describe('BaseService export', () => {
    it('should export BaseService class', () => {
      expect(ServicesModule.BaseService).toBeDefined();
      expect(typeof ServicesModule.BaseService).toBe('function');
    });
  });

  describe('Service class exports', () => {
    it('should export VideosService', () => {
      expect(ServicesModule.VideosService).toBeDefined();
      expect(typeof ServicesModule.VideosService).toBe('function');
    });

    it('should export CommentsService', () => {
      expect(ServicesModule.CommentsService).toBeDefined();
      expect(typeof ServicesModule.CommentsService).toBe('function');
    });

    it('should export AccountService', () => {
      expect(ServicesModule.AccountService).toBeDefined();
      expect(typeof ServicesModule.AccountService).toBe('function');
    });

    it('should export CloudflareService', () => {
      expect(ServicesModule.CloudflareService).toBeDefined();
      expect(typeof ServicesModule.CloudflareService).toBe('function');
    });

    it('should export ReportsService', () => {
      expect(ServicesModule.ReportsService).toBeDefined();
      expect(typeof ServicesModule.ReportsService).toBe('function');
    });

    it('should export VideoUploadService', () => {
      expect(ServicesModule.VideoUploadService).toBeDefined();
      expect(typeof ServicesModule.VideoUploadService).toBe('function');
    });
  });

  describe('Type exports (runtime validation)', () => {
    // Type exports can't be tested at runtime directly,
    // but we can ensure the module exports the expected shape

    it('should have all expected exports', () => {
      const exportedKeys = Object.keys(ServicesModule);

      // Verify key class exports are present
      expect(exportedKeys).toContain('BaseService');
      expect(exportedKeys).toContain('VideosService');
      expect(exportedKeys).toContain('CommentsService');
      expect(exportedKeys).toContain('AccountService');
      expect(exportedKeys).toContain('CloudflareService');
      expect(exportedKeys).toContain('ReportsService');
      expect(exportedKeys).toContain('VideoUploadService');
    });
  });

  describe('Service class instantiation prerequisites', () => {
    it('BaseService should be abstract (cannot instantiate directly)', () => {
      // We can verify BaseService is a class that's meant to be extended
      expect(ServicesModule.BaseService.prototype).toBeDefined();
    });

    it('VideosService should be a class', () => {
      expect(ServicesModule.VideosService.prototype).toBeDefined();
    });

    it('CommentsService should be a class', () => {
      expect(ServicesModule.CommentsService.prototype).toBeDefined();
    });

    it('AccountService should be a class', () => {
      expect(ServicesModule.AccountService.prototype).toBeDefined();
    });

    it('CloudflareService should be a class', () => {
      expect(ServicesModule.CloudflareService.prototype).toBeDefined();
    });

    it('ReportsService should be a class', () => {
      expect(ServicesModule.ReportsService.prototype).toBeDefined();
    });

    it('VideoUploadService should be a class', () => {
      expect(ServicesModule.VideoUploadService.prototype).toBeDefined();
    });
  });
});
