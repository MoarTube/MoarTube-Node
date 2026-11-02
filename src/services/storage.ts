/**
 * Storage Service
 *
 * Unified storage abstraction layer supporting both filesystem and S3 storage modes.
 * Provides a consistent interface for file operations regardless of storage backend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Readable } from 'node:stream';
import { writeUpload } from '@/utils/stream-files.js';
import { rewriteManifestFile } from '@/utils/manifest-transform.js';
import { distributionSignal } from '@/utils/cloudflare-http.js';

import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  PutObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { deleteS3Objects } from '@/utils/s3-delete.js';

import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import type { StorageMode, FileMetadata } from '@services/interfaces.js';
import { getConfig } from '@config/index.js';
import type { StorageConfig } from '@/types/config.js';
import { storageIdentity } from '@/utils/cdn-settings.js';

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
  private clientKey = '';
  private readonly activeClients = new Map<S3Client, number>();
  private readonly retiredClients = new Set<S3Client>();

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

      const key = JSON.stringify(storageConfig);
      if (key === this.clientKey) {
        return;
      }
      const previous = this.s3Client;
      this.s3Client = null;
      this.s3Config = null;
      this.clientKey = '';
      if (previous) {
        this.retireClient(previous);
      }
      if (storageConfig.storageMode === 's3provider' && storageConfig.s3Config) {
        const next = {
          bucketName: storageConfig.s3Config.bucketName,
          s3ProviderClientConfig: storageConfig.s3Config.s3ProviderClientConfig as S3ClientConfig,
        };
        this.s3Client = new S3Client({
          ...next.s3ProviderClientConfig,
          requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
        });
        this.s3Config = next;
      }
      this.clientKey = key;
    } catch (error) {
      this.logger.error('S3 client not configured', error);
    }
  }

  /**
   * Get current storage mode
   */
  getStorageMode(): StorageMode {
    this.initializeS3Client();
    const config = getConfig();
    return config.nodeSettings.storageConfig.storageMode;
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
    if (this.getStorageMode() !== 's3provider') {
      throw new Error('Presigned URLs are only available for S3 storage');
    }

    return this.withS3Client((client, config) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucketName, Key: key }), {
        expiresIn,
      })
    );
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
        }

        if (entry.isDirectory()) {
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
    this.initializeS3Client();
    if (!this.s3Client || !this.s3Config) {
      throw new Error('S3 client not configured');
    }
    return { client: this.s3Client, config: this.s3Config };
  }

  private retireClient(client: S3Client): void {
    if ((this.activeClients.get(client) ?? 0) === 0) {
      client.destroy();
    } else {
      this.retiredClients.add(client);
    }
  }

  close(): void {
    if (this.s3Client) {
      this.retireClient(this.s3Client);
    }
    this.s3Client = null;
    this.s3Config = null;
    this.clientKey = '';
  }

  async rewriteS3Manifest(key: string, baseUrl: string): Promise<void> {
    await this.replaceS3Manifest(
      key,
      [{ key, cache: 'public, max-age=0, s-maxage=30, must-revalidate' }],
      (line) => line.replaceAll(/(https?:[/][/]).*?([/]external[/])/g, baseUrl + '$2')
    );
  }

  async finalizeS3Stream(
    videoId: string,
    resolutions: string[],
    recorded: boolean
  ): Promise<number | undefined> {
    const prefix = `external/videos/${videoId}/adaptive/m3u8/`;
    const live = 'dynamic/manifests/manifest-';
    const vod = 'static/manifests/manifest-';
    try {
      let longest = 0;
      for (const resolution of resolutions) {
        const targets = recorded
          ? [
              {
                key: prefix + vod + resolution + '.m3u8',
                cache: 'public, max-age=0, s-maxage=30, must-revalidate',
              },
              { key: prefix + live + resolution + '.m3u8', cache: 'no-store' },
            ]
          : [{ key: prefix + live + resolution + '.m3u8', cache: 'no-store' }];
        longest = Math.max(
          longest,
          await this.replaceS3Manifest(
            prefix + live + resolution + '.m3u8',
            targets,
            (line) => line,
            true
          )
        );
      }
      if (recorded) {
        await this.replaceS3Manifest(
          prefix + live + 'master.m3u8',
          [
            {
              key: prefix + vod + 'master.m3u8',
              cache: 'public, max-age=0, s-maxage=30, must-revalidate',
            },
          ],
          (line) => line.replaceAll('/dynamic/', '/static/')
        );
      }
      await this.replaceS3Manifest(
        prefix + live + 'master.m3u8',
        [{ key: prefix + live + 'master.m3u8', cache: 'no-store' }],
        (line) => line
      );
      return longest;
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
      ) {
        const startupOnly = await this.withS3Client(async (client, config) => {
          const signal = distributionSignal();
          const page = await client.send(
            new ListObjectsV2Command({
              Bucket: config.bucketName,
              Prefix: prefix,
              MaxKeys: 2,
            }),
            signal ? { abortSignal: signal } : {}
          );
          return (
            !page.IsTruncated &&
            (page.Contents ?? []).every((object) => object.Key === prefix + live + 'master.m3u8')
          );
        });
        // No rendition or segment was ever published. A startup master alone is not a recording.
        if (startupOnly) {
          return undefined;
        }
      }
      throw error;
    }
  }

  /** Stage a bounded manifest on disk; S3 publishes complete replacements, renditions before master. */
  private async replaceS3Manifest(
    key: string,
    targets: Array<{ key: string; cache: string }>,
    transform: (line: string) => string,
    finalize = false
  ): Promise<number> {
    return this.withS3Client(async (client, config) => {
      const signal = distributionSignal();
      const directory = await mkdtemp(path.join(tmpdir(), 'moartube-manifest-'));
      const file = path.join(directory, 'manifest.m3u8');
      let duration = 0,
        maximum = 0;
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
          signal ? { abortSignal: signal } : {}
        );
        const body = response.Body as Readable;
        try {
          await writeUpload({ file: body }, file, 5 * 1024 ** 3, signal);
        } finally {
          body.destroy();
        }
        await rewriteManifestFile(
          file,
          (line) => {
            const match = /^#EXTINF:([^,]+)/.exec(line);
            if (match) {
              const value = Number(match[1]);
              if (!Number.isFinite(value) || value < 0) {
                throw new Error('Invalid playlist segment duration');
              }
              duration += value;
              maximum = Math.max(maximum, value);
            }
            return transform(line);
          },
          finalize,
          signal
        );
        for (const target of targets) {
          const source = fs.createReadStream(file);
          try {
            await client.send(
              new PutObjectCommand({
                Bucket: config.bucketName,
                Key: target.key,
                Body: source,
                ContentLength: fs.statSync(file).size,
                ContentType: 'application/vnd.apple.mpegurl',
                CacheControl: target.cache,
              }),
              signal ? { abortSignal: signal } : {}
            );
          } finally {
            source.destroy();
          }
        }
        return Math.ceil((duration + maximum + 6) * 1000);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }

  async deleteStoppedStream(
    videoId: string,
    storage: StorageConfig,
    videosDirectory: string
  ): Promise<void> {
    if (storage.storageMode === 'filesystem') {
      await rm(path.join(videosDirectory, videoId, 'adaptive', 'm3u8'), {
        recursive: true,
        force: true,
      });
      return;
    }
    if (!storage.s3Config) {
      throw new Error('Missing stopped-stream S3 configuration');
    }
    const current = getConfig().nodeSettings.storageConfig;
    const selected =
      storageIdentity(current) === storageIdentity(storage) && current.s3Config
        ? current.s3Config
        : storage.s3Config;
    const client = new S3Client({
      ...selected.s3ProviderClientConfig,
      requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
    } as S3ClientConfig);
    try {
      await this.deleteS3Prefix(
        client,
        {
          bucketName: selected.bucketName,
          s3ProviderClientConfig: selected.s3ProviderClientConfig as S3ClientConfig,
        },
        `external/videos/${videoId}/adaptive/m3u8/`
      );
    } finally {
      client.destroy();
    }
  }

  private async withS3Client<T>(
    operation: (client: S3Client, config: S3Config) => Promise<T>,
    stream = false
  ): Promise<T> {
    const { client, config } = this.ensureS3Client();
    this.activeClients.set(client, (this.activeClients.get(client) ?? 0) + 1);
    let released = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      // Every lease increments this entry before invoking the operation; only release removes it.
      const remaining = (this.activeClients.get(client) as number) - 1;
      if (remaining === 0) {
        this.activeClients.delete(client);
        if (this.retiredClients.delete(client)) {
          client.destroy();
        }
      } else {
        this.activeClients.set(client, remaining);
      }
    };
    try {
      const result = await operation(client, config);
      if (stream) {
        const body = result as NodeJS.ReadableStream;
        body.once('end', release);
        body.once('error', release);
        body.once('close', release);
      } else {
        release();
      }
      return result;
    } catch (error) {
      release();
      throw error;
    }
  }

  private async getStreamFromS3(key: string): Promise<NodeJS.ReadableStream> {
    return this.withS3Client(async (client, config) => {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        })
      );

      return response.Body as NodeJS.ReadableStream;
    }, true);
  }

  private async deleteFromS3(key: string): Promise<boolean> {
    return this.withS3Client(async (client, config) => {
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
    });
  }

  private async existsInS3(key: string): Promise<boolean> {
    return this.withS3Client(async (client, config) => {
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
    });
  }

  private async getS3Metadata(key: string): Promise<FileMetadata | null> {
    return this.withS3Client(async (client, config) => {
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
    });
  }

  private async deleteS3Directory(prefix: string): Promise<number> {
    return this.withS3Client((client, config) => this.deleteS3Prefix(client, config, prefix));
  }

  private async deleteS3Prefix(
    client: S3Client,
    config: S3Config,
    prefix: string
  ): Promise<number> {
    let count = 0,
      continuationToken: string | undefined;
    const seenTokens = new Set<string>();
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
      const keys = (page.Contents ?? []).flatMap((object) =>
        object.Key ? [{ Key: object.Key }] : []
      );
      if (keys.length) {
        count += await deleteS3Objects(
          client,
          config.bucketName,
          keys.map((object) => object.Key)
        );
      }
      const next = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && (!next || seenTokens.has(next))) {
        throw new Error('Invalid S3 continuation token');
      }
      if (next !== undefined) {
        seenTokens.add(next);
      }
      continuationToken = next;
    } while (continuationToken);
    return count;
  }

  private async copyS3File(sourceKey: string, destKey: string): Promise<void> {
    return this.withS3Client(async (client, config) => {
      await client.send(
        new CopyObjectCommand({
          Bucket: config.bucketName,
          CopySource: `${config.bucketName}/${sourceKey}`,
          Key: destKey,
        })
      );
    });
  }
}
