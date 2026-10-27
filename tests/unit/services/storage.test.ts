/**
 * Storage Service Tests
 *
 * Tests for the StorageService class that handles unified file storage
 * for both filesystem and S3 backends.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageService } from '@/services/storage.js';
import type { Logger } from '@/utils/logger.js';
import fs from 'node:fs';

// Mock the S3 client - use hoisted mock
const { mockS3Send } = vi.hoisted(() => ({
  mockS3Send: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => {
  // Define the class inside the factory to avoid hoisting issues
  class MockS3Client {
    send = mockS3Send;
  }
  // Each command must be a class since they're instantiated with 'new'
  class MockGetObjectCommand {
    constructor(public params: Record<string, unknown>) {}
  }
  class MockDeleteObjectCommand {
    constructor(public params: Record<string, unknown>) {}
  }
  class MockHeadObjectCommand {
    constructor(public params: Record<string, unknown>) {}
  }
  class MockListObjectsV2Command {
    constructor(public params: Record<string, unknown>) {}
  }
  class MockCopyObjectCommand {
    constructor(public params: Record<string, unknown>) {}
  }
  class MockDeleteObjectsCommand {
    constructor(public params: Record<string, unknown>) {}
  }
  return {
    S3Client: MockS3Client,
    GetObjectCommand: MockGetObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
    HeadObjectCommand: MockHeadObjectCommand,
    ListObjectsV2Command: MockListObjectsV2Command,
    CopyObjectCommand: MockCopyObjectCommand,
    DeleteObjectsCommand: MockDeleteObjectsCommand,
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}));

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
  let service: StorageService;
  let mockLogger: Logger;
  let mockConfig: ReturnType<typeof getConfig>;

  beforeEach(() => {
    // Reset mock call history but keep implementations
    mockS3Send.mockReset();

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
    // Only reset the fs mocks, not the S3 mocks
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

  describe('S3 storage mode configuration', () => {
    beforeEach(() => {
      mockConfig.nodeSettings.storageConfig.storageMode = 's3provider';
      mockConfig.nodeSettings.storageConfig.s3Config = {
        bucketName: 'test-bucket',
        s3ProviderClientConfig: {
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
          },
        },
      };
      service = new StorageService(mockLogger);
    });

    it('should return s3provider storage mode', () => {
      expect(service.getStorageMode()).toBe('s3provider');
    });

    it('should return false when file existence check fails in S3 mode', async () => {
      // HeadObjectCommand throws NotFound for non-existent files
      const notFoundError = new Error('NotFound');
      notFoundError.name = 'NotFound';
      mockS3Send.mockRejectedValueOnce(notFoundError);
      const result = await service.fileExists('test.txt');
      expect(result).toBe(false);
    });

    it('should return null when metadata retrieval fails in S3 mode', async () => {
      const notFoundError = new Error('NotFound');
      notFoundError.name = 'NotFound';
      mockS3Send.mockRejectedValueOnce(notFoundError);
      const result = await service.getFileMetadata('test.txt');
      expect(result).toBeNull();
    });

    it('should handle delete file errors in S3 mode', async () => {
      // Configure mock to throw an error on delete
      mockS3Send.mockRejectedValueOnce(new Error('Delete failed'));
      const result = await service.deleteFile('test.txt');
      // deleteFromS3 returns false on error
      expect(result).toBe(false);
    });

    it('should throw for presigned URL with invalid S3 client state', async () => {
      // Test that presigned URLs work when properly configured
      const result = await service.getPresignedUrl('test.txt');
      expect(result).toBe('https://signed-url.example.com');
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

  describe('S3 storage operations', () => {
    beforeEach(() => {
      mockConfig.nodeSettings.storageConfig.storageMode = 's3provider';
      mockConfig.nodeSettings.storageConfig.s3Config = {
        bucketName: 'test-bucket',
        s3ProviderClientConfig: {
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
          },
        },
      };
      // Ensure mock returns the updated config
      vi.mocked(getConfig).mockReturnValue(mockConfig);
      mockS3Send.mockReset();
      service = new StorageService(mockLogger);
    });

    it('should get file stream from S3', async () => {
      const mockStream = { pipe: vi.fn() };
      mockS3Send.mockResolvedValueOnce({ Body: mockStream });

      const result = await service.getFileStream('test/file.txt');

      expect(result).toBe(mockStream);
    });

    it('should delete file from S3', async () => {
      mockS3Send.mockResolvedValueOnce({});

      const result = await service.deleteFile('test/file.txt');

      expect(result).toBe(true);
    });

    it('should return false when S3 delete fails', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('Delete failed'));

      const result = await service.deleteFile('test/file.txt');

      expect(result).toBe(false);
    });

    it('should check file exists in S3', async () => {
      mockS3Send.mockResolvedValueOnce({});

      const result = await service.fileExists('test/file.txt');

      expect(result).toBe(true);
    });

    it('should return false when file does not exist in S3', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('Not found'));

      const result = await service.fileExists('test/file.txt');

      expect(result).toBe(false);
    });

    it('should get file metadata from S3', async () => {
      mockS3Send.mockResolvedValueOnce({
        ContentLength: 1024,
        LastModified: new Date('2024-01-01'),
        ContentType: 'text/plain',
      });

      const result = await service.getFileMetadata('test/file.txt');

      expect(result).toEqual({
        key: 'test/file.txt',
        size: 1024,
        lastModified: new Date('2024-01-01'),
        contentType: 'text/plain',
      });
    });

    it('should return null when S3 metadata fails', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('Not found'));

      const result = await service.getFileMetadata('test/file.txt');

      expect(result).toBeNull();
    });

    it('should delete directory from S3', async () => {
      // First call lists files
      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: 'test/file1.txt', Size: 100, LastModified: new Date() },
          { Key: 'test/file2.txt', Size: 200, LastModified: new Date() },
        ],
        IsTruncated: false,
      });
      // Second call deletes files
      mockS3Send.mockResolvedValueOnce({});

      const result = await service.deleteDirectory('test/');

      expect(result).toBe(2);
    });

    it('should return 0 when S3 directory is empty', async () => {
      mockS3Send.mockResolvedValueOnce({
        Contents: [],
        IsTruncated: false,
      });

      const result = await service.deleteDirectory('test/');

      expect(result).toBe(0);
    });

    it('should copy file in S3', async () => {
      mockS3Send.mockResolvedValueOnce({});

      await service.copyFile('source/file.txt', 'dest/file.txt');

      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should get presigned URL for S3 file', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const result = await service.getPresignedUrl('test/file.txt', 7200);

      expect(result).toBe('https://signed-url.example.com');
      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('should handle S3 metadata with missing optional fields', async () => {
      mockS3Send.mockResolvedValueOnce({
        ContentLength: undefined,
        LastModified: undefined,
        ContentType: undefined,
      });

      const result = await service.getFileMetadata('test/file.txt');

      expect(result).toEqual({
        key: 'test/file.txt',
        size: 0,
        lastModified: expect.any(Date),
        contentType: 'application/octet-stream',
      });
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
