import { describe, it, expect } from 'vitest';
import type {
  DatabaseConfig,
  StorageConfig,
  IndexerConfig,
  AliaserConfig,
  NodeSettings,
  NodeIdentification,
  LastCheckedContentTracker,
} from '@/types/index.js';

describe('types/index.ts', () => {
  describe('Type exports', () => {
    it('should export DatabaseConfig type', () => {
      // Type-only test - ensures the type can be imported and used
      const config: DatabaseConfig = {
        databaseDialect: 'sqlite',
      };
      expect(config.databaseDialect).toBe('sqlite');
    });

    it('should export StorageConfig type', () => {
      const config: StorageConfig = {
        storageMode: 'filesystem',
      };
      expect(config.storageMode).toBe('filesystem');
    });

    it('should export IndexerConfig type', () => {
      const config: IndexerConfig = {
        httpProtocol: 'https',
        host: 'indexer.moartube.com',
        port: 443,
      };
      expect(config.httpProtocol).toBe('https');
      expect(config.host).toBe('indexer.moartube.com');
      expect(config.port).toBe(443);
    });

    it('should export AliaserConfig type', () => {
      const config: AliaserConfig = {
        httpProtocol: 'https',
        host: 'aliaser.moartube.com',
        port: 443,
      };
      expect(config.httpProtocol).toBe('https');
      expect(config.host).toBe('aliaser.moartube.com');
      expect(config.port).toBe(443);
    });

    it('should export NodeSettings type', () => {
      const settings: NodeSettings = {
        nodeListeningPort: 80,
        isSecure: false,
        publicNodeProtocol: 'http',
        publicNodeAddress: 'localhost',
        publicNodePort: 80,
        nodeName: 'Test Node',
        nodeAbout: 'Test node description',
        nodeId: 'test-node-id',
        username: 'dGVzdA==', // base64 encoded 'test'
        password: 'dGVzdA==', // base64 encoded 'test'
        isCloudflareCdnEnabled: false,
        cloudflareEmailAddress: '',
        cloudflareZoneId: '',
        cloudflareGlobalApiKey: '',
        isCloudflareTurnstileEnabled: false,
        cloudflareTurnstileSiteKey: '',
        cloudflareTurnstileSecretKey: '',
        isCommentsEnabled: true,
        isLikesEnabled: true,
        isDislikesEnabled: true,
        isReportsEnabled: true,
        isLiveChatEnabled: true,
        databaseConfig: {
          databaseDialect: 'sqlite',
        },
        storageConfig: {
          storageMode: 'filesystem',
        },
      };
      expect(settings.nodeName).toBe('Test Node');
      expect(settings.databaseConfig.databaseDialect).toBe('sqlite');
    });

    it('should export NodeIdentification type', () => {
      const identification: NodeIdentification = {
        moarTubeTokenProof: 'test-token-proof',
      };
      expect(identification.moarTubeTokenProof).toBe('test-token-proof');
    });

    it('should export LastCheckedContentTracker type', () => {
      const tracker: LastCheckedContentTracker = {
        lastCheckedCommentsTimestamp: 1640995200000, // 2022-01-01
        lastCheckedVideoReportsTimestamp: 1640995200000,
        lastCheckedCommentReportsTimestamp: 1640995200000,
      };
      expect(tracker.lastCheckedCommentsTimestamp).toBe(1640995200000);
    });
  });
});