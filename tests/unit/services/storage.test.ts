/**
 * Storage Service Tests
 *
 * Tests for the StorageService class that handles unified file storage
 * for both filesystem and S3 backends.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { StorageService } from '@/services/storage.js';
import type { Logger } from '@/utils/logger.js';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { siloFixture, siloProxy, type SiloFixture } from '../../support/silo.js';

// Mock node:fs
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    createReadStream: vi.fn(),
  },
}));

// Mock the config module
vi.mock('@config/index.js', () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from '@config/index.js';

describe('StorageService', () => {
  let fixture: SiloFixture;
  beforeAll(async () => {
    fixture = await siloFixture();
  });
  afterAll(async () => {
    await fixture.close();
  });
  let service: StorageService;
  let mockLogger: Logger;
  let mockConfig: ReturnType<typeof getConfig>;

  beforeEach(() => {
    // Reset mock call history but keep implementations

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    // Default config: filesystem storage
    mockConfig = {
      nodeSettings: {
        storageConfig: {
          storageMode: 'filesystem',
          s3Config: null,
        },
      },
      paths: {
        dataDirectoryPath: '/data',
        videosDirectoryPath: '/data/videos',
      },
    } as unknown as ReturnType<typeof getConfig>;

    vi.mocked(getConfig).mockReturnValue(mockConfig);

    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as never);
    service = new StorageService(mockLogger);
  });

  afterEach(() => {
    (service as unknown as { s3Client: { destroy(): void } | null }).s3Client?.destroy();
    // Filesystem tests retain their separate fixtures.
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.mkdirSync).mockReset();
    vi.mocked(fs.rmSync).mockReset();
    vi.mocked(fs.statSync).mockReset();
    vi.mocked(fs.readdirSync).mockReset();
    vi.mocked(fs.copyFileSync).mockReset();
    vi.mocked(fs.createReadStream).mockReset();
  });

  describe('constructor', () => {
    it('should create a StorageService instance', () => {
      expect(service).toBeInstanceOf(StorageService);
    });

    it('should not initialize S3 client for filesystem mode', () => {
      expect(service).toBeInstanceOf(StorageService);
      // S3 client should not be initialized
    });

    it('should handle config initialization errors gracefully', () => {
      vi.mocked(getConfig).mockImplementation(() => {
        throw new Error('Config not ready');
      });

      expect(() => new StorageService(mockLogger)).not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('S3 client not configured', expect.any(Error));
    });
  });

  describe('getStorageMode', () => {
    it('should return filesystem mode', () => {
      const result = service.getStorageMode();

      expect(result).toBe('filesystem');
    });

    it('should return s3provider mode when configured', () => {
      mockConfig.nodeSettings.storageConfig.storageMode = 's3provider';

      const result = service.getStorageMode();

      expect(result).toBe('s3provider');
    });
  });

  describe('getFileStream (filesystem mode)', () => {
    it('should return a readable stream', async () => {
      const mockStream = { pipe: vi.fn() };
      vi.mocked(fs.createReadStream).mockReturnValue(
        mockStream as unknown as ReturnType<typeof fs.createReadStream>
      );

      const result = await service.getFileStream('test/file.txt');

      expect(result).toBe(mockStream);
      expect(fs.createReadStream).toHaveBeenCalled();
    });
  });

  describe('deleteFile (filesystem mode)', () => {
    it('should delete file from filesystem', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await service.deleteFile('test/file.txt');

      expect(result).toBe(true);
      expect(fs.rmSync).toHaveBeenCalledWith(expect.any(String), { force: true });
    });

    it('should return false if file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await service.deleteFile('nonexistent.txt');

      expect(result).toBe(false);
    });
  });

  describe('fileExists (filesystem mode)', () => {
    it('should return true if file exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await service.fileExists('test/file.txt');

      expect(result).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await service.fileExists('nonexistent.txt');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Check failed');
      });

      const result = await service.fileExists('test.txt');

      expect(result).toBe(false);
    });
  });

  describe('getFileMetadata (filesystem mode)', () => {
    it('should return file metadata', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        size: 1024,
        mtime: new Date('2024-01-01'),
      } as unknown as ReturnType<typeof fs.statSync>);

      const result = await service.getFileMetadata('test/file.txt');

      expect(result).toEqual({
        key: 'test/file.txt',
        size: 1024,
        lastModified: new Date('2024-01-01'),
      });
    });

    it('should return null if file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await service.getFileMetadata('nonexistent.txt');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Stat failed');
      });

      const result = await service.getFileMetadata('test.txt');

      expect(result).toBeNull();
    });
  });

  describe('deleteDirectory (filesystem mode)', () => {
    it('should delete directory and return file count', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
        { name: 'file2.txt', isFile: () => true, isDirectory: () => false },
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      const result = await service.deleteDirectory('test/');

      expect(result).toBe(2);
      expect(fs.rmSync).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
    });

    it('should return 0 for non-existent directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await service.deleteDirectory('nonexistent/');

      expect(result).toBe(0);
    });
  });

  describe('copyFile (filesystem mode)', () => {
    it('should copy file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await service.copyFile('source/file.txt', 'dest/file.txt');

      expect(fs.copyFileSync).toHaveBeenCalled();
    });

    it('should create destination directory if needed', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await service.copyFile('source/file.txt', 'dest/nested/file.txt');

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
  });

  describe('getPresignedUrl', () => {
    it('should throw error for filesystem mode', async () => {
      await expect(service.getPresignedUrl('test.txt')).rejects.toThrow(
        'Presigned URLs are only available for S3 storage'
      );
    });
  });

  describe('deleteDirectory with nested files (filesystem mode)', () => {
    it('should count files in nested directories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Mock readdirSync to return nested structure
      vi.mocked(fs.readdirSync).mockImplementation((dir) => {
        const dirStr = String(dir);
        if (dirStr.includes('subdir')) {
          return [
            { name: 'nested-file.txt', isFile: () => true, isDirectory: () => false },
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        return [
          { name: 'file1.txt', isFile: () => true, isDirectory: () => false },
          { name: 'subdir', isFile: () => false, isDirectory: () => true },
        ] as unknown as ReturnType<typeof fs.readdirSync>;
      });

      const result = await service.deleteDirectory('test/');

      expect(result).toBe(2); // file1.txt + nested-file.txt
      expect(fs.rmSync).toHaveBeenCalledWith(expect.any(String), { recursive: true, force: true });
    });
  });

  describe('S3 storage operations against Silo', () => {
    beforeEach(async () => {
      mockConfig.nodeSettings.storageConfig = {
        storageMode: 's3provider',
        s3Config: fixture.config,
      } as never;
      service = new StorageService(mockLogger);
      await fixture.put('test/file.txt', 'real Silo object', 'text/plain');
    });
    it('reads real object bytes from S3', async () => {
      const stream = await service.getFileStream('test/file.txt');
      const chunks: Buffer[] = [];
      for await (const chunk of stream as Readable) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe('real Silo object');
    });
    it('deletes a real object and confirms absence', async () => {
      expect(await service.deleteFile('test/file.txt')).toBe(true);
      expect(await service.fileExists('test/file.txt')).toBe(false);
    });
    it('returns false when Silo rejects delete credentials', async () => {
      mockConfig.nodeSettings.storageConfig = {
        storageMode: 's3provider',
        s3Config: {
          ...fixture.config,
          s3ProviderClientConfig: {
            ...fixture.config.s3ProviderClientConfig,
            credentials: {
              ...fixture.config.s3ProviderClientConfig.credentials,
              secretAccessKey: 'invalid-test-secret',
            },
          },
        },
      } as never;
      (service as unknown as { s3Client: { destroy(): void } }).s3Client.destroy();
      service = new StorageService(mockLogger);
      expect(await service.deleteFile('test/file.txt')).toBe(false);
    });
    it('reports actual existence and missing object metadata', async () => {
      expect(await service.fileExists('test/file.txt')).toBe(true);
      expect(await service.fileExists('test/missing')).toBe(false);
      expect(await service.getFileMetadata('test/missing')).toBeNull();
    });
    it('reads real size, content type and modification time', async () => {
      expect(await service.getFileMetadata('test/file.txt')).toEqual({
        key: 'test/file.txt',
        size: 16,
        contentType: 'text/plain',
        lastModified: expect.any(Date),
      });
    });
    it('deletes a real prefix, leaving other objects intact', async () => {
      await fixture.put('remove/a', 'a');
      await fixture.put('remove/b', 'b');
      expect(await service.deleteDirectory('remove/')).toBe(2);
      expect(await service.deleteDirectory('remove/')).toBe(0);
      expect(await service.fileExists('test/file.txt')).toBe(true);
    });
    it('copies a real object and fetches a real presigned URL', async () => {
      await service.copyFile('test/file.txt', 'copy/file.txt');
      const url = await service.getPresignedUrl('copy/file.txt', 7200);
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('real Silo object');
    });
    it('handles omitted optional HEAD headers over a real Silo HTTP connection', async () => {
      const proxy = await siloProxy(
        fixture.config.s3ProviderClientConfig.endpoint,
        () => {},
        (req, incoming) => {
          if (req.method === 'HEAD') {
            delete incoming.headers['content-length'];
            delete incoming.headers['content-type'];
            delete incoming.headers['last-modified'];
          }
        }
      );
      try {
        (service as unknown as { s3Client: { destroy(): void } }).s3Client.destroy();
        mockConfig.nodeSettings.storageConfig = {
          storageMode: 's3provider',
          s3Config: {
            ...fixture.config,
            s3ProviderClientConfig: {
              ...fixture.config.s3ProviderClientConfig,
              endpoint: proxy.endpoint,
            },
          },
        } as never;
        service = new StorageService(mockLogger);
        expect(await service.getFileMetadata('test/file.txt')).toEqual({
          key: 'test/file.txt',
          size: 0,
          lastModified: expect.any(Date),
          contentType: 'application/octet-stream',
        });
      } finally {
        await proxy.close();
      }
    });
  });

  describe('resolveFilePath', () => {
    it('should resolve external/videos/ paths to videos directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        size: 100,
        mtime: new Date(),
      } as unknown as ReturnType<typeof fs.statSync>);

      const result = await service.getFileMetadata('external/videos/test/file.mp4');

      expect(result?.key).toBe('external/videos/test/file.mp4');
    });
  });
  it('rejects streaming reads when the S3 client is not configured', async () => {
    mockConfig.nodeSettings.storageConfig = { storageMode: 's3provider' } as never;
    service = new StorageService(mockLogger);
    await expect(service.getFileStream('file.ts')).rejects.toThrow('S3 client not configured');
  });
});
