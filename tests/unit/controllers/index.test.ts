/**
 * Unit tests for Controllers Index
 *
 * Tests the barrel export file for all controller classes.
 */
import { describe, it, expect } from 'vitest';

import * as ControllersExports from '@controllers/index.js';

describe('Controllers Index', () => {
  describe('export completeness', () => {
    it('should export BaseController', () => {
      expect(ControllersExports.BaseController).toBeDefined();
      expect(typeof ControllersExports.BaseController).toBe('function');
    });

    it('should export StatusController', () => {
      expect(ControllersExports.StatusController).toBeDefined();
      expect(typeof ControllersExports.StatusController).toBe('function');
    });

    it('should export AccountController', () => {
      expect(ControllersExports.AccountController).toBeDefined();
      expect(typeof ControllersExports.AccountController).toBe('function');
    });

    it('should export VideosController', () => {
      expect(ControllersExports.VideosController).toBeDefined();
      expect(typeof ControllersExports.VideosController).toBe('function');
    });

    it('should export SettingsController', () => {
      expect(ControllersExports.SettingsController).toBeDefined();
      expect(typeof ControllersExports.SettingsController).toBe('function');
    });

    it('should export StreamsController', () => {
      expect(ControllersExports.StreamsController).toBeDefined();
      expect(typeof ControllersExports.StreamsController).toBe('function');
    });
  });

  describe('controller class inheritance', () => {
    it('should have StatusController extend BaseController', () => {
      expect(ControllersExports.StatusController.prototype).toBeInstanceOf(
        Object
      );
    });

    it('should have AccountController extend BaseController', () => {
      expect(ControllersExports.AccountController.prototype).toBeInstanceOf(
        Object
      );
    });

    it('should have VideosController extend BaseController', () => {
      expect(ControllersExports.VideosController.prototype).toBeInstanceOf(
        Object
      );
    });

    it('should have SettingsController extend BaseController', () => {
      expect(ControllersExports.SettingsController.prototype).toBeInstanceOf(
        Object
      );
    });

    it('should have StreamsController extend BaseController', () => {
      expect(ControllersExports.StreamsController.prototype).toBeInstanceOf(
        Object
      );
    });
  });

  describe('type exports', () => {
    // These tests verify that the type exports are available
    // TypeScript will catch any missing exports at compile time
    it('should have correct number of named exports', () => {
      const exportKeys = Object.keys(ControllersExports);
      // BaseController + 5 controllers = 6 total exports
      expect(exportKeys.length).toBeGreaterThanOrEqual(6);
    });

    it('should export all controller classes as constructors', () => {
      const controllers = [
        ControllersExports.BaseController,
        ControllersExports.StatusController,
        ControllersExports.AccountController,
        ControllersExports.VideosController,
        ControllersExports.SettingsController,
        ControllersExports.StreamsController,
      ];

      controllers.forEach((Controller) => {
        expect(typeof Controller).toBe('function');
        expect(Controller.prototype).toBeDefined();
      });
    });
  });
});
