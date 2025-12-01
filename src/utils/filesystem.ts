/**
 * Filesystem Utilities
 *
 * Provides utility functions for filesystem operations including
 * directory management, file reading/writing, and JSON handling.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

// Promisified fs functions
const fsAccess = promisify(fs.access);
const fsMkdir = promisify(fs.mkdir);
const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const fsRm = promisify(fs.rm);
const fsReaddir = promisify(fs.readdir);
const fsStat = promisify(fs.stat);
const fsUnlink = promisify(fs.unlink);

/**
 * Filesystem error types
 */
export class FilesystemError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly path: string
  ) {
    super(message);
    this.name = 'FilesystemError';
  }
}

// ============================================
// Directory Operations
// ============================================

/**
 * Check if a path exists
 * @param targetPath - Path to check
 */
export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fsAccess(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path exists (synchronous)
 * @param targetPath - Path to check
 */
export function pathExistsSync(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param dirPath - Directory path to ensure
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fsMkdir(dirPath, { recursive: true });
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code !== 'EEXIST') {
      throw new FilesystemError(
        `Failed to create directory: ${fsError.message}`,
        fsError.code ?? 'UNKNOWN',
        dirPath
      );
    }
  }
}

/**
 * Ensure a directory exists (synchronous)
 * @param dirPath - Directory path to ensure
 */
export function ensureDirectorySync(dirPath: string): void {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code !== 'EEXIST') {
      throw new FilesystemError(
        `Failed to create directory: ${fsError.message}`,
        fsError.code ?? 'UNKNOWN',
        dirPath
      );
    }
  }
}

/**
 * Delete a directory recursively
 * @param dirPath - Directory path to delete
 */
export async function deleteDirectory(dirPath: string): Promise<void> {
  try {
    await fsRm(dirPath, { recursive: true, force: true });
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to delete directory: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      dirPath
    );
  }
}

/**
 * Delete a directory recursively (synchronous)
 * @param dirPath - Directory path to delete
 */
export function deleteDirectorySync(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to delete directory: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      dirPath
    );
  }
}

/**
 * List directory contents
 * @param dirPath - Directory path to list
 */
export async function listDirectory(dirPath: string): Promise<string[]> {
  try {
    return await fsReaddir(dirPath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to list directory: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      dirPath
    );
  }
}

/**
 * List directory contents (synchronous)
 * @param dirPath - Directory path to list
 */
export function listDirectorySync(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to list directory: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      dirPath
    );
  }
}

// ============================================
// File Operations
// ============================================

/**
 * Read a file as string
 * @param filePath - Path to file
 * @param encoding - File encoding (default: utf8)
 */
export async function readFile(
  filePath: string,
  encoding: BufferEncoding = 'utf8'
): Promise<string> {
  try {
    return await fsReadFile(filePath, encoding);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to read file: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      filePath
    );
  }
}

/**
 * Read a file as string (synchronous)
 * @param filePath - Path to file
 * @param encoding - File encoding (default: utf8)
 */
export function readFileSync(filePath: string, encoding: BufferEncoding = 'utf8'): string {
  try {
    return fs.readFileSync(filePath, encoding);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to read file: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      filePath
    );
  }
}

/**
 * Read a file as Buffer
 * @param filePath - Path to file
 */
export async function readFileBuffer(filePath: string): Promise<Buffer> {
  try {
    return await fsReadFile(filePath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to read file: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      filePath
    );
  }
}

/**
 * Read a file as Buffer (synchronous)
 * @param filePath - Path to file
 */
export function readFileBufferSync(filePath: string): Buffer {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to read file: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      filePath
    );
  }
}

/**
 * Write content to a file
 * @param filePath - Path to file
 * @param content - Content to write
 * @param encoding - File encoding (default: utf8)
 */
export async function writeFile(
  filePath: string,
  content: string | Buffer,
  encoding: BufferEncoding = 'utf8'
): Promise<void> {
  try {
    // Ensure parent directory exists
    const dirPath = path.dirname(filePath);
    await ensureDirectory(dirPath);

    await fsWriteFile(filePath, content, encoding);
  } catch (error) {
    if (error instanceof FilesystemError) {
      throw error;
    }
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to write file: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      filePath
    );
  }
}

/**
 * Write content to a file (synchronous)
 * @param filePath - Path to file
 * @param content - Content to write
 * @param encoding - File encoding (default: utf8)
 */
export function writeFileSync(
  filePath: string,
  content: string | Buffer,
  encoding: BufferEncoding = 'utf8'
): void {
  try {
    // Ensure parent directory exists
    const dirPath = path.dirname(filePath);
    ensureDirectorySync(dirPath);

    fs.writeFileSync(filePath, content, encoding);
  } catch (error) {
    if (error instanceof FilesystemError) {
      throw error;
    }
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to write file: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      filePath
    );
  }
}

