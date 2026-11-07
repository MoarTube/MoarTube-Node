/**
 * Unit tests for LinksController
 *
 * Tests social link management endpoints.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { LinksController } from '../../../src/controllers/links.js';

describe('LinksController', () => {
  // Mock services
  const mockLinksService: Record<string, ReturnType<typeof vi.fn>> = {
    getAllLinks: vi.fn(),
    createLink: vi.fn(),
    deleteLink: vi.fn(),
  };

  const mockCloudflareService: Record<string, ReturnType<typeof vi.fn>> = {
    purgeAllWatchPages: vi.fn(),
    purgeHomePage: vi.fn(),
  };

  let controller: LinksController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    type: Mock;
    header: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new LinksController(
      mockLinksService as never
    );

    mockRequest = {
      body: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };

    // Default mock implementations
    mockCloudflareService.purgeAllWatchPages.mockResolvedValue(undefined);
    mockCloudflareService.purgeHomePage.mockResolvedValue(undefined);
  });

  describe('constructor', () => {
    it('should create a LinksController instance', () => {
      expect(controller).toBeInstanceOf(LinksController);
    });
  });

  describe('getAllLinks', () => {
    it('should get all links', async () => {
      const mockLinks = [
        { id: 1, url: 'https://twitter.com/test', svgGraphic: '<svg>...</svg>' },
        { id: 2, url: 'https://github.com/test', svgGraphic: '<svg>...</svg>' },
      ];
      mockLinksService.getAllLinks.mockResolvedValue(mockLinks);

      await controller.getAllLinks(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockLinksService.getAllLinks).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        links: mockLinks,
      });
    });

    it('should return empty array when no links', async () => {
      mockLinksService.getAllLinks.mockResolvedValue([]);

      await controller.getAllLinks(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        links: [],
      });
    });

    it('should return error on service failure', async () => {
      mockLinksService.getAllLinks.mockRejectedValue(new Error('Database error'));

      await controller.getAllLinks(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

});
