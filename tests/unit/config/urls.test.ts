import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Urls,
  initializeUrls,
  buildNodeBaseUrl,
  buildExternalVideosBaseUrl,
  buildExternalResourcesBaseUrl,
  type IndexerConfig,
  type AliaserConfig,
  type NodeSettings,
  type StorageConfig
} from '@/config/urls.js';

describe('config/urls.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    Urls.resetInstance();
  });

  afterEach(() => {
    // Clean up after each test
    Urls.resetInstance();
  });

  describe('Urls singleton', () => {
    const mockIndexerConfig: IndexerConfig = {
      httpProtocol: 'https',
      host: 'indexer.moartube.com',
      port: 443,
    };

    const mockAliaserConfig: AliaserConfig = {
      httpProtocol: 'https',
      host: 'aliaser.moartube.com',
      port: 443,
    };

    it('should be a singleton', () => {
      const urls1 = Urls.initialize(mockIndexerConfig, mockAliaserConfig);
      const urls2 = Urls.getInstance();

      expect(urls1).toBe(urls2);
    });

    it('should return the same instance via initializeUrls()', () => {
      const urls1 = initializeUrls(mockIndexerConfig, mockAliaserConfig);
      const urls2 = initializeUrls(mockIndexerConfig, mockAliaserConfig);

      expect(urls1).toBe(urls2);
    });

    it('should throw error for invalid indexer config', () => {
      const invalidIndexerConfig = {
        httpProtocol: 'invalid' as any,
        host: 'indexer.moartube.com',
        port: 443,
      };

      expect(() => new Urls(invalidIndexerConfig, mockAliaserConfig)).toThrow('Invalid indexer config');
    });

    it('should throw error for invalid aliaser config', () => {
      const invalidAliaserConfig = {
        httpProtocol: 'https',
        host: '', // Invalid empty host
        port: 443,
      };

      expect(() => new Urls(mockIndexerConfig, invalidAliaserConfig)).toThrow('Invalid aliaser config');
    });

    it('should throw error for invalid port in indexer config', () => {
      const invalidIndexerConfig = {
        httpProtocol: 'https',
        host: 'indexer.moartube.com',
        port: 99999, // Invalid port
      };

      expect(() => new Urls(invalidIndexerConfig, mockAliaserConfig)).toThrow('Invalid indexer config');
    });
  });

  describe('URL generation', () => {
    let urls: Urls;

    beforeEach(() => {
      const mockIndexerConfig: IndexerConfig = {
        httpProtocol: 'https',
        host: 'indexer.moartube.com',
        port: 443,
      };

      const mockAliaserConfig: AliaserConfig = {
        httpProtocol: 'https',
        host: 'aliaser.moartube.com',
        port: 443,
      };

      urls = new Urls(mockIndexerConfig, mockAliaserConfig);
    });

    it('should generate correct indexer URL with default HTTPS port', () => {
      expect(urls.indexerUrl).toBe('https://indexer.moartube.com');
    });

    it('should generate correct aliaser URL with default HTTPS port', () => {
      expect(urls.aliaserUrl).toBe('https://aliaser.moartube.com');
    });

    it('should generate correct Cloudflare zone URL', () => {
      expect(urls.cloudflareZoneUrl).toBe('https://api.cloudflare.com/client/v4/zones/');
    });

    it('should include port when not default for HTTPS', () => {
      const customIndexerConfig: IndexerConfig = {
        httpProtocol: 'https',
        host: 'indexer.moartube.com',
        port: 8443,
      };

      const customUrls = new Urls(customIndexerConfig, {
        httpProtocol: 'https',
        host: 'aliaser.moartube.com',
        port: 443,
      });

      expect(customUrls.indexerUrl).toBe('https://indexer.moartube.com:8443');
    });

    it('should include port when not default for HTTP', () => {
      const customIndexerConfig: IndexerConfig = {
        httpProtocol: 'http',
        host: 'indexer.moartube.com',
        port: 8080,
      };

      const customUrls = new Urls(customIndexerConfig, {
        httpProtocol: 'http',
        host: 'aliaser.moartube.com',
        port: 80,
      });

      expect(customUrls.indexerUrl).toBe('http://indexer.moartube.com:8080');
      expect(customUrls.aliaserUrl).toBe('http://aliaser.moartube.com');
    });
  });

  describe('Configuration access methods', () => {
    let urls: Urls;
    const mockIndexerConfig: IndexerConfig = {
      httpProtocol: 'https',
      host: 'indexer.moartube.com',
      port: 443,
    };

    const mockAliaserConfig: AliaserConfig = {
      httpProtocol: 'https',
      host: 'aliaser.moartube.com',
      port: 443,
    };

    beforeEach(() => {
      urls = new Urls(mockIndexerConfig, mockAliaserConfig);
    });

    it('should return frozen indexer config', () => {
      const config = urls.getIndexerConfig();

      expect(config).toEqual(mockIndexerConfig);

      // Should be frozen/read-only
      expect(() => {
        (config as any).host = 'modified';
      }).toThrow();
    });

    it('should return frozen aliaser config', () => {
      const config = urls.getAliaserConfig();

      expect(config).toEqual(mockAliaserConfig);

      // Should be frozen/read-only
      expect(() => {
        (config as any).port = 8080;
      }).toThrow();
    });
  });

  describe('toObject method', () => {
    it('should return all URLs as a plain object', () => {
      const mockIndexerConfig: IndexerConfig = {
        httpProtocol: 'https',
        host: 'indexer.moartube.com',
        port: 443,
      };

      const mockAliaserConfig: AliaserConfig = {
        httpProtocol: 'https',
        host: 'aliaser.moartube.com',
        port: 443,
      };

      const urls = new Urls(mockIndexerConfig, mockAliaserConfig);
      const obj = urls.toObject();

      expect(obj).toEqual({
        indexerUrl: 'https://indexer.moartube.com',
        aliaserUrl: 'https://aliaser.moartube.com',
        cloudflareZoneUrl: 'https://api.cloudflare.com/client/v4/zones/',
      });

      // Should be a plain object
      expect(obj.constructor.name).toBe('Object');
    });
  });

  describe('buildNodeBaseUrl function', () => {
    it('should build correct HTTPS URL with default port', () => {
      const nodeSettings: Partial<NodeSettings> = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: 443,
      };

      expect(buildNodeBaseUrl(nodeSettings as NodeSettings)).toBe('https://example.com');
    });

    it('should build correct HTTP URL with default port', () => {
      const nodeSettings: Partial<NodeSettings> = {
        publicNodeProtocol: 'http',
        publicNodeAddress: 'example.com',
        publicNodePort: 80,
      };

      expect(buildNodeBaseUrl(nodeSettings as NodeSettings)).toBe('http://example.com');
    });

    it('should include port when not default', () => {
      const nodeSettings: Partial<NodeSettings> = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: 8443,
      };

      expect(buildNodeBaseUrl(nodeSettings as NodeSettings)).toBe('https://example.com:8443');
    });

    it('should handle string port numbers', () => {
      const nodeSettings: Partial<NodeSettings> = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: '8443',
      };

      expect(buildNodeBaseUrl(nodeSettings as NodeSettings)).toBe('https://example.com:8443');
    });

    it('should return empty string when protocol is missing', () => {
      const nodeSettings: Partial<NodeSettings> = {
        publicNodeProtocol: '',
        publicNodeAddress: 'example.com',
        publicNodePort: 443,
      };

      expect(buildNodeBaseUrl(nodeSettings as NodeSettings)).toBe('');
    });

    it('should return empty string when address is missing', () => {
      const nodeSettings: Partial<NodeSettings> = {
        publicNodeProtocol: 'https',
        publicNodeAddress: '',
        publicNodePort: 443,
      };

      expect(buildNodeBaseUrl(nodeSettings as NodeSettings)).toBe('');
    });
  });

  describe('buildExternalVideosBaseUrl function', () => {
    it('should return node base URL for filesystem storage', () => {
      const nodeSettings: Partial<NodeSettings> = {
        storageConfig: { storageMode: 'filesystem' },
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: 443,
      };

      expect(buildExternalVideosBaseUrl(nodeSettings as NodeSettings)).toBe('https://example.com');
    });

    it('should build S3 URL for s3provider storage without Cloudflare CDN', () => {
      const nodeSettings: Partial<NodeSettings> = {
        storageConfig: {
          storageMode: 's3provider',
          s3Config: {
            bucketName: 'my-bucket',
            s3ProviderClientConfig: {
              region: 'us-east-1',
              forcePathStyle: false,
            },
          },
        } as StorageConfig,
        isCloudflareCdnEnabled: false,
      };

      expect(buildExternalVideosBaseUrl(nodeSettings as NodeSettings)).toBe('http://my-bucket.s3.us-east-1.amazonaws.com');
    });

    it('should build S3 URL with Cloudflare CDN enabled', () => {
      const nodeSettings: Partial<NodeSettings> = {
        storageConfig: {
          storageMode: 's3provider',
          s3Config: {
            bucketName: 'my-bucket',
            s3ProviderClientConfig: {
              region: 'us-east-1',
              forcePathStyle: false,
            },
          },
        } as StorageConfig,
        isCloudflareCdnEnabled: true,
      };

      expect(buildExternalVideosBaseUrl(nodeSettings as NodeSettings)).toBe('https://my-bucket');
    });

    it('should build custom S3 URL with endpoint and virtual-hosted style', () => {
      const nodeSettings: Partial<NodeSettings> = {
        storageConfig: {
          storageMode: 's3provider',
          s3Config: {
            bucketName: 'my-bucket',
            s3ProviderClientConfig: {
              endpoint: 'https://minio.example.com:9000',
              region: 'us-east-1',
              forcePathStyle: false,
            },
          },
        } as StorageConfig,
        isCloudflareCdnEnabled: false,
      };

      expect(buildExternalVideosBaseUrl(nodeSettings as NodeSettings)).toBe('https://my-bucket.minio.example.com:9000');
    });

    it('should build custom S3 URL with endpoint without port and virtual-hosted style', () => {
      const nodeSettings: Partial<NodeSettings> = {
        storageConfig: {
          storageMode: 's3provider',
          s3Config: {
            bucketName: 'my-bucket',
            s3ProviderClientConfig: {
              endpoint: 'https://minio.example.com',
              region: 'us-east-1',
              forcePathStyle: false,
            },
          },
        } as StorageConfig,
        isCloudflareCdnEnabled: false,
      };

      expect(buildExternalVideosBaseUrl(nodeSettings as NodeSettings)).toBe('https://my-bucket.minio.example.com');
    });

    it('should build custom S3 URL with endpoint and path-style', () => {
      const nodeSettings: Partial<NodeSettings> = {
        storageConfig: {
          storageMode: 's3provider',
          s3Config: {
            bucketName: 'my-bucket',
            s3ProviderClientConfig: {
              endpoint: 'https://minio.example.com:9000',
              region: 'us-east-1',
              forcePathStyle: true,
            },
          },
        } as StorageConfig,
        isCloudflareCdnEnabled: false,
      };

      expect(buildExternalVideosBaseUrl(nodeSettings as NodeSettings)).toBe('https://minio.example.com:9000/my-bucket');
    });

    it('should build AWS S3 path-style URL', () => {
      const nodeSettings: Partial<NodeSettings> = {
        storageConfig: {
          storageMode: 's3provider',
          s3Config: {
            bucketName: 'my-bucket',
            s3ProviderClientConfig: {
              region: 'us-west-2',
              forcePathStyle: true,
            },
          },
        } as StorageConfig,
        isCloudflareCdnEnabled: false,
      };

      expect(buildExternalVideosBaseUrl(nodeSettings as NodeSettings)).toBe('https://s3.us-west-2.amazonaws.com/my-bucket');
    });

    it('should throw error for s3provider without s3Config', () => {
      const nodeSettings: Partial<NodeSettings> = {
        storageConfig: { storageMode: 's3provider' },
      };

      expect(() => buildExternalVideosBaseUrl(nodeSettings as NodeSettings)).toThrow('S3 config required');
    });
  });

  describe('buildExternalResourcesBaseUrl function', () => {
    it('should always return node base URL', () => {
      const nodeSettings: Partial<NodeSettings> = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: 443,
      };

      expect(buildExternalResourcesBaseUrl(nodeSettings as NodeSettings)).toBe('https://example.com');
    });

    it('should handle custom ports', () => {
      const nodeSettings: Partial<NodeSettings> = {
        publicNodeProtocol: 'https',
        publicNodeAddress: 'example.com',
        publicNodePort: 8443,
      };

      expect(buildExternalResourcesBaseUrl(nodeSettings as NodeSettings)).toBe('https://example.com:8443');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle invalid S3 endpoint format', () => {
      const nodeSettings: Partial<NodeSettings> = {
        storageConfig: {
          storageMode: 's3provider',
          s3Config: {
            bucketName: 'my-bucket',
            s3ProviderClientConfig: {
              endpoint: 'invalid-endpoint',
              region: 'us-east-1',
              forcePathStyle: false,
            },
          },
        } as StorageConfig,
        isCloudflareCdnEnabled: false,
      };

      expect(() => buildExternalVideosBaseUrl(nodeSettings as NodeSettings)).toThrow('Invalid S3 endpoint format');
    });

    it('should handle empty S3 endpoint', () => {
      const nodeSettings: Partial<NodeSettings> = {
        storageConfig: {
          storageMode: 's3provider',
          s3Config: {
            bucketName: 'my-bucket',
            s3ProviderClientConfig: {
              endpoint: '',
              region: 'us-east-1',
              forcePathStyle: false,
            },
          },
        } as StorageConfig,
        isCloudflareCdnEnabled: false,
      };

      expect(buildExternalVideosBaseUrl(nodeSettings as NodeSettings)).toBe('http://my-bucket.s3.us-east-1.amazonaws.com');
    });
  });
});