import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { FilesystemError, deleteDirectory } from '@/utils/filesystem.js';

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    rm: vi.fn(),
  },
  existsSync: vi.fn(),
  rm: vi.fn(),
}));

// Mock promisify
vi.mock('node:util', () => ({
  promisify: vi.fn((fn) => fn),
}));

describe('utils/filesystem.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FilesystemError class', () => {
    it('should create a FilesystemError with message, code, and path', () => {
      const error = new FilesystemError('Test error', 'ENOENT', '/test/path');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('FilesystemError');
      expect(error.code).toBe('ENOENT');
      expect(error.path).toBe('/test/path');
    });

    it('should be an instance of Error', () => {
      const error = new FilesystemError('Test error', 'ENOENT', '/test/path');

      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('deleteDirectory function', () => {
    it('should delete directory when it exists', async () => {
      const mockRm = vi.fn().mockResolvedValue(undefined);
      vi.mocked(fs.rm).mockImplementation(mockRm);

      // Mock existsSync to return true
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await deleteDirectory('/test/dir');

      expect(fs.existsSync).toHaveBeenCalledWith('/test/dir');
      expect(fs.rm).toHaveBeenCalledWith('/test/dir', { recursive: true, force: true });
    });

    it('should not attempt deletion when directory does not exist', async () => {
      // Mock existsSync to return false
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await deleteDirectory('/nonexistent/dir');

      expect(fs.existsSync).toHaveBeenCalledWith('/nonexistent/dir');
      expect(fs.rm).not.toHaveBeenCalled();
    });

    it('should throw FilesystemError when fs.rm fails', async () => {
      const fsError = new Error('Permission denied') as NodeJS.ErrnoException;
      fsError.code = 'EACCES';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.rm).mockRejectedValue(fsError);

      await expect(deleteDirectory('/test/dir')).rejects.toThrow(FilesystemError);

      try {
        await deleteDirectory('/test/dir');
      } catch (error) {
        expect(error).toBeInstanceOf(FilesystemError);
        expect((error as FilesystemError).message).toBe('Failed to delete directory: Permission denied');
        expect((error as FilesystemError).code).toBe('EACCES');
        expect((error as FilesystemError).path).toBe('/test/dir');
      }
    });

    it('should handle error without code property', async () => {
      const fsError = new Error('Unknown error') as NodeJS.ErrnoException;
      // No code property

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.rm).mockRejectedValue(fsError);

      await expect(deleteDirectory('/test/dir')).rejects.toThrow(FilesystemError);

      try {
        await deleteDirectory('/test/dir');
      } catch (error) {
        expect((error as FilesystemError).code).toBe('UNKNOWN');
      }
    });
  });
});