/**
 * Delete a file
 * @param filePath - Path to file
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fsUnlink(filePath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    // Ignore if file doesn't exist
    if (fsError.code === 'ENOENT') {
      return;
    }
    throw new FilesystemError(
      `Failed to delete file: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      filePath
    );
  }
}

/**
 * Delete a file (synchronous)
 * @param filePath - Path to file
 */
export function deleteFileSync(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    // Ignore if file doesn't exist
    if (fsError.code === 'ENOENT') {
      return;
    }
    throw new FilesystemError(
      `Failed to delete file: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      filePath
    );
  }
}

/**
 * Get file stats
 * @param filePath - Path to file
 */
export async function getFileStats(filePath: string): Promise<fs.Stats> {
  try {
    return await fsStat(filePath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to get file stats: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      filePath
    );
  }
}

/**
 * Get file stats (synchronous)
 * @param filePath - Path to file
 */
export function getFileStatsSync(filePath: string): fs.Stats {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to get file stats: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      filePath
    );
  }
}

/**
 * Check if path is a directory
 * @param targetPath - Path to check
 */
export async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stats = await fsStat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory (synchronous)
 * @param targetPath - Path to check
 */
export function isDirectorySync(targetPath: string): boolean {
  try {
    const stats = fs.statSync(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file
 * @param targetPath - Path to check
 */
export async function isFile(targetPath: string): Promise<boolean> {
  try {
    const stats = await fsStat(targetPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file (synchronous)
 * @param targetPath - Path to check
 */
export function isFileSync(targetPath: string): boolean {
  try {
    const stats = fs.statSync(targetPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

// ============================================
// JSON File Operations
// ============================================

/**
 * Read and parse a JSON file
 * @param filePath - Path to JSON file
 */
export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath);
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new FilesystemError(
      `Failed to parse JSON: ${(error as Error).message}`,
      'PARSE_ERROR',
      filePath
    );
  }
}

/**
 * Read and parse a JSON file (synchronous)
 * @param filePath - Path to JSON file
 */
export function readJsonFileSync<T>(filePath: string): T {
  const content = readFileSync(filePath);
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new FilesystemError(
      `Failed to parse JSON: ${(error as Error).message}`,
      'PARSE_ERROR',
      filePath
    );
  }
}

/**
 * Write data to a JSON file
 * @param filePath - Path to JSON file
 * @param data - Data to write
 * @param pretty - Whether to format with indentation
 */
export async function writeJsonFile<T>(filePath: string, data: T, pretty = true): Promise<void> {
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeFile(filePath, content);
}

/**
 * Write data to a JSON file (synchronous)
 * @param filePath - Path to JSON file
 * @param data - Data to write
 * @param pretty - Whether to format with indentation
 */
export function writeJsonFileSync<T>(filePath: string, data: T, pretty = true): void {
  const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  writeFileSync(filePath, content);
}

// ============================================
// Base64 Operations
// ============================================

/**
 * Read a file and convert to base64
 * @param filePath - Path to file
 */
export async function readFileAsBase64(filePath: string): Promise<string> {
  const buffer = await readFileBuffer(filePath);
  return buffer.toString('base64');
}

/**
 * Read a file and convert to base64 (synchronous)
 * @param filePath - Path to file
 */
export function readFileAsBase64Sync(filePath: string): string {
  const buffer = readFileBufferSync(filePath);
  return buffer.toString('base64');
}

// ============================================
// Path Utilities
// ============================================

/**
 * Get the hosts file path for the current OS
 */
export function getHostsFilePath(): string {
  const platform = process.platform;

  switch (platform) {
    case 'win32':
      return path.join(
        process.env['SystemRoot'] ?? 'C:\\Windows',
        'System32',
        'drivers',
        'etc',
        'hosts'
      );
    case 'darwin':
    case 'linux':
      return '/etc/hosts';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Normalize a path for the current OS
 * @param targetPath - Path to normalize
 */
export function normalizePath(targetPath: string): string {
  return path.normalize(targetPath);
}

/**
 * Join path segments
 * @param segments - Path segments to join
 */
export function joinPath(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Get the directory name from a path
 * @param filePath - File path
 */
export function getDirname(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Get the file name from a path
 * @param filePath - File path
 * @param ext - Extension to remove (optional)
 */
export function getBasename(filePath: string, ext?: string): string {
  return path.basename(filePath, ext);
}

/**
 * Get the extension from a path
 * @param filePath - File path
 */
export function getExtname(filePath: string): string {
  return path.extname(filePath);
}
