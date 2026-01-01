import { describe, it, expect } from 'vitest';
import {
  PostgresConfigSchema,
  DatabaseConfigSchema,
  S3CredentialsSchema,
  S3ProviderClientConfigSchema,
  S3ConfigSchema,
  StorageConfigSchema,
  NodeSettingsSchema,
  IndexerConfigSchema,
  AliaserConfigSchema,
  AppConfigSchema,
  NodeIdentificationSchema,
  LastCheckedContentTrackerSchema,
  validateNodeSettings,
  validateAppConfig,
  validateNodeIdentification,
  validateLastCheckedContentTracker,
  type NodeSettingsValidated,
  type AppConfigValidated,
  type NodeIdentificationValidated,
  type LastCheckedContentTrackerValidated,
} from '@/config/schema.js';

describe('config/schema.ts', () => {
  describe('Database Configuration Schemas', () => {
    describe('PostgresConfigSchema', () => {
      it('should validate valid PostgreSQL config', () => {
        const validConfig = {
          databaseName: 'moartube',
          username: 'postgres',
          password: 'password123',
          host: 'localhost',
          port: 5432,
        };

        const result = PostgresConfigSchema.safeParse(validConfig);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validConfig);
      });

      it('should use default port when not provided', () => {
        const configWithoutPort = {
          databaseName: 'moartube',
          username: 'postgres',
          password: 'password123',
          host: 'localhost',
        };

        const result = PostgresConfigSchema.safeParse(configWithoutPort);
        expect(result.success).toBe(true);
        expect(result.data?.port).toBe(5432);
      });

      it('should reject empty database name', () => {
        const invalidConfig = {
          databaseName: '',
          username: 'postgres',
          password: 'password123',
          host: 'localhost',
          port: 5432,
        };

        const result = PostgresConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Database name is required');
      });

      it('should reject empty username', () => {
        const invalidConfig = {
          databaseName: 'moartube',
          username: '',
          password: 'password123',
          host: 'localhost',
          port: 5432,
        };

        const result = PostgresConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Username is required');
      });

      it('should reject empty host', () => {
        const invalidConfig = {
          databaseName: 'moartube',
          username: 'postgres',
          password: 'password123',
          host: '',
          port: 5432,
        };

        const result = PostgresConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Host is required');
      });

      it('should reject invalid port numbers', () => {
        const invalidConfig = {
          databaseName: 'moartube',
          username: 'postgres',
          password: 'password123',
          host: 'localhost',
          port: 0,
        };

        const result = PostgresConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
      });
    });

    describe('DatabaseConfigSchema', () => {
      it('should validate SQLite config', () => {
        const sqliteConfig = {
          databaseDialect: 'sqlite' as const,
        };

        const result = DatabaseConfigSchema.safeParse(sqliteConfig);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(sqliteConfig);
      });

      it('should validate PostgreSQL config', () => {
        const postgresConfig = {
          databaseDialect: 'postgres' as const,
          postgresConfig: {
            databaseName: 'moartube',
            username: 'postgres',
            password: 'password123',
            host: 'localhost',
            port: 5432,
          },
        };

        const result = DatabaseConfigSchema.safeParse(postgresConfig);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(postgresConfig);
      });

      it('should reject invalid database dialect', () => {
        const invalidConfig = {
          databaseDialect: 'mysql' as any,
        };

        const result = DatabaseConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('S3 Storage Configuration Schemas', () => {
    describe('S3CredentialsSchema', () => {
      it('should validate valid S3 credentials', () => {
        const validCredentials = {
          accessKeyId: 'AKIAEXAMPLE',
          secretAccessKey: 'secret123',
        };

        const result = S3CredentialsSchema.safeParse(validCredentials);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validCredentials);
      });

      it('should reject empty access key ID', () => {
        const invalidCredentials = {
          accessKeyId: '',
          secretAccessKey: 'secret123',
        };

        const result = S3CredentialsSchema.safeParse(invalidCredentials);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Access key ID is required');
      });

      it('should reject empty secret access key', () => {
        const invalidCredentials = {
          accessKeyId: 'AKIAEXAMPLE',
          secretAccessKey: '',
        };

        const result = S3CredentialsSchema.safeParse(invalidCredentials);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Secret access key is required');
      });
    });

    describe('S3ProviderClientConfigSchema', () => {
      it('should validate valid S3 client config', () => {
        const validConfig = {
          forcePathStyle: false,
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'AKIAEXAMPLE',
            secretAccessKey: 'secret123',
          },
          endpoint: 'https://s3.amazonaws.com',
        };

        const result = S3ProviderClientConfigSchema.safeParse(validConfig);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validConfig);
      });

      it('should use default forcePathStyle when not provided', () => {
        const configWithoutForcePathStyle = {
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'AKIAEXAMPLE',
            secretAccessKey: 'secret123',
          },
        };

        const result = S3ProviderClientConfigSchema.safeParse(configWithoutForcePathStyle);
        expect(result.success).toBe(true);
        expect(result.data?.forcePathStyle).toBe(false);
      });

      it('should reject empty region', () => {
        const invalidConfig = {
          forcePathStyle: false,
          region: '',
          credentials: {
            accessKeyId: 'AKIAEXAMPLE',
            secretAccessKey: 'secret123',
          },
        };

        const result = S3ProviderClientConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Region is required');
      });

      it('should reject invalid endpoint URL', () => {
        const invalidConfig = {
          forcePathStyle: false,
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'AKIAEXAMPLE',
            secretAccessKey: 'secret123',
          },
          endpoint: 'not-a-url',
        };

        const result = S3ProviderClientConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
      });
    });

    describe('S3ConfigSchema', () => {
      it('should validate valid S3 config', () => {
        const validConfig = {
          bucketName: 'my-bucket',
          s3ProviderClientConfig: {
            forcePathStyle: false,
            region: 'us-east-1',
            credentials: {
              accessKeyId: 'AKIAEXAMPLE',
              secretAccessKey: 'secret123',
            },
          },
        };

        const result = S3ConfigSchema.safeParse(validConfig);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validConfig);
      });

      it('should reject empty bucket name', () => {
        const invalidConfig = {
          bucketName: '',
          s3ProviderClientConfig: {
            forcePathStyle: false,
            region: 'us-east-1',
            credentials: {
              accessKeyId: 'AKIAEXAMPLE',
              secretAccessKey: 'secret123',
            },
          },
        };

        const result = S3ConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Bucket name is required');
      });
    });

    describe('StorageConfigSchema', () => {
      it('should validate filesystem storage config', () => {
        const filesystemConfig = {
          storageMode: 'filesystem' as const,
        };

        const result = StorageConfigSchema.safeParse(filesystemConfig);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(filesystemConfig);
      });

      it('should validate S3 provider storage config', () => {
        const s3Config = {
          storageMode: 's3provider' as const,
          s3Config: {
            bucketName: 'my-bucket',
            s3ProviderClientConfig: {
              forcePathStyle: false,
              region: 'us-east-1',
              credentials: {
                accessKeyId: 'AKIAEXAMPLE',
                secretAccessKey: 'secret123',
              },
            },
          },
        };

        const result = StorageConfigSchema.safeParse(s3Config);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(s3Config);
      });

      it('should reject invalid storage mode', () => {
        const invalidConfig = {
          storageMode: 'invalid' as any,
        };

        const result = StorageConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Node Settings Schema', () => {
    describe('NodeSettingsSchema', () => {
      const validNodeSettings = {
        nodeListeningPort: 8080,
        isSecure: false,
        publicNodeProtocol: 'https' as const,
        publicNodeAddress: 'example.com',
        publicNodePort: 443,
        nodeName: 'Test Node',
        nodeAbout: 'A test node',
        nodeId: 'node-123',
        username: 'hashed-username',
        password: 'hashed-password',
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
          databaseDialect: 'sqlite' as const,
        },
        storageConfig: {
          storageMode: 'filesystem' as const,
        },
      };

      it('should validate complete valid node settings', () => {
        const result = NodeSettingsSchema.safeParse(validNodeSettings);
        expect(result.success).toBe(true);
        expect(result.data?.nodeListeningPort).toBe(8080);
      });

      it('should transform string port to number', () => {
        const settingsWithStringPort = {
          ...validNodeSettings,
          nodeListeningPort: '9090',
        };

        const result = NodeSettingsSchema.safeParse(settingsWithStringPort);
        expect(result.success).toBe(true);
        expect(result.data?.nodeListeningPort).toBe(9090);
      });

      it('should reject invalid port numbers', () => {
        const invalidSettings = {
          ...validNodeSettings,
          nodeListeningPort: 99999,
        };

        const result = NodeSettingsSchema.safeParse(invalidSettings);
        expect(result.success).toBe(false);
      });

      it('should reject NaN port values', () => {
        const invalidSettings = {
          ...validNodeSettings,
          nodeListeningPort: 'not-a-number',
        };

        const result = NodeSettingsSchema.safeParse(invalidSettings);
        expect(result.success).toBe(false);
      });

      it('should use defaults for optional fields', () => {
        const minimalSettings = {
          nodeListeningPort: 8080,
          username: 'hashed-username',
          password: 'hashed-password',
          databaseConfig: {
            databaseDialect: 'sqlite' as const,
          },
          storageConfig: {
            storageMode: 'filesystem' as const,
          },
        };

        const result = NodeSettingsSchema.safeParse(minimalSettings);
        expect(result.success).toBe(true);
        expect(result.data?.isSecure).toBe(false);
        expect(result.data?.publicNodeProtocol).toBe('');
        expect(result.data?.nodeName).toBe('MoarTube Node');
      });

      it('should reject empty username', () => {
        const invalidSettings = {
          ...validNodeSettings,
          username: '',
        };

        const result = NodeSettingsSchema.safeParse(invalidSettings);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Username hash is required');
      });

      it('should reject empty password', () => {
        const invalidSettings = {
          ...validNodeSettings,
          password: '',
        };

        const result = NodeSettingsSchema.safeParse(invalidSettings);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Password hash is required');
      });
    });
  });

  describe('App Config Schemas', () => {
    describe('IndexerConfigSchema', () => {
      it('should validate valid indexer config', () => {
        const validConfig = {
          httpProtocol: 'https' as const,
          host: 'indexer.moartube.com',
          port: 443,
        };

        const result = IndexerConfigSchema.safeParse(validConfig);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validConfig);
      });

      it('should reject empty host', () => {
        const invalidConfig = {
          httpProtocol: 'https' as const,
          host: '',
          port: 443,
        };

        const result = IndexerConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Indexer host is required');
      });

      it('should reject invalid port', () => {
        const invalidConfig = {
          httpProtocol: 'https' as const,
          host: 'indexer.moartube.com',
          port: 0,
        };

        const result = IndexerConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
      });
    });

    describe('AliaserConfigSchema', () => {
      it('should validate valid aliaser config', () => {
        const validConfig = {
          httpProtocol: 'https' as const,
          host: 'aliaser.moartube.com',
          port: 443,
        };

        const result = AliaserConfigSchema.safeParse(validConfig);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validConfig);
      });

      it('should reject empty host', () => {
        const invalidConfig = {
          httpProtocol: 'https' as const,
          host: '',
          port: 443,
        };

        const result = AliaserConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe('Aliaser host is required');
      });
    });

    describe('AppConfigSchema', () => {
      it('should validate valid app config', () => {
        const validConfig = {
          isDeveloperMode: false,
          indexerConfig: {
            httpProtocol: 'https' as const,
            host: 'indexer.moartube.com',
            port: 443,
          },
          aliaserConfig: {
            httpProtocol: 'https' as const,
            host: 'aliaser.moartube.com',
            port: 443,
          },
        };

        const result = AppConfigSchema.safeParse(validConfig);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validConfig);
      });

      it('should use default for isDeveloperMode', () => {
        const configWithoutDevMode = {
          indexerConfig: {
            httpProtocol: 'https' as const,
            host: 'indexer.moartube.com',
            port: 443,
          },
          aliaserConfig: {
            httpProtocol: 'https' as const,
            host: 'aliaser.moartube.com',
            port: 443,
          },
        };

        const result = AppConfigSchema.safeParse(configWithoutDevMode);
        expect(result.success).toBe(true);
        expect(result.data?.isDeveloperMode).toBe(false);
      });
    });
  });

  describe('Node Identification Schema', () => {
    describe('NodeIdentificationSchema', () => {
      it('should validate valid node identification', () => {
        const validIdentification = {
          moarTubeTokenProof: 'token-proof-123',
        };

        const result = NodeIdentificationSchema.safeParse(validIdentification);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validIdentification);
      });

      it('should reject empty token proof', () => {
        const invalidIdentification = {
          moarTubeTokenProof: '',
        };

        const result = NodeIdentificationSchema.safeParse(invalidIdentification);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Last Checked Content Tracker Schema', () => {
    describe('LastCheckedContentTrackerSchema', () => {
      it('should validate valid content tracker', () => {
        const validTracker = {
          lastCheckedCommentsTimestamp: 1234567890,
          lastCheckedVideoReportsTimestamp: 1234567891,
          lastCheckedCommentReportsTimestamp: 1234567892,
        };

        const result = LastCheckedContentTrackerSchema.safeParse(validTracker);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validTracker);
      });

      it('should use defaults for missing timestamps', () => {
        const emptyTracker = {};

        const result = LastCheckedContentTrackerSchema.safeParse(emptyTracker);
        expect(result.success).toBe(true);
        expect(result.data?.lastCheckedCommentsTimestamp).toBe(0);
        expect(result.data?.lastCheckedVideoReportsTimestamp).toBe(0);
        expect(result.data?.lastCheckedCommentReportsTimestamp).toBe(0);
      });
    });
  });

  describe('Validation Helper Functions', () => {
    describe('validateNodeSettings', () => {
      it('should validate and return valid node settings', () => {
        const validSettings = {
          nodeListeningPort: 8080,
          username: 'hashed-username',
          password: 'hashed-password',
          databaseConfig: {
            databaseDialect: 'sqlite' as const,
          },
          storageConfig: {
            storageMode: 'filesystem' as const,
          },
        };

        const result = validateNodeSettings(validSettings);
        expect(result.nodeListeningPort).toBe(8080);
        expect(result.username).toBe('hashed-username');
      });

      it('should throw error for invalid node settings', () => {
        const invalidSettings = {
          nodeListeningPort: 8080,
          username: '', // Invalid empty username
          password: 'hashed-password',
          databaseConfig: {
            databaseDialect: 'sqlite' as const,
          },
          storageConfig: {
            storageMode: 'filesystem' as const,
          },
        };

        expect(() => validateNodeSettings(invalidSettings)).toThrow('Invalid node settings');
      });
    });

    describe('validateAppConfig', () => {
      it('should validate and return valid app config', () => {
        const validConfig = {
          isDeveloperMode: true,
          indexerConfig: {
            httpProtocol: 'https' as const,
            host: 'indexer.moartube.com',
            port: 443,
          },
          aliaserConfig: {
            httpProtocol: 'https' as const,
            host: 'aliaser.moartube.com',
            port: 443,
          },
        };

        const result = validateAppConfig(validConfig);
        expect(result.isDeveloperMode).toBe(true);
        expect(result.indexerConfig.host).toBe('indexer.moartube.com');
      });

      it('should throw error for invalid app config', () => {
        const invalidConfig = {
          isDeveloperMode: true,
          indexerConfig: {
            httpProtocol: 'https' as const,
            host: '', // Invalid empty host
            port: 443,
          },
          aliaserConfig: {
            httpProtocol: 'https' as const,
            host: 'aliaser.moartube.com',
            port: 443,
          },
        };

        expect(() => validateAppConfig(invalidConfig)).toThrow('Invalid app config');
      });
    });

    describe('validateNodeIdentification', () => {
      it('should validate and return valid node identification', () => {
        const validIdentification = {
          moarTubeTokenProof: 'token-proof-123',
        };

        const result = validateNodeIdentification(validIdentification);
        expect(result.moarTubeTokenProof).toBe('token-proof-123');
      });

      it('should throw error for invalid node identification', () => {
        const invalidIdentification = {
          moarTubeTokenProof: '', // Invalid empty token
        };

        expect(() => validateNodeIdentification(invalidIdentification)).toThrow('Invalid node identification');
      });
    });

    describe('validateLastCheckedContentTracker', () => {
      it('should validate and return valid content tracker', () => {
        const validTracker = {
          lastCheckedCommentsTimestamp: 1234567890,
          lastCheckedVideoReportsTimestamp: 1234567891,
          lastCheckedCommentReportsTimestamp: 1234567892,
        };

        const result = validateLastCheckedContentTracker(validTracker);
        expect(result.lastCheckedCommentsTimestamp).toBe(1234567890);
      });

      it('should throw error for invalid content tracker', () => {
        const invalidTracker = {
          lastCheckedCommentsTimestamp: 'not-a-number', // Invalid type
          lastCheckedVideoReportsTimestamp: 1234567891,
          lastCheckedCommentReportsTimestamp: 1234567892,
        };

        expect(() => validateLastCheckedContentTracker(invalidTracker)).toThrow('Invalid content tracker');
      });
    });
  });

  describe('Type Inference', () => {
    it('should export correct inferred types', () => {
      // Test that the types are properly inferred
      const nodeSettings: NodeSettingsValidated = {
        nodeListeningPort: 8080,
        isSecure: false,
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: 443,
        nodeName: 'Test Node',
        nodeAbout: 'A test node',
        nodeId: 'node-123',
        username: 'hashed-username',
        password: 'hashed-password',
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

      const appConfig: AppConfigValidated = {
        isDeveloperMode: false,
        indexerConfig: {
          httpProtocol: 'https',
          host: 'indexer.moartube.com',
          port: 443,
        },
        aliaserConfig: {
          httpProtocol: 'https',
          host: 'aliaser.moartube.com',
          port: 443,
        },
      };

      const nodeId: NodeIdentificationValidated = {
        moarTubeTokenProof: 'token-proof',
      };

      const tracker: LastCheckedContentTrackerValidated = {
        lastCheckedCommentsTimestamp: 1234567890,
        lastCheckedVideoReportsTimestamp: 1234567891,
        lastCheckedCommentReportsTimestamp: 1234567892,
      };

      // If these compile without errors, the types are correct
      expect(nodeSettings.nodeListeningPort).toBe(8080);
      expect(appConfig.isDeveloperMode).toBe(false);
      expect(nodeId.moarTubeTokenProof).toBe('token-proof');
      expect(tracker.lastCheckedCommentsTimestamp).toBe(1234567890);
    });
  });
});