/**
 * Links Service Tests
 *
 * Tests for the LinksService class that handles social link CRUD operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinksService } from '@/services/links.js';
import type { Logger } from '@/utils/logger.js';
import type { ILinksRepository } from '@/database/repositories/index.js';
import type { DrizzleLink } from '@/database/schemas/sqlite/index.js';

describe('LinksService', () => {
  let service: LinksService;
  let mockLogger: Logger;
  let mockLinksRepository: ILinksRepository;

  const mockLink: DrizzleLink = {
    id: 1,
    url: 'https://twitter.com/moartube',
    svg_graphic: '<svg>...</svg>',
    timestamp: 1704067200000,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as Logger;

    mockLinksRepository = {
      findAll: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    } as unknown as ILinksRepository;

    service = new LinksService(mockLogger, mockLinksRepository);
  });

  describe('constructor', () => {
    it('should create a LinksService instance', () => {
      expect(service).toBeInstanceOf(LinksService);
    });
  });

  describe('getAllLinks', () => {
    it('should return all links', async () => {
      const mockLinks: DrizzleLink[] = [
        mockLink,
        { ...mockLink, id: 2, url: 'https://github.com/moartube' },
      ];
      vi.mocked(mockLinksRepository.findAll).mockResolvedValue(mockLinks);

      const result = await service.getAllLinks();

      expect(result).toEqual(mockLinks);
      expect(result).toHaveLength(2);
      expect(mockLinksRepository.findAll).toHaveBeenCalled();
    });

    it('should return empty array when no links exist', async () => {
      vi.mocked(mockLinksRepository.findAll).mockResolvedValue([]);

      const result = await service.getAllLinks();

      expect(result).toEqual([]);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Database error');
      vi.mocked(mockLinksRepository.findAll).mockRejectedValue(error);

      await expect(service.getAllLinks()).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith('getAllLinks failed', error);
    });
  });

  describe('createLink', () => {
    it('should create a new link', async () => {
      vi.mocked(mockLinksRepository.create).mockResolvedValue(mockLink);

      const result = await service.createLink({
        url: 'https://twitter.com/moartube',
        svgGraphic: '<svg>...</svg>',
      });

      expect(result).toEqual(mockLink);
      expect(mockLinksRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://twitter.com/moartube',
          svg_graphic: '<svg>...</svg>',
        })
      );
    });

    it('should set timestamp on new link', async () => {
      vi.mocked(mockLinksRepository.create).mockImplementation(async (data) => ({
        id: 1,
        url: data.url,
        svg_graphic: data.svg_graphic,
        timestamp: data.timestamp,
      }));

      const beforeTime = Date.now();
      await service.createLink({
        url: 'https://example.com',
        svgGraphic: '<svg/>',
      });
      const afterTime = Date.now();

      const createCall = vi.mocked(mockLinksRepository.create).mock.calls[0]!;
      expect(createCall[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(createCall[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Create failed');
      vi.mocked(mockLinksRepository.create).mockRejectedValue(error);

      await expect(
        service.createLink({
          url: 'https://example.com',
          svgGraphic: '<svg/>',
        })
      ).rejects.toThrow('Create failed');
      expect(mockLogger.error).toHaveBeenCalledWith('createLink failed', error);
    });
  });

  describe('deleteLink', () => {
    it('should delete a link by ID', async () => {
      vi.mocked(mockLinksRepository.delete).mockResolvedValue(true);

      const result = await service.deleteLink(1);

      expect(result).toBe(true);
      expect(mockLinksRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should return false if link not found', async () => {
      vi.mocked(mockLinksRepository.delete).mockResolvedValue(false);

      const result = await service.deleteLink(999);

      expect(result).toBe(false);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Delete failed');
      vi.mocked(mockLinksRepository.delete).mockRejectedValue(error);

      await expect(service.deleteLink(1)).rejects.toThrow('Delete failed');
      expect(mockLogger.error).toHaveBeenCalledWith('deleteLink failed', error);
    });
  });
});
