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
    purgeNodePage: vi.fn(),
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
      mockLinksService as any,
      mockCloudflareService as any
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
    mockCloudflareService.purgeNodePage.mockResolvedValue(undefined);
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

  describe('addLink', () => {
    it('should add a link', async () => {
      mockRequest.body = {
        url: 'https://twitter.com/newtest',
        svgGraphic: '<svg>twitter</svg>',
      };

      const createdLink = {
        id: 3,
        url: 'https://twitter.com/newtest',
        svgGraphic: '<svg>twitter</svg>',
      };
      mockLinksService.createLink.mockResolvedValue(createdLink);

      await controller.addLink(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockLinksService.createLink).toHaveBeenCalledWith({
        url: 'https://twitter.com/newtest',
        svgGraphic: '<svg>twitter</svg>',
      });
      expect(mockCloudflareService.purgeAllWatchPages).toHaveBeenCalled();
      expect(mockCloudflareService.purgeNodePage).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        link: createdLink,
      });
    });

    it('should return error on service failure', async () => {
      mockRequest.body = {
        url: 'https://invalid.com',
        svgGraphic: '<svg>test</svg>',
      };

      mockLinksService.createLink.mockRejectedValue(new Error('Database error'));

      await controller.addLink(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('deleteLink', () => {
    it('should delete a link', async () => {
      mockRequest.body = { linkId: 2 };
      mockLinksService.deleteLink.mockResolvedValue(true);

      await controller.deleteLink(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockLinksService.deleteLink).toHaveBeenCalledWith(2);
      expect(mockCloudflareService.purgeAllWatchPages).toHaveBeenCalled();
      expect(mockCloudflareService.purgeNodePage).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 when link not found', async () => {
      mockRequest.body = { linkId: 999 };
      mockLinksService.deleteLink.mockResolvedValue(false);

      await controller.deleteLink(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockLinksService.deleteLink).toHaveBeenCalledWith(999);
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'link not found',
      });
    });

    it('should return error on service failure', async () => {
      mockRequest.body = { linkId: 1 };
      mockLinksService.deleteLink.mockRejectedValue(new Error('Database error'));

      await controller.deleteLink(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
