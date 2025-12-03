/**
 * S3 Storage Client
 *
 * AWS S3 compatible storage client for managing video files.
 * Supports listing, fetching, and streaming objects.
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  type S3ClientConfig,
  type _Object,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import type { ILogger } from './logger.js';

/**
 * S3 storage error
 */
export class S3StorageError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'S3StorageError';
  }
}

/**
 * S3 storage client configuration
 */
export interface S3StorageClientConfig {
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** S3 endpoint URL (for S3-compatible services) */
  endpoint?: string;
  /** AWS region */
  region?: string;
  /** Force path style (required for some S3-compatible services) */
  forcePathStyle?: boolean;
  /** Optional logger */
  logger?: ILogger;
}

/**
 * S3 object info
 */
export interface S3ObjectInfo {
  key: string;
  size?: number | undefined;
  lastModified?: Date | undefined;
  etag?: string | undefined;
}

/**
 * S3 list result
 */
export interface S3ListResult {
  objects: S3ObjectInfo[];
  isTruncated: boolean;
  continuationToken?: string | undefined;
}

/**
 * S3 upload options
 */
export interface S3UploadOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

/**
 * S3 Storage Client
 *
 * Handles all S3 storage operations for video files.
 */
export class S3StorageClient {
  private readonly client: S3Client;
  private readonly logger: ILogger | undefined;

  constructor(config: S3StorageClientConfig) {
    this.logger = config.logger;

    const s3Config: S3ClientConfig = {
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      region: config.region ?? 'us-east-1',
    };

    if (config.endpoint !== undefined && config.endpoint !== '') {
      s3Config.endpoint = config.endpoint;
    }

    if (config.forcePathStyle !== undefined) {
      s3Config.forcePathStyle = config.forcePathStyle;
    }

    this.client = new S3Client(s3Config);
  }

  // ============================================
  // List Operations
  // ============================================

