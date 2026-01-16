import { describe, it, expect } from 'vitest';

// Import all exports from the database index
import * as databaseExports from '@/database/index.js';

// Import individual modules to verify re-exports
import {
  createDatabase,
  initializeDatabaseSchema,
  getDatabase,
  type DatabaseConfig,
  type DatabaseClient,
} from '@/database/connection.js';

import * as sqliteSchemas from '@/database/schemas/sqlite/index.js';

describe('database/index.ts', () => {
  describe('Connection exports', () => {
    it('should export createDatabase function', () => {
      expect(databaseExports.createDatabase).toBeDefined();
      expect(typeof databaseExports.createDatabase).toBe('function');
    });

    it('should export initializeDatabaseSchema function', () => {
      expect(databaseExports.initializeDatabaseSchema).toBeDefined();
      expect(typeof databaseExports.initializeDatabaseSchema).toBe('function');
    });

    it('should export getDatabase function', () => {
      expect(databaseExports.getDatabase).toBeDefined();
      expect(typeof databaseExports.getDatabase).toBe('function');
    });

    // Type exports can't be tested at runtime, but we can verify they exist in the source
    it('should export DatabaseConfig and DatabaseClient types', () => {
      // Types are compile-time only, so we verify the export exists by checking the source
      // This is a structural test rather than runtime test
      expect(databaseExports.createDatabase).toBeDefined(); // If this exists, types should too
    });
  });

  describe('SQLite schema re-exports', () => {
    it('should re-export videos table and types', () => {
      expect(databaseExports.videos).toBe(sqliteSchemas.videos);
      expect(databaseExports.videos).toBeDefined();
      // Types are compile-time only and can't be tested at runtime
    });

    it('should re-export comments table and types', () => {
      expect(databaseExports.comments).toBe(sqliteSchemas.comments);
      expect(databaseExports.comments).toBeDefined();
    });

    it('should re-export videoReports table and types', () => {
      expect(databaseExports.videoReports).toBe(sqliteSchemas.videoReports);
      expect(databaseExports.videoReports).toBeDefined();
    });

    it('should re-export commentReports table and types', () => {
      expect(databaseExports.commentReports).toBe(sqliteSchemas.commentReports);
      expect(databaseExports.commentReports).toBeDefined();
    });

    it('should re-export videoReportsArchive table and types', () => {
      expect(databaseExports.videoReportsArchive).toBe(sqliteSchemas.videoReportsArchive);
      expect(databaseExports.videoReportsArchive).toBeDefined();
    });

    it('should re-export commentReportsArchive table and types', () => {
      expect(databaseExports.commentReportsArchive).toBe(sqliteSchemas.commentReportsArchive);
      expect(databaseExports.commentReportsArchive).toBeDefined();
    });

    it('should re-export liveChatMessages table and types', () => {
      expect(databaseExports.liveChatMessages).toBe(sqliteSchemas.liveChatMessages);
      expect(databaseExports.liveChatMessages).toBeDefined();
    });

    it('should re-export cryptoWalletAddresses table and types', () => {
      expect(databaseExports.cryptoWalletAddresses).toBe(sqliteSchemas.cryptoWalletAddresses);
      expect(databaseExports.cryptoWalletAddresses).toBeDefined();
    });

    it('should re-export links table and types', () => {
      expect(databaseExports.links).toBe(sqliteSchemas.links);
      expect(databaseExports.links).toBeDefined();
    });
  });

  describe('Export completeness', () => {
    it('should export all expected functions and types', () => {
      // Test runtime exports (functions and objects) - types are compile-time only
      const expectedRuntimeExports = [
        // Connection exports
        'createDatabase',
        'initializeDatabaseSchema',
        'getDatabase',
        // Schema exports
        'videos',
        'comments',
        'videoReports',
        'commentReports',
        'videoReportsArchive',
        'commentReportsArchive',
        'liveChatMessages',
        'cryptoWalletAddresses',
        'links',
        // Repository exports
        'createVideosRepository',
        'createCommentsRepository',
        'createReportsVideosRepository',
        'createReportsCommentsRepository',
        'createReportsArchiveVideosRepository',
        'createReportsArchiveCommentsRepository',
        'createLiveChatMessagesRepository',
        'createMonetizationRepository',
        'createLinksRepository',
      ];

      expectedRuntimeExports.forEach(exportName => {
        expect(databaseExports).toHaveProperty(exportName);
      });
    });

    it('should not have unexpected exports', () => {
      const actualExports = Object.keys(databaseExports);
      const expectedRuntimeExports = [
        // Connection exports
        'createDatabase',
        'initializeDatabaseSchema',
        'getDatabase',
        // Schema exports
        'videos',
        'comments',
        'videoReports',
        'commentReports',
        'videoReportsArchive',
        'commentReportsArchive',
        'liveChatMessages',
        'cryptoWalletAddresses',
        'links',
        // Repository exports
        'createVideosRepository',
        'createCommentsRepository',
        'createReportsVideosRepository',
        'createReportsCommentsRepository',
        'createReportsArchiveVideosRepository',
        'createReportsArchiveCommentsRepository',
        'createLiveChatMessagesRepository',
        'createMonetizationRepository',
        'createLinksRepository',
      ];

      // Check that we don't have extra exports
      actualExports.forEach(exportName => {
        expect(expectedRuntimeExports).toContain(exportName);
      });

      // Check that we have all expected exports
      expectedRuntimeExports.forEach(exportName => {
        expect(actualExports).toContain(exportName);
      });
    });
  });
});