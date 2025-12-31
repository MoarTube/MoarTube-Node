import { describe, it, expect } from 'vitest';
import type {
  PostgresConfig,
  DatabaseConfig,
  S3Credentials,
  S3ProviderClientConfig,
  S3Config,
  StorageConfig,
  NodeSettings,
  NodeIdentification,
  LastCheckedContentTracker,
  IndexerConfig,
  AliaserConfig,
} from '@/types/config.js';

describe('types/config.ts', () => {
  describe('PostgresConfig interface', () => {
    it('should create a complete PostgreSQL configuration', () => {
      const config: PostgresConfig = {
        databaseName: 'moartube_db',
        username: 'moartube_user',
        password: 'secure_password',
        host: 'localhost',
        port: 5432,
      };

      expect(config.databaseName).toBe('moartube_db');
      expect(config.username).toBe('moartube_user');
      expect(config.password).toBe('secure_password');
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(5432);
    });
  });

  describe('DatabaseConfig interface', () => {
    it('should create SQLite database configuration', () => {
      const config: DatabaseConfig = {
        databaseDialect: 'sqlite',
      };

      expect(config.databaseDialect).toBe('sqlite');
      expect(config.postgresConfig).toBeUndefined();
    });

    it('should create PostgreSQL database configuration', () => {
      const config: DatabaseConfig = {
        databaseDialect: 'postgres',
        postgresConfig: {
          databaseName: 'moartube_db',
          username: 'moartube_user',
          password: 'secure_password',
          host: 'localhost',
          port: 5432,
        },
      };

      expect(config.databaseDialect).toBe('postgres');
      expect(config.postgresConfig).toBeDefined();
      expect(config.postgresConfig?.databaseName).toBe('moartube_db');
    });
  });

  describe('S3Credentials interface', () => {
    it('should create S3 credentials', () => {
      const credentials: S3Credentials = {
        accessKeyId: 'AKIAEXAMPLE',
        secretAccessKey: 'secret-key-example',
      };

      expect(credentials.accessKeyId).toBe('AKIAEXAMPLE');
      expect(credentials.secretAccessKey).toBe('secret-key-example');
    });
  });

  describe('S3ProviderClientConfig interface', () => {
    it('should create S3 provider client config with endpoint', () => {
      const config: S3ProviderClientConfig = {
        forcePathStyle: true,
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'AKIAEXAMPLE',
          secretAccessKey: 'secret-key-example',
        },
        endpoint: 'https://s3.amazonaws.com',
      };

      expect(config.forcePathStyle).toBe(true);
      expect(config.region).toBe('us-east-1');
      expect(config.credentials.accessKeyId).toBe('AKIAEXAMPLE');
      expect(config.endpoint).toBe('https://s3.amazonaws.com');
    });

    it('should create S3 provider client config without endpoint', () => {
      const config: S3ProviderClientConfig = {
        forcePathStyle: false,
        region: 'eu-west-1',
        credentials: {
          accessKeyId: 'AKIAEXAMPLE2',
          secretAccessKey: 'secret-key-example2',
        },
      };

      expect(config.forcePathStyle).toBe(false);
      expect(config.region).toBe('eu-west-1');
      expect(config.endpoint).toBeUndefined();
    });
  });

  describe('S3Config interface', () => {
    it('should create S3 configuration', () => {
      const config: S3Config = {
        bucketName: 'moartube-videos',
        s3ProviderClientConfig: {
          forcePathStyle: true,
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'AKIAEXAMPLE',
            secretAccessKey: 'secret-key-example',
          },
        },
      };

      expect(config.bucketName).toBe('moartube-videos');
      expect(config.s3ProviderClientConfig.forcePathStyle).toBe(true);
      expect(config.s3ProviderClientConfig.region).toBe('us-east-1');
    });
  });

  describe('StorageConfig interface', () => {
    it('should create filesystem storage configuration', () => {
      const config: StorageConfig = {
        storageMode: 'filesystem',
      };

      expect(config.storageMode).toBe('filesystem');
      expect(config.s3Config).toBeUndefined();
    });

    it('should create S3 storage configuration', () => {
      const config: StorageConfig = {
        storageMode: 's3provider',
        s3Config: {
          bucketName: 'moartube-videos',
          s3ProviderClientConfig: {
            forcePathStyle: true,
            region: 'us-east-1',
            credentials: {
              accessKeyId: 'AKIAEXAMPLE',
              secretAccessKey: 'secret-key-example',
            },
          },
        },
      };

      expect(config.storageMode).toBe('s3provider');
      expect(config.s3Config).toBeDefined();
      expect(config.s3Config?.bucketName).toBe('moartube-videos');
    });
  });

  describe('NodeSettings interface', () => {
    it('should create complete node settings', () => {
      const settings: NodeSettings = {
        // Server Configuration
        nodeListeningPort: 8080,
        isSecure: true,
        publicNodeProtocol: 'https',
        publicNodeAddress: 'node.moartube.com',
        publicNodePort: 443,

        // Node Identity
        nodeName: 'My MoarTube Node',
        nodeAbout: 'A video sharing node',
        nodeId: 'node-123',

        // Authentication
        username: 'admin',
        password: 'hashed_password',

        // Cloudflare Settings
        isCloudflareCdnEnabled: true,
        cloudflareEmailAddress: 'admin@example.com',
        cloudflareZoneId: 'zone123',
        cloudflareGlobalApiKey: 'api_key',
        isCloudflareTurnstileEnabled: true,
        cloudflareTurnstileSiteKey: 'site_key',
        cloudflareTurnstileSecretKey: 'secret_key',

        // Feature Flags
        isCommentsEnabled: true,
        isLikesEnabled: true,
        isDislikesEnabled: true,
        isReportsEnabled: true,
        isLiveChatEnabled: true,

        // Database & Storage
        databaseConfig: {
          databaseDialect: 'sqlite',
        },
        storageConfig: {
          storageMode: 'filesystem',
        },
      };

      expect(settings.nodeListeningPort).toBe(8080);
      expect(settings.isSecure).toBe(true);
      expect(settings.publicNodeProtocol).toBe('https');
      expect(settings.nodeName).toBe('My MoarTube Node');
      expect(settings.isCommentsEnabled).toBe(true);
      expect(settings.databaseConfig.databaseDialect).toBe('sqlite');
      expect(settings.storageConfig.storageMode).toBe('filesystem');
    });

    it('should handle optional external videos base URL', () => {
      const settings: NodeSettings = {
        nodeListeningPort: 8080,
        isSecure: false,
        publicNodeProtocol: '',
        publicNodeAddress: 'localhost',
        publicNodePort: 8080,
        nodeName: 'Test Node',
        nodeAbout: 'Test',
        nodeId: 'test-123',
        username: 'admin',
        password: 'pass',
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
        databaseConfig: { databaseDialect: 'sqlite' },
        storageConfig: { storageMode: 'filesystem' },
        externalVideosBaseUrl: 'https://cdn.example.com/videos',
      };

      expect(settings.externalVideosBaseUrl).toBe('https://cdn.example.com/videos');
    });
  });

  describe('NodeIdentification interface', () => {
    it('should create node identification', () => {
      const identification: NodeIdentification = {
        moarTubeTokenProof: 'proof-token-123',
      };

      expect(identification.moarTubeTokenProof).toBe('proof-token-123');
    });
  });

  describe('LastCheckedContentTracker interface', () => {
    it('should create content tracker with timestamps', () => {
      const tracker: LastCheckedContentTracker = {
        lastCheckedCommentsTimestamp: 1640995200000, // 2022-01-01 00:00:00 UTC
        lastCheckedVideoReportsTimestamp: 1641081600000, // 2022-01-02 00:00:00 UTC
        lastCheckedCommentReportsTimestamp: 1641168000000, // 2022-01-03 00:00:00 UTC
      };

      expect(tracker.lastCheckedCommentsTimestamp).toBe(1640995200000);
      expect(tracker.lastCheckedVideoReportsTimestamp).toBe(1641081600000);
      expect(tracker.lastCheckedCommentReportsTimestamp).toBe(1641168000000);
    });
  });

  describe('IndexerConfig interface', () => {
    it('should create indexer configuration', () => {
      const config: IndexerConfig = {
        httpProtocol: 'https',
        host: 'indexer.moartube.com',
        port: 8443,
      };

      expect(config.httpProtocol).toBe('https');
      expect(config.host).toBe('indexer.moartube.com');
      expect(config.port).toBe(8443);
    });

    it('should support HTTP protocol', () => {
      const config: IndexerConfig = {
        httpProtocol: 'http',
        host: 'localhost',
        port: 8080,
      };

      expect(config.httpProtocol).toBe('http');
      expect(config.host).toBe('localhost');
      expect(config.port).toBe(8080);
    });
  });

  describe('AliaserConfig interface', () => {
    it('should create aliaser configuration', () => {
      const config: AliaserConfig = {
        httpProtocol: 'https',
        host: 'aliaser.moartube.com',
        port: 8443,
      };

      expect(config.httpProtocol).toBe('https');
      expect(config.host).toBe('aliaser.moartube.com');
      expect(config.port).toBe(8443);
    });
  });
});