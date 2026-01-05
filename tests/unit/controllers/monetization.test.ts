/**
 * MonetizationController Tests
 *
 * Tests for crypto wallet address management endpoints.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { MonetizationController } from '@controllers/monetization.js';

// Mock services
const mockMonetizationService: Record<string, ReturnType<typeof vi.fn>> = {
  getWalletAddresses: vi.fn(),
  createWalletAddress: vi.fn(),
  deleteWalletAddress: vi.fn(),
};

const mockCloudflareService: Record<string, ReturnType<typeof vi.fn>> = {
  purgeAllWatchPages: vi.fn(),
  purgeNodePage: vi.fn(),
};

describe('MonetizationController', () => {
  let controller: MonetizationController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: {
    status: Mock;
    send: Mock;
    headers: Mock;
    type: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new MonetizationController(
      mockMonetizationService as any,
      mockCloudflareService as any
    );

    mockRequest = {
      body: {},
      params: {},
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headers: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
    };
  });

  describe('constructor', () => {
    it('should create a MonetizationController instance', () => {
      expect(controller).toBeInstanceOf(MonetizationController);
    });
  });

  describe('getAllWalletAddresses', () => {
    it('should get all wallet addresses', async () => {
      const mockAddresses = [
        { id: 1, walletAddress: '0x123', chain: 'ETH', currency: 'USDC' },
        { id: 2, walletAddress: '0x456', chain: 'BNB', currency: 'BNB' },
      ];
      mockMonetizationService.getWalletAddresses.mockResolvedValue(mockAddresses);

      await controller.getAllWalletAddresses(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockMonetizationService.getWalletAddresses).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        cryptoWalletAddresses: mockAddresses,
      });
    });

    it('should return empty array when no addresses', async () => {
      mockMonetizationService.getWalletAddresses.mockResolvedValue([]);

      await controller.getAllWalletAddresses(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: false,
        cryptoWalletAddresses: [],
      });
    });

    it('should return error on service failure', async () => {
      mockMonetizationService.getWalletAddresses.mockRejectedValue(new Error('Database error'));

      await controller.getAllWalletAddresses(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('addWalletAddress', () => {
    it('should add a new wallet address for ETH', async () => {
      mockRequest.body = {
        walletAddress: '0xABC123',
        chain: 'ETH',
        currency: 'USDC',
      };

      const mockNewAddress = {
        id: 1,
        walletAddress: '0xABC123',
        chain: 'ETH',
        chainId: '0x1',
        currency: 'USDC',
      };
      mockMonetizationService.createWalletAddress.mockResolvedValue(mockNewAddress);
      mockCloudflareService.purgeAllWatchPages.mockResolvedValue(undefined);
      mockCloudflareService.purgeNodePage.mockResolvedValue(undefined);

      await controller.addWalletAddress(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockMonetizationService.createWalletAddress).toHaveBeenCalledWith({
        walletAddress: '0xABC123',
        chain: 'ETH',
        chainId: '0x1',
        currency: 'USDC',
      });
      expect(mockCloudflareService.purgeAllWatchPages).toHaveBeenCalled();
      expect(mockCloudflareService.purgeNodePage).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should add a new wallet address for BNB', async () => {
      mockRequest.body = {
        walletAddress: '0xDEF456',
        chain: 'BNB',
        currency: 'BNB',
      };

      const mockNewAddress = {
        id: 2,
        walletAddress: '0xDEF456',
        chain: 'BNB',
        chainId: '0x38',
        currency: 'BNB',
      };
      mockMonetizationService.createWalletAddress.mockResolvedValue(mockNewAddress);
      mockCloudflareService.purgeAllWatchPages.mockResolvedValue(undefined);
      mockCloudflareService.purgeNodePage.mockResolvedValue(undefined);

      await controller.addWalletAddress(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockMonetizationService.createWalletAddress).toHaveBeenCalledWith({
        walletAddress: '0xDEF456',
        chain: 'BNB',
        chainId: '0x38',
        currency: 'BNB',
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should handle unknown chain with empty chainId', async () => {
      mockRequest.body = {
        walletAddress: '0x789',
        chain: 'UNKNOWN',
        currency: 'TOKEN',
      };

      mockMonetizationService.createWalletAddress.mockResolvedValue({});
      mockCloudflareService.purgeAllWatchPages.mockResolvedValue(undefined);
      mockCloudflareService.purgeNodePage.mockResolvedValue(undefined);

      await controller.addWalletAddress(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockMonetizationService.createWalletAddress).toHaveBeenCalledWith({
        walletAddress: '0x789',
        chain: 'UNKNOWN',
        chainId: '',
        currency: 'TOKEN',
      });
    });

    it('should return error on service failure', async () => {
      mockRequest.body = {
        walletAddress: '0x123',
        chain: 'ETH',
        currency: 'USDC',
      };

      mockMonetizationService.createWalletAddress.mockRejectedValue(new Error('Database error'));

      await controller.addWalletAddress(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });

  describe('deleteWalletAddress', () => {
    it('should delete a wallet address', async () => {
      mockRequest.body = { cryptoWalletAddressId: 1 };

      mockMonetizationService.deleteWalletAddress.mockResolvedValue(true);
      mockCloudflareService.purgeAllWatchPages.mockResolvedValue(undefined);
      mockCloudflareService.purgeNodePage.mockResolvedValue(undefined);

      await controller.deleteWalletAddress(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockMonetizationService.deleteWalletAddress).toHaveBeenCalledWith(1);
      expect(mockCloudflareService.purgeAllWatchPages).toHaveBeenCalled();
      expect(mockCloudflareService.purgeNodePage).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 when wallet address not found', async () => {
      mockRequest.body = { cryptoWalletAddressId: 999 };

      mockMonetizationService.deleteWalletAddress.mockResolvedValue(false);

      await controller.deleteWalletAddress(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'wallet address not found',
      });
    });

    it('should return error on service failure', async () => {
      mockRequest.body = { cryptoWalletAddressId: 1 };

      mockMonetizationService.deleteWalletAddress.mockRejectedValue(new Error('Database error'));

      await controller.deleteWalletAddress(mockRequest as FastifyRequest, mockReply as unknown as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        isError: true,
        message: 'error communicating with the MoarTube node',
      });
    });
  });
});
