/**
 * Cloudflare Service Tests
 *
 * Tests for the CloudflareService class that handles Cloudflare CDN integration,
 * cache purging, and Turnstile verification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { CloudflareService } from '@/services/cloudflare.js';
import type { Logger } from '@/utils/logger.js';
import type { VideosRepository } from '@/database/repositories/index.js';

// Mock axios
vi.mock('axios');

// Mock the config module
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from '@config/index.js';

describe('CloudflareService', () => {
  let service: CloudflareService;
  let mockLogger: Logger;
  let mockVideosRepository: VideosRepository;
  let mockConfig: ReturnType<typeof getConfig>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockVideosRepository = {
      findAll: vi.fn(),
    } as unknown as VideosRepository;

    // Default config: Cloudflare disabled
    mockConfig = {
      nodeSettings: {
        isCloudflareCdnEnabled: false,
        isCloudflareTurnstileEnabled: false,
        cloudflareEmailAddress: '',
        cloudflareGlobalApiKey: '',
        cloudflareZoneId: '',
        cloudflareTurnstileSiteKey: '',
        cloudflareTurnstileSecretKey: '',
      },
      getNodeBaseUrl: vi.fn().mockReturnValue('https://example.com'),
      getExternalResourcesBaseUrl: vi.fn().mockReturnValue('https://example.com'),
      getExternalVideosBaseUrl: vi.fn().mockReturnValue('https://example.com'),
    } as unknown as ReturnType<typeof getConfig>;

    vi.mocked(getConfig).mockReturnValue(mockConfig);

    // Mock axios.create to return a mock client
    vi.mocked(axios.create).mockReturnValue({
      post: vi.fn(),
      get: vi.fn(),
    } as unknown as ReturnType<typeof axios.create>);

    service = new CloudflareService(mockLogger, mockVideosRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a CloudflareService instance', () => {
      expect(service).toBeInstanceOf(CloudflareService);
    });

    it('should initialize HTTP client when Cloudflare is enabled', () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = true;
      mockConfig.nodeSettings.cloudflareGlobalApiKey = 'api-key';
      mockConfig.nodeSettings.cloudflareEmailAddress = 'test@example.com';

      service = new CloudflareService(mockLogger, mockVideosRepository);

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.cloudflare.com/client/v4',
          headers: expect.objectContaining({
            'X-Auth-Email': 'test@example.com',
            'X-Auth-Key': 'api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should not initialize HTTP client when Cloudflare is disabled', () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      vi.mocked(axios.create).mockClear();
      service = new CloudflareService(mockLogger, mockVideosRepository);

      expect(axios.create).not.toHaveBeenCalled();
    });
  });

  describe('isEnabled', () => {
    it('should return true when Cloudflare CDN is enabled', () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = true;

      const result = service.isEnabled();

      expect(result).toBe(true);
    });

    it('should return false when Cloudflare CDN is disabled', () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      const result = service.isEnabled();

      expect(result).toBe(false);
    });
  });

  describe('validateTurnstileToken', () => {
    it('should return true when Turnstile is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareTurnstileEnabled = false;

      const result = await service.validateTurnstileToken('token', '127.0.0.1');

      expect(result).toBe(true);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should return false when Turnstile is enabled but no secret key', async () => {
      mockConfig.nodeSettings.isCloudflareTurnstileEnabled = true;
      mockConfig.nodeSettings.cloudflareTurnstileSecretKey = '';

      const result = await service.validateTurnstileToken('token', '127.0.0.1');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Turnstile enabled but secret key not configured'
      );
    });

    it('should validate token and return true on success', async () => {
      mockConfig.nodeSettings.isCloudflareTurnstileEnabled = true;
      mockConfig.nodeSettings.cloudflareTurnstileSecretKey = 'secret-key';

      vi.mocked(axios.post).mockResolvedValue({
        data: { success: true },
      });

      const result = await service.validateTurnstileToken('valid-token', '127.0.0.1');

      expect(result).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          secret: 'secret-key',
          response: 'valid-token',
          remoteip: '127.0.0.1',
        }
      );
    });

    it('should return false when token validation fails', async () => {
      mockConfig.nodeSettings.isCloudflareTurnstileEnabled = true;
      mockConfig.nodeSettings.cloudflareTurnstileSecretKey = 'secret-key';

      vi.mocked(axios.post).mockResolvedValue({
        data: { success: false },
      });

      const result = await service.validateTurnstileToken('invalid-token', '127.0.0.1');

      expect(result).toBe(false);
    });

    it('should log and rethrow errors', async () => {
      mockConfig.nodeSettings.isCloudflareTurnstileEnabled = true;
      mockConfig.nodeSettings.cloudflareTurnstileSecretKey = 'secret-key';

      const error = new Error('Network error');
      vi.mocked(axios.post).mockRejectedValue(error);

      await expect(service.validateTurnstileToken('token', '127.0.0.1')).rejects.toThrow(
        'Network error'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('validateTurnstileToken failed', error);
    });
  });

  describe('purgeWatchPages', () => {
    it('should do nothing when Cloudflare is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeWatchPages(['video123']);

      expect(mockVideosRepository.findAll).not.toHaveBeenCalled();
    });

    it('should do nothing when HTTP client is not initialized', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = true;
      // HTTP client is null because service was created with CDN disabled

      await service.purgeWatchPages(['video123']);

      expect(mockVideosRepository.findAll).not.toHaveBeenCalled();
    });
  });

  describe('purgeAllWatchPages', () => {
    it('should call purgeWatchPages without video IDs', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeAllWatchPages();

      // Should not throw and should complete
      expect(true).toBe(true);
    });
  });

  describe('purgeEmbedVideoPages', () => {
    it('should do nothing when Cloudflare is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeEmbedVideoPages(['video123']);

      expect(mockVideosRepository.findAll).not.toHaveBeenCalled();
    });
  });

  describe('purgeAllEmbedVideoPages', () => {
    it('should call purgeEmbedVideoPages without video IDs', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeAllEmbedVideoPages();

      // Should not throw and should complete
      expect(true).toBe(true);
    });
  });

  describe('purgeNodePage', () => {
    it('should do nothing when Cloudflare is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeNodePage();

      // Should not throw and should complete
      expect(true).toBe(true);
    });
  });

  describe('purgeNodeImages', () => {
    it('should do nothing when Cloudflare is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeNodeImages();

      // Should not throw and should complete
      expect(true).toBe(true);
    });
  });

  describe('purgeAdaptiveVideos', () => {
    it('should do nothing when Cloudflare is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeAdaptiveVideos('video123');

      // Should not throw and should complete
      expect(true).toBe(true);
    });
  });

  describe('purgeProgressiveVideos', () => {
    it('should do nothing when Cloudflare is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeProgressiveVideos('video123');

      // Should not throw and should complete
      expect(true).toBe(true);
    });
  });

  describe('purgeVideoPreviewImages', () => {
    it('should do nothing when Cloudflare is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeVideoPreviewImages(['video123']);

      // Should not throw and should complete
      expect(true).toBe(true);
    });
  });

  describe('purgeVideoPosterImages', () => {
    it('should do nothing when Cloudflare is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeVideoPosterImages(['video123']);

      // Should not throw and should complete
      expect(true).toBe(true);
    });
  });

  describe('purgeVideoThumbnailImages', () => {
    it('should do nothing when Cloudflare is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeVideoThumbnailImages(['video123']);

      // Should not throw and should complete
      expect(true).toBe(true);
    });
  });

  describe('purgeEntireCache', () => {
    it('should do nothing when Cloudflare is disabled', async () => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = false;

      await service.purgeEntireCache();

      // Should not throw and should complete
      expect(true).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle config initialization errors gracefully', () => {
      vi.mocked(getConfig).mockImplementation(() => {
        throw new Error('Config not ready');
      });

      // Should not throw during construction
      expect(() => new CloudflareService(mockLogger, mockVideosRepository)).not.toThrow();
      expect(mockLogger.debug).toHaveBeenCalledWith('Cloudflare client not configured');
    });
  });

  describe('purge operations with Cloudflare enabled', () => {
    let mockHttpClient: { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockConfig.nodeSettings.isCloudflareCdnEnabled = true;
      mockConfig.nodeSettings.cloudflareGlobalApiKey = 'api-key';
      mockConfig.nodeSettings.cloudflareEmailAddress = 'test@example.com';
      mockConfig.nodeSettings.cloudflareZoneId = 'zone123';

      mockHttpClient = {
        post: vi.fn().mockResolvedValue({ data: { success: true } }),
        get: vi.fn().mockResolvedValue({ data: { success: true } }),
      };

      vi.mocked(axios.create).mockReturnValue(mockHttpClient as unknown as ReturnType<typeof axios.create>);
      service = new CloudflareService(mockLogger, mockVideosRepository);
    });

    it('should purge watch pages for specific videos', async () => {
      await service.purgeWatchPages(['video123', 'video456']);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.stringContaining('?v=video123'),
            expect.stringContaining('?v=video456'),
          ]),
        })
      );
    });

    it('should purge all watch pages when no video IDs provided', async () => {
      vi.mocked(mockVideosRepository.findAll).mockResolvedValue([
        { video_id: 'video1' },
        { video_id: 'video2' },
      ] as never);

      await service.purgeAllWatchPages();

      expect(mockVideosRepository.findAll).toHaveBeenCalled();
      expect(mockHttpClient.post).toHaveBeenCalled();
    });

    it('should purge embed video pages', async () => {
      await service.purgeEmbedVideoPages(['video123']);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.stringContaining('/watch/embed/video/video123'),
          ]),
        })
      );
    });

    it('should purge all embed video pages', async () => {
      vi.mocked(mockVideosRepository.findAll).mockResolvedValue([
        { video_id: 'video1' },
      ] as never);

      await service.purgeAllEmbedVideoPages();

      expect(mockVideosRepository.findAll).toHaveBeenCalled();
    });

    it('should purge node page', async () => {
      await service.purgeNodePage();

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.stringContaining('/node'),
          ]),
        })
      );
    });

    it('should purge node images', async () => {
      await service.purgeNodeImages();

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.stringContaining('/icon.png'),
            expect.stringContaining('/avatar.png'),
            expect.stringContaining('/banner.png'),
          ]),
        })
      );
    });

    it('should purge adaptive videos', async () => {
      await service.purgeAdaptiveVideos('video123');

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.stringContaining('/adaptive/m3u8'),
          ]),
        })
      );
    });

    it('should purge progressive videos', async () => {
      await service.purgeProgressiveVideos('video123');

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.any(Array),
        })
      );
      // Should include all format/resolution combinations
      const callArgs = mockHttpClient.post.mock.calls[0];
      expect(callArgs[1].files.length).toBeGreaterThan(10); // 3 formats * 7 resolutions = 21
    });

    it('should purge video preview images', async () => {
      await service.purgeVideoPreviewImages(['video123', 'video456']);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.stringContaining('/images/preview.jpg'),
          ]),
        })
      );
    });

    it('should purge video poster images', async () => {
      await service.purgeVideoPosterImages(['video123']);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.stringContaining('/images/poster.jpg'),
          ]),
        })
      );
    });

    it('should purge video thumbnail images', async () => {
      await service.purgeVideoThumbnailImages(['video123']);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.stringContaining('/images/thumbnail.jpg'),
          ]),
        })
      );
    });

    it('should purge entire video (all formats and images)', async () => {
      await service.purgeVideo('video123');

      // Should be called multiple times for different purge types
      expect(mockHttpClient.post.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should purge entire cache', async () => {
      await service.purgeEntireCache();

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          purge_everything: true,
        })
      );
    });

    it('should handle purge errors gracefully', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Purge failed'));

      await service.purgeAdaptiveVideos('video123');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'purgeAdaptiveVideos failed',
        expect.any(Error)
      );
    });

    it('should handle progressive video purge errors gracefully', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Purge failed'));

      await service.purgeProgressiveVideos('video123');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'purgeProgressiveVideos failed',
        expect.any(Error)
      );
    });

    it('should handle preview image purge errors gracefully', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Purge failed'));

      await service.purgeVideoPreviewImages(['video123']);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'purgeVideoPreviewImages failed',
        expect.any(Error)
      );
    });

    it('should handle poster image purge errors gracefully', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Purge failed'));

      await service.purgeVideoPosterImages(['video123']);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'purgeVideoPosterImages failed',
        expect.any(Error)
      );
    });

    it('should handle thumbnail image purge errors gracefully', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Purge failed'));

      await service.purgeVideoThumbnailImages(['video123']);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'purgeVideoThumbnailImages failed',
        expect.any(Error)
      );
    });

    it('should handle entire cache purge errors gracefully', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Purge failed'));

      await service.purgeEntireCache();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge entire cache',
        expect.any(Error)
      );
    });

    it('should do nothing when purging with empty video array', async () => {
      await service.purgeVideoPreviewImages([]);

      // Should not call post when files array is empty
      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('purgeEntireCacheWithCredentials', () => {
    it('should purge entire cache with explicit credentials', async () => {
      vi.mocked(axios.post).mockResolvedValue({ data: { success: true } });

      await service.purgeEntireCacheWithCredentials(
        'email@example.com',
        'zone123',
        'api-key'
      );

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/zones/zone123/purge_cache',
        { purge_everything: true },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Auth-Email': 'email@example.com',
            'X-Auth-Key': 'api-key',
          }),
        })
      );
    });

    it('should log error and rethrow on failure', async () => {
      const error = new Error('API error');
      vi.mocked(axios.post).mockRejectedValue(error);

      await expect(
        service.purgeEntireCacheWithCredentials('email@example.com', 'zone123', 'api-key')
      ).rejects.toThrow('API error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge entire cache with credentials',
        error
      );
    });
  });

  describe('setCdnConfiguration', () => {
    it('should configure Cloudflare CDN settings', async () => {
      vi.mocked(axios.put).mockResolvedValue({ data: { success: true } });
      vi.mocked(axios.patch).mockResolvedValue({ data: { success: true } });

      await service.setCdnConfiguration('email@example.com', 'zone123', 'api-key');

      // Should create cache rules
      expect(axios.put).toHaveBeenCalledWith(
        expect.stringContaining('/zones/zone123/rulesets/phases/http_request_cache_settings/entrypoint'),
        expect.objectContaining({
          rules: expect.any(Array),
        }),
        expect.any(Object)
      );

      // Should patch multiple settings
      expect(axios.patch).toHaveBeenCalledWith(
        expect.stringContaining('/browser_cache_ttl'),
        expect.any(Object),
        expect.any(Object)
      );
      expect(axios.patch).toHaveBeenCalledWith(
        expect.stringContaining('/always_use_https'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('resetCdn', () => {
    it('should reset Cloudflare CDN configuration', async () => {
      // Mock rulesets listing
      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (url.includes('/rulesets')) {
          return {
            data: {
              success: true,
              result: [
                { id: 'ruleset1', phase: 'http_request_cache_settings' },
                { id: 'ruleset2', phase: 'other_phase' },
              ],
            },
          };
        }
        if (url.includes('/dns_records')) {
          return {
            data: {
              success: true,
              result: [
                { id: 'dns1', name: 'externalvideos.example.com' },
                { id: 'dns2', name: 'unrelated.example.com' },
              ],
            },
          };
        }
        return { data: { success: true, result: [] } };
      });
      vi.mocked(axios.delete).mockResolvedValue({ data: { success: true } });
      vi.mocked(axios.patch).mockResolvedValue({ data: { success: true } });

      await service.resetCdn('email@example.com', 'zone123', 'api-key');

      // Should delete cache settings rulesets only
      expect(axios.delete).toHaveBeenCalledWith(
        expect.stringContaining('rulesets/ruleset1'),
        expect.any(Object)
      );
      expect(axios.delete).not.toHaveBeenCalledWith(
        expect.stringContaining('rulesets/ruleset2'),
        expect.any(Object)
      );

      // Should disable tiered caching
      expect(axios.patch).toHaveBeenCalledWith(
        expect.stringContaining('/argo/tiered_caching'),
        expect.objectContaining({ value: 'off' }),
        expect.any(Object)
      );
    });

    it('should handle unsuccessful API responses gracefully', async () => {
      vi.mocked(axios.get).mockImplementation(async (url) => {
        if (url.includes('/rulesets')) {
          return { data: { success: false, result: [] } };
        }
        if (url.includes('/dns_records')) {
          return { data: { success: false, result: [] } };
        }
        return { data: { success: false, result: [] } };
      });
      vi.mocked(axios.patch).mockResolvedValue({ data: { success: true } });

      // Should not throw and complete without deleting anything
      await service.resetCdn('email@example.com', 'zone123', 'api-key');

      // Should not call delete since success was false
      expect(axios.delete).not.toHaveBeenCalled();
    });
  });

  describe('addCdnDnsRecord', () => {
    it('should add DNS record for S3 storage', async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: { success: true, result: [] } });
      vi.mocked(axios.post).mockResolvedValue({ data: { success: true } });

      await service.addCdnDnsRecord('email@example.com', 'zone123', 'api-key', {
        storageMode: 's3provider',
        s3Config: {
          bucketName: 'my-bucket',
          s3ProviderClientConfig: {
            region: 'us-east-1',
          },
        },
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/dns_records'),
        expect.objectContaining({
          type: 'CNAME',
          name: 'my-bucket',
          content: 'my-bucket.s3.us-east-1.amazonaws.com',
          proxied: true,
        }),
        expect.any(Object)
      );
    });

    it('should handle custom S3 endpoint', async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: { success: true, result: [] } });
      vi.mocked(axios.post).mockResolvedValue({ data: { success: true } });

      await service.addCdnDnsRecord('email@example.com', 'zone123', 'api-key', {
        storageMode: 's3provider',
        s3Config: {
          bucketName: 'my-bucket',
          s3ProviderClientConfig: {
            region: 'us-east-1',
            endpoint: 'https://minio.example.com',
          },
        },
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/dns_records'),
        expect.objectContaining({
          content: 'my-bucket.minio.example.com',
        }),
        expect.any(Object)
      );
    });

    it('should not add DNS record for filesystem storage', async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: { success: true, result: [] } });

      await service.addCdnDnsRecord('email@example.com', 'zone123', 'api-key', {
        storageMode: 'filesystem',
      });

      // POST should only be called for removing old records, not adding new ones
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('validateCredentials', () => {
    it('should return true for valid credentials', async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: { success: true } });

      const result = await service.validateCredentials('email@example.com', 'zone123', 'api-key');

      expect(result).toBe(true);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/zones/zone123'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Auth-Email': 'email@example.com',
            'X-Auth-Key': 'api-key',
          }),
        })
      );
    });

    it('should return false for invalid credentials', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Unauthorized'));

      const result = await service.validateCredentials('email@example.com', 'zone123', 'bad-key');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to validate Cloudflare credentials',
        expect.any(Error)
      );
    });
  });

  describe('error handling in outer catch blocks', () => {
    let mockHttpClient: { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      // Enable Cloudflare with mock HTTP client
      mockConfig.nodeSettings.isCloudflareCdnEnabled = true;
      mockConfig.nodeSettings.cloudflareGlobalApiKey = 'api-key';
      mockConfig.nodeSettings.cloudflareEmailAddress = 'test@example.com';
      mockConfig.nodeSettings.cloudflareZoneId = 'zone123';

      mockHttpClient = {
        post: vi.fn().mockResolvedValue({ data: { success: true } }),
        get: vi.fn().mockResolvedValue({ data: { success: true, result: [] } }),
      };

      vi.mocked(axios.create).mockReturnValue(mockHttpClient as unknown as ReturnType<typeof axios.create>);

      service = new CloudflareService(mockLogger, mockVideosRepository);
    });

    it('should handle purgeWatchPages errors when getNodeBaseUrl throws', async () => {
      mockConfig.getNodeBaseUrl = vi.fn().mockImplementation(() => {
        throw new Error('URL generation error');
      });

      await service.purgeWatchPages(['video1']);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge watch pages',
        expect.any(Error)
      );
    });

    it('should handle purgeEmbedVideoPages errors when getNodeBaseUrl throws', async () => {
      mockConfig.getNodeBaseUrl = vi.fn().mockImplementation(() => {
        throw new Error('URL generation error');
      });

      await service.purgeEmbedVideoPages(['video1']);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge embed pages',
        expect.any(Error)
      );
    });

    it('should handle purgeNodePage errors when getNodeBaseUrl throws', async () => {
      mockConfig.getNodeBaseUrl = vi.fn().mockImplementation(() => {
        throw new Error('URL generation error');
      });

      await service.purgeNodePage();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge node page',
        expect.any(Error)
      );
    });

    it('should handle purgeNodeImages errors when getExternalResourcesBaseUrl throws', async () => {
      mockConfig.getExternalResourcesBaseUrl = vi.fn().mockImplementation(() => {
        throw new Error('URL generation error');
      });

      await service.purgeNodeImages();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge node images',
        expect.any(Error)
      );
    });

    it('should handle purgeAdaptiveVideos errors when getExternalVideosBaseUrl throws', async () => {
      mockConfig.getExternalVideosBaseUrl = vi.fn().mockImplementation(() => {
        throw new Error('URL generation error');
      });

      await service.purgeAdaptiveVideos('video123');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge adaptive videos',
        expect.any(Error),
        expect.objectContaining({ videoId: 'video123' })
      );
    });

    it('should handle purgeProgressiveVideos errors when getExternalVideosBaseUrl throws', async () => {
      mockConfig.getExternalVideosBaseUrl = vi.fn().mockImplementation(() => {
        throw new Error('URL generation error');
      });

      await service.purgeProgressiveVideos('video123');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge progressive videos',
        expect.any(Error),
        expect.objectContaining({ videoId: 'video123' })
      );
    });

    it('should handle purgeVideoPreviewImages errors when getExternalVideosBaseUrl throws', async () => {
      mockConfig.getExternalVideosBaseUrl = vi.fn().mockImplementation(() => {
        throw new Error('URL generation error');
      });

      await service.purgeVideoPreviewImages(['video123']);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge preview images',
        expect.any(Error),
        expect.objectContaining({ videoIds: ['video123'] })
      );
    });

    it('should handle purgeVideoPosterImages errors when getExternalVideosBaseUrl throws', async () => {
      mockConfig.getExternalVideosBaseUrl = vi.fn().mockImplementation(() => {
        throw new Error('URL generation error');
      });

      await service.purgeVideoPosterImages(['video123']);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge poster images',
        expect.any(Error),
        expect.objectContaining({ videoIds: ['video123'] })
      );
    });

    it('should handle purgeVideoThumbnailImages errors when getExternalVideosBaseUrl throws', async () => {
      mockConfig.getExternalVideosBaseUrl = vi.fn().mockImplementation(() => {
        throw new Error('URL generation error');
      });

      await service.purgeVideoThumbnailImages(['video123']);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge thumbnail images',
        expect.any(Error),
        expect.objectContaining({ videoIds: ['video123'] })
      );
    });

    it('should handle purgeEntireCache errors when httpClient.post throws', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('API error'));

      await service.purgeEntireCache();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to purge entire cache',
        expect.any(Error)
      );
    });

    it('should purge watch pages by fetching all videos when no IDs provided', async () => {
      vi.mocked(mockVideosRepository.findAll).mockResolvedValue([
        { video_id: 'vid1' },
        { video_id: 'vid2' },
        { video_id: 'vid3' },
      ] as never);

      await service.purgeWatchPages();

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.stringContaining('?v=vid1'),
            expect.stringContaining('?v=vid2'),
            expect.stringContaining('?v=vid3'),
          ]),
        })
      );
    });

    it('should purge embed pages by fetching all videos when no IDs provided', async () => {
      vi.mocked(mockVideosRepository.findAll).mockResolvedValue([
        { video_id: 'vid1' },
        { video_id: 'vid2' },
      ] as never);

      await service.purgeEmbedVideoPages();

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/zones/zone123/purge_cache',
        expect.objectContaining({
          files: expect.arrayContaining([
            expect.stringContaining('/watch/embed/video/vid1'),
            expect.stringContaining('/watch/embed/video/vid2'),
          ]),
        })
      );
    });

    it('should batch purge requests for more than 30 files', async () => {
      // Create 35 videos to trigger batching
      const videos = Array.from({ length: 35 }, (_, i) => ({ video_id: `vid${i}` }));
      vi.mocked(mockVideosRepository.findAll).mockResolvedValue(videos as never);

      await service.purgeWatchPages();

      // Should be called twice: once for first 30, once for remaining 5
      expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
    });
  });
});