  /**
   * List objects with a prefix
   * @param bucket - S3 bucket name
   * @param prefix - Object key prefix
   * @param maxKeys - Maximum number of keys to return
   * @param continuationToken - Continuation token for pagination
   */
  async listObjectsWithPrefix(
    bucket: string,
    prefix: string,
    maxKeys = 1000,
    continuationToken?: string
  ): Promise<S3ListResult> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      });

      const response = await this.client.send(command);

      const objects: S3ObjectInfo[] = (response.Contents ?? []).map((obj: _Object) => ({
        key: obj.Key ?? '',
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: obj.ETag,
      }));

      return {
        objects,
        isTruncated: response.IsTruncated ?? false,
        continuationToken: response.NextContinuationToken,
      };
    } catch (error) {
      this.logger?.error('Failed to list objects', error as Error, {
        bucket,
        prefix,
      });
      throw new S3StorageError(
        `Failed to list objects: ${(error as Error).message}`,
        undefined,
        'listObjectsWithPrefix'
      );
    }
  }

  /**
   * List all objects with a prefix (handles pagination)
   * @param bucket - S3 bucket name
   * @param prefix - Object key prefix
   */
  async listAllObjectsWithPrefix(bucket: string, prefix: string): Promise<S3ObjectInfo[]> {
    const allObjects: S3ObjectInfo[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.listObjectsWithPrefix(bucket, prefix, 1000, continuationToken);
      allObjects.push(...result.objects);
      continuationToken = result.continuationToken;
    } while (continuationToken !== undefined && continuationToken !== '');

    return allObjects;
  }

  // ============================================
  // Get Operations
  // ============================================

  /**
   * Get object as buffer
   * @param bucket - S3 bucket name
   * @param key - Object key
   */
  async getObjectBuffer(bucket: string, key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.client.send(command);
      const stream = response.Body as Readable;

      return await this.streamToBuffer(stream);
    } catch (error) {
      this.logger?.error('Failed to get object', error as Error, {
        bucket,
        key,
      });
      throw new S3StorageError(
        `Failed to get object: ${(error as Error).message}`,
        undefined,
        'getObjectBuffer'
      );
    }
  }

  /**
   * Get object as stream
   * @param bucket - S3 bucket name
   * @param key - Object key
   */
  async getObjectStream(bucket: string, key: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.client.send(command);
      return response.Body as Readable;
    } catch (error) {
      this.logger?.error('Failed to get object stream', error as Error, {
        bucket,
        key,
      });
      throw new S3StorageError(
        `Failed to get object stream: ${(error as Error).message}`,
        undefined,
        'getObjectStream'
      );
    }
  }

  /**
   * Check if object exists
   * @param bucket - S3 bucket name
   * @param key - Object key
   */
  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get object metadata
   * @param bucket - S3 bucket name
   * @param key - Object key
   */
  async getObjectMetadata(bucket: string, key: string): Promise<S3ObjectInfo | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.client.send(command);
      return {
        key,
        size: response.ContentLength,
        lastModified: response.LastModified,
        etag: response.ETag,
      };
    } catch {
      return null;
    }
  }

  // ============================================
  // Put Operations
  // ============================================

  /**
   * Upload buffer to S3
   * @param bucket - S3 bucket name
   * @param key - Object key
   * @param data - Buffer data
   * @param options - Upload options
   */
  async putObject(
    bucket: string,
    key: string,
    data: Buffer | Readable,
    options?: S3UploadOptions
  ): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: options?.contentType,
        CacheControl: options?.cacheControl,
        Metadata: options?.metadata,
      });

      await this.client.send(command);
      this.logger?.debug(`Uploaded object: ${bucket}/${key}`);
    } catch (error) {
      this.logger?.error('Failed to put object', error as Error, {
        bucket,
        key,
      });
      throw new S3StorageError(
        `Failed to put object: ${(error as Error).message}`,
        undefined,
        'putObject'
      );
    }
  }

  // ============================================
  // Delete Operations
  // ============================================

  /**
   * Delete a single object
   * @param bucket - S3 bucket name
   * @param key - Object key
   */
  async deleteObject(bucket: string, key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.client.send(command);
      this.logger?.debug(`Deleted object: ${bucket}/${key}`);
    } catch (error) {
      this.logger?.error('Failed to delete object', error as Error, {
        bucket,
        key,
      });
      throw new S3StorageError(
        `Failed to delete object: ${(error as Error).message}`,
        undefined,
        'deleteObject'
      );
    }
  }

  /**
   * Delete multiple objects
   * @param bucket - S3 bucket name
   * @param keys - Object keys to delete
   */
  async deleteObjects(bucket: string, keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    try {
      // S3 limits batch delete to 1000 objects
      const batches = this.chunkArray(keys, 1000);

      for (const batch of batches) {
        const command = new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
          },
        });

        await this.client.send(command);
      }

      this.logger?.debug(`Deleted ${keys.length} objects from ${bucket}`);
    } catch (error) {
      this.logger?.error('Failed to delete objects', error as Error, {
        bucket,
        count: keys.length,
      });
      throw new S3StorageError(
        `Failed to delete objects: ${(error as Error).message}`,
        undefined,
        'deleteObjects'
      );
    }
  }

  /**
   * Delete all objects with a prefix
   * @param bucket - S3 bucket name
   * @param prefix - Object key prefix
   */
  async deleteObjectsWithPrefix(bucket: string, prefix: string): Promise<number> {
    const objects = await this.listAllObjectsWithPrefix(bucket, prefix);
    const keys = objects.map((obj) => obj.key);

    if (keys.length > 0) {
      await this.deleteObjects(bucket, keys);
    }

    return keys.length;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Convert stream to buffer
   */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Destroy the client (cleanup)
   */
  destroy(): void {
    this.client.destroy();
  }
}

/**
 * Create an S3 storage client
 */
export function createS3StorageClient(config: S3StorageClientConfig): S3StorageClient {
  return new S3StorageClient(config);
}
