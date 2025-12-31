/**
 * Filesystem Utilities
 *
 * Provides utility functions for filesystem operations including
 * directory management, file reading/writing, and JSON handling.
 */

import * as fs from 'node:fs';
import { promisify } from 'node:util';

// Promisified fs functions
const fsRm = promisify(fs.rm);

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

/**
 * Delete a directory recursively
 * @param dirPath - Directory path to delete
 */
export async function deleteDirectory(dirPath: string): Promise<void> {
  try {
    if (fs.existsSync(dirPath)) {
      await fsRm(dirPath, { recursive: true, force: true });
    }
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    throw new FilesystemError(
      `Failed to delete directory: ${fsError.message}`,
      fsError.code ?? 'UNKNOWN',
      dirPath
    );
  }
}

// ============================================
// Path Utilities
// ============================================
