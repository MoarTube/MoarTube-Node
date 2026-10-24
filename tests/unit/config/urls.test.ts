import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Urls,
  initializeUrls,
  buildNodeBaseUrl,
  buildExternalVideosBaseUrl,
  buildExternalResourcesBaseUrl,
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


    it('should be a singleton', () => {
      const urls1 = Urls.initialize();
      const urls2 = Urls.getInstance();

      expect(urls1).toBe(urls2);
    });

    it('should return the same instance via initializeUrls()', () => {
      const urls1 = initializeUrls();
      const urls2 = initializeUrls();

      expect(urls1).toBe(urls2);
    });

    it('should throw when getInstance is called before initialize', () => {
      expect(() => Urls.getInstance()).toThrow('Urls not initialized. Call Urls.initialize() first.');
    });
  });

  describe('URL generation', () => {
    let urls: Urls;

    beforeEach(() => {


      urls = Urls.initialize();
    });

    it('should generate correct Cloudflare zone URL', () => {
      expect(urls.cloudflareZoneUrl).toBe('https://api.cloudflare.com/client/v4/zones/');
    });
  });

  describe('toObject method', () => {
    it('should return all URLs as a plain object', () => {


      const urls = Urls.initialize();
      const obj = urls.toObject();

      expect(obj).toEqual({
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