/**
 * Storage Service
 *
 * Unified storage abstraction layer supporting both filesystem and S3 storage modes.
 * Provides a consistent interface for file operations regardless of storage backend.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectsCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/logger.js';
import type { StorageMode, FileMetadata } from '@services/interfaces.js';
import { getConfig } from '@config/index.js';

/**
 * S3 configuration for the storage service
 */
export interface S3Config {
  bucketName: string;
  s3ProviderClientConfig: S3ClientConfig;
}

/**
 * StorageService class
 *
 * Provides unified file storage operations for:
 * - Filesystem storage (local disk)
 * - S3-compatible storage (AWS S3, MinIO, DigitalOcean Spaces, etc.)
 */
export class StorageService extends BaseService {
  private s3Client: S3Client | null = null;
  private s3Config: S3Config | null = null;

  constructor(logger: Logger) {
    super('StorageService', logger);
    this.initializeS3Client();
  }

  /**
   * Initialize S3 client if configured
   */
  private initializeS3Client(): void {
    try {
      const config = getConfig();
      const storageConfig = config.nodeSettings.storageConfig;

      if (storageConfig.storageMode === 's3provider' && storageConfig.s3Config) {
        this.s3Config = {
          bucketName: storageConfig.s3Config.bucketName,
          s3ProviderClientConfig: storageConfig.s3Config.s3ProviderClientConfig as S3ClientConfig,
        };
        this.s3Client = new S3Client(this.s3Config.s3ProviderClientConfig);
      }
    } catch (error) {
      this.logger.error('S3 client not configured', error);
    }
  }

  /**
   * Get current storage mode
   */
  getStorageMode(): StorageMode {
    const config = getConfig();
    return config.nodeSettings.storageConfig.storageMode;
  }

  /**
   * Save a file to storage
   */
  async saveFile(key: string, data: Buffer, contentType?: string): Promise<void> {
    return this.withErrorLogging('saveFile', async () => {
      if (this.getStorageMode() === 'filesystem') {
        this.saveToFilesystem(key, data);
      } else {
        await this.saveToS3(key, data, contentType);
      }
    });
  }

  /**
   * Get a file from storage
   */
  async getFile(key: string): Promise<Buffer> {
    return this.withErrorLogging('getFile', async () => {
      if (this.getStorageMode() === 'filesystem') {
        return this.getFromFilesystem(key);
      } else {
        return this.getFromS3(key);
      }
    });
  }

  /**
   * Get a file stream from storage
   */
  async getFileStream(key: string): Promise<NodeJS.ReadableStream> {
    if (this.getStorageMode() === 'filesystem') {
      const filePath = this.resolveFilePath(key);
      return fs.createReadStream(filePath);
    } else {
      return this.getStreamFromS3(key);
    }
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(key: string): Promise<boolean> {
    return this.withErrorLogging('deleteFile', async () => {
      if (this.getStorageMode() === 'filesystem') {
        return this.deleteFromFilesystem(key);
      } else {
        return this.deleteFromS3(key);
      }
    });
  }

  /**
   * Check if a file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      if (this.getStorageMode() === 'filesystem') {
        const filePath = this.resolveFilePath(key);
        return fs.existsSync(filePath);
      } else {
        return await this.existsInS3(key);
      }
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string): Promise<FileMetadata | null> {
    try {
      if (this.getStorageMode() === 'filesystem') {
        return this.getFilesystemMetadata(key);
      } else {
        return await this.getS3Metadata(key);
      }
    } catch {
      return null;
    }
  }

  /**
   * List files in a directory/prefix
   */
  async listFiles(prefix: string): Promise<FileMetadata[]> {
    return this.withErrorLogging('listFiles', async () => {
      if (this.getStorageMode() === 'filesystem') {
        return this.listFilesystemFiles(prefix);
      } else {
        return this.listS3Files(prefix);
      }
    });
  }

  /**
   * Delete a directory recursively
   */
  async deleteDirectory(prefix: string): Promise<number> {
    return this.withErrorLogging('deleteDirectory', async () => {
      if (this.getStorageMode() === 'filesystem') {
        return this.deleteFilesystemDirectory(prefix);
      } else {
        return this.deleteS3Directory(prefix);
      }
    });
  }

  /**
   * Copy a file
   */
  async copyFile(sourceKey: string, destKey: string): Promise<void> {
    return this.withErrorLogging('copyFile', async () => {
      if (this.getStorageMode() === 'filesystem') {
        this.copyFilesystemFile(sourceKey, destKey);
      } else {
        await this.copyS3File(sourceKey, destKey);
      }
    });
  }

  /**
   * Get presigned URL for direct access (S3 only)
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (this.getStorageMode() !== 's3provider' || !this.s3Client || !this.s3Config) {
      throw new Error('Presigned URLs are only available for S3 storage');
    }

    const command = new GetObjectCommand({
      Bucket: this.s3Config.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  // ============================================================================
  // Filesystem Storage Methods
  // ============================================================================

  private resolveFilePath(key: string): string {
    const config = getConfig();
    // Key is relative to data directory or videos directory based on prefix
    if (key.startsWith('external/videos/')) {
      return path.join(config.paths.videosDirectoryPath, key.replace('external/videos/', ''));
    }
    return path.join(config.paths.dataDirectoryPath, key);
  }

  private saveToFilesystem(key: string, data: Buffer): void {
    const filePath = this.resolveFilePath(key);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, data);
  }

  private getFromFilesystem(key: string): Buffer {
    const filePath = this.resolveFilePath(key);
    return fs.readFileSync(filePath);
  }

  private deleteFromFilesystem(key: string): boolean {
    const filePath = this.resolveFilePath(key);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
      return true;
    }
    return false;
  }

  private getFilesystemMetadata(key: string): FileMetadata | null {
    const filePath = this.resolveFilePath(key);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const stats = fs.statSync(filePath);
    return {
      key,
      size: stats.size,
      lastModified: stats.mtime,
    };
  }

  private listFilesystemFiles(prefix: string): FileMetadata[] {
    const dirPath = this.resolveFilePath(prefix);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return [];
    }

    const files: FileMetadata[] = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(dirPath, entry.name);
        const stats = fs.statSync(filePath);
        files.push({
          key: path.join(prefix, entry.name),
          size: stats.size,
          lastModified: stats.mtime,
        });
      }
    }

    return files;
  }

  private deleteFilesystemDirectory(prefix: string): number {
    const dirPath = this.resolveFilePath(prefix);
    if (!fs.existsSync(dirPath)) {
      return 0;
    }

    // Count files before deletion
    let count = 0;
    const countFiles = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          count++;
        } else if (entry.isDirectory()) {
          countFiles(path.join(dir, entry.name));
        }
      }
    };

    countFiles(dirPath);
    fs.rmSync(dirPath, { recursive: true, force: true });
    return count;
  }

  private copyFilesystemFile(sourceKey: string, destKey: string): void {
    const sourcePath = this.resolveFilePath(sourceKey);
    const destPath = this.resolveFilePath(destKey);

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(sourcePath, destPath);
  }

  // ============================================================================
  // S3 Storage Methods
  // ============================================================================

  private ensureS3Client(): { client: S3Client; config: S3Config } {
    if (!this.s3Client || !this.s3Config) {
      throw new Error('S3 client not configured');
    }
    return { client: this.s3Client, config: this.s3Config };
  }

  private async saveToS3(key: string, data: Buffer, contentType?: string): Promise<void> {
    const { client, config } = this.ensureS3Client();

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
  }

  private async getFromS3(key: string): Promise<Buffer> {
    const { client, config } = this.ensureS3Client();

    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      })
    );

    return this.streamToBuffer(response.Body as Readable);
  }

  private async getStreamFromS3(key: string): Promise<NodeJS.ReadableStream> {
    const { client, config } = this.ensureS3Client();

    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      })
    );

    return response.Body as NodeJS.ReadableStream;
  }

  private async deleteFromS3(key: string): Promise<boolean> {
    const { client, config } = this.ensureS3Client();

    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  private async existsInS3(key: string): Promise<boolean> {
    const { client, config } = this.ensureS3Client();

    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  private async getS3Metadata(key: string): Promise<FileMetadata | null> {
    const { client, config } = this.ensureS3Client();

    try {
      const response = await client.send(
        new HeadObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        })
      );

      return {
        key,
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(),
        contentType: response.ContentType ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  private async listS3Files(prefix: string): Promise<FileMetadata[]> {
    const { client, config } = this.ensureS3Client();

    const files: FileMetadata[] = [];
    let continuationToken: string | undefined;
    let isTruncated = true;

    while (isTruncated) {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      if (response.Contents !== undefined) {
        for (const obj of response.Contents) {
          if (obj.Key !== undefined && obj.Key !== '') {
            files.push({
              key: obj.Key,
              size: obj.Size ?? 0,
              lastModified: obj.LastModified ?? new Date(),
            });
          }
        }
      }

      isTruncated = response.IsTruncated ?? false;
      continuationToken = response.NextContinuationToken;
    }

    return files;
  }

  private async deleteS3Directory(prefix: string): Promise<number> {
    const { client, config } = this.ensureS3Client();

    const files = await this.listS3Files(prefix);
    if (files.length === 0) {
      return 0;
    }

    // Delete in batches of 1000 (S3 limit)
    const batchSize = 1000;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucketName,
          Delete: {
            Objects: batch.map((f) => ({ Key: f.key })),
          },
        })
      );
    }

    return files.length;
  }

  private async copyS3File(sourceKey: string, destKey: string): Promise<void> {
    const { client, config } = this.ensureS3Client();

    await client.send(
      new CopyObjectCommand({
        Bucket: config.bucketName,
        CopySource: `${config.bucketName}/${sourceKey}`,
        Key: destKey,
      })
    );
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      stream.on('error', reject);
    });
  }
}
