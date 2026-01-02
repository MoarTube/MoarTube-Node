/**
 * Monetization Service Tests
 *
 * Tests for the MonetizationService class that handles crypto wallet address CRUD operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonetizationService } from '@/services/monetization.js';
import type { Logger } from '@/utils/logger.js';
import type { MonetizationRepository } from '@/database/repositories/index.js';
import type { DrizzleCryptoWalletAddress } from '@/database/schemas/sqlite/index.js';

describe('MonetizationService', () => {
  let service: MonetizationService;
  let mockLogger: Logger;
  let mockMonetizationRepository: MonetizationRepository;

  const mockWallet: DrizzleCryptoWalletAddress = {
    id: 1,
    wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
    chain: 'Ethereum',
    currency: 'ETH',
    chain_id: '1',
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

    mockMonetizationRepository = {
      findAll: vi.fn(),
      findById: vi.fn(),
      findByChain: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getCount: vi.fn(),
    } as unknown as MonetizationRepository;

    service = new MonetizationService(mockLogger, mockMonetizationRepository);
  });

  describe('constructor', () => {
    it('should create a MonetizationService instance', () => {
      expect(service).toBeInstanceOf(MonetizationService);
    });
  });

  describe('getWalletAddresses', () => {
    it('should return all wallet addresses', async () => {
      const mockWallets: DrizzleCryptoWalletAddress[] = [
        mockWallet,
        { ...mockWallet, id: 2, chain: 'BSC', currency: 'BNB', chain_id: '56' },
      ];
      vi.mocked(mockMonetizationRepository.findAll).mockResolvedValue(mockWallets);

      const result = await service.getWalletAddresses();

      expect(result).toEqual(mockWallets);
      expect(result).toHaveLength(2);
      expect(mockMonetizationRepository.findAll).toHaveBeenCalled();
    });

    it('should return empty array when no wallets exist', async () => {
      vi.mocked(mockMonetizationRepository.findAll).mockResolvedValue([]);

      const result = await service.getWalletAddresses();

      expect(result).toEqual([]);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Database error');
      vi.mocked(mockMonetizationRepository.findAll).mockRejectedValue(error);

      await expect(service.getWalletAddresses()).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith('getWalletAddresses failed', error);
    });
  });

  describe('getWalletAddress', () => {
    it('should return a wallet by ID', async () => {
      vi.mocked(mockMonetizationRepository.findById).mockResolvedValue(mockWallet);

      const result = await service.getWalletAddress(1);

      expect(result).toEqual(mockWallet);
      expect(mockMonetizationRepository.findById).toHaveBeenCalledWith(1);
    });

    it('should return null if wallet not found', async () => {
      vi.mocked(mockMonetizationRepository.findById).mockResolvedValue(null);

      const result = await service.getWalletAddress(999);

      expect(result).toBeNull();
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Database error');
      vi.mocked(mockMonetizationRepository.findById).mockRejectedValue(error);

      await expect(service.getWalletAddress(1)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith('getWalletAddress failed', error);
    });
  });

  describe('getWalletAddressesByChain', () => {
    it('should return wallets for a specific chain', async () => {
      const ethWallets = [mockWallet];
      vi.mocked(mockMonetizationRepository.findByChain).mockResolvedValue(ethWallets);

      const result = await service.getWalletAddressesByChain('Ethereum');

      expect(result).toEqual(ethWallets);
      expect(mockMonetizationRepository.findByChain).toHaveBeenCalledWith('Ethereum');
    });

    it('should return empty array if no wallets for chain', async () => {
      vi.mocked(mockMonetizationRepository.findByChain).mockResolvedValue([]);

      const result = await service.getWalletAddressesByChain('Polygon');

      expect(result).toEqual([]);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Database error');
      vi.mocked(mockMonetizationRepository.findByChain).mockRejectedValue(error);

      await expect(service.getWalletAddressesByChain('Ethereum')).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith('getWalletAddressesByChain failed', error);
    });
  });

  describe('createWalletAddress', () => {
    it('should create a new wallet address', async () => {
      vi.mocked(mockMonetizationRepository.create).mockResolvedValue(mockWallet);

      const result = await service.createWalletAddress({
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chain: 'Ethereum',
        currency: 'ETH',
        chainId: '1',
      });

      expect(result).toEqual(mockWallet);
      expect(mockMonetizationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
          chain: 'Ethereum',
          currency: 'ETH',
          chain_id: '1',
        })
      );
    });

    it('should set timestamp on new wallet', async () => {
      vi.mocked(mockMonetizationRepository.create).mockImplementation(async (data) => ({
        id: 1,
        wallet_address: data.wallet_address,
        chain: data.chain,
        currency: data.currency,
        chain_id: data.chain_id,
        timestamp: data.timestamp,
      }));

      const beforeTime = Date.now();
      await service.createWalletAddress({
        walletAddress: '0xtest',
        chain: 'Test',
        currency: 'TST',
        chainId: '999',
      });
      const afterTime = Date.now();

      const createCall = vi.mocked(mockMonetizationRepository.create).mock.calls[0]!;
      expect(createCall[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(createCall[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Create failed');
      vi.mocked(mockMonetizationRepository.create).mockRejectedValue(error);

      await expect(
        service.createWalletAddress({
          walletAddress: '0xtest',
          chain: 'Test',
          currency: 'TST',
          chainId: '999',
        })
      ).rejects.toThrow('Create failed');
      expect(mockLogger.error).toHaveBeenCalledWith('createWalletAddress failed', error);
    });
  });

  describe('updateWalletAddress', () => {
    it('should update wallet address field', async () => {
      const updatedWallet = { ...mockWallet, wallet_address: '0xnewaddress' };
      vi.mocked(mockMonetizationRepository.update).mockResolvedValue(updatedWallet);

      const result = await service.updateWalletAddress(1, {
        walletAddress: '0xnewaddress',
      });

      expect(result).toEqual(updatedWallet);
      expect(mockMonetizationRepository.update).toHaveBeenCalledWith(1, {
        wallet_address: '0xnewaddress',
      });
    });

    it('should update chain field', async () => {
      const updatedWallet = { ...mockWallet, chain: 'Polygon' };
      vi.mocked(mockMonetizationRepository.update).mockResolvedValue(updatedWallet);

      const result = await service.updateWalletAddress(1, { chain: 'Polygon' });

      expect(result?.chain).toBe('Polygon');
      expect(mockMonetizationRepository.update).toHaveBeenCalledWith(1, { chain: 'Polygon' });
    });

    it('should update currency field', async () => {
      const updatedWallet = { ...mockWallet, currency: 'MATIC' };
      vi.mocked(mockMonetizationRepository.update).mockResolvedValue(updatedWallet);

      const result = await service.updateWalletAddress(1, { currency: 'MATIC' });

      expect(result?.currency).toBe('MATIC');
      expect(mockMonetizationRepository.update).toHaveBeenCalledWith(1, { currency: 'MATIC' });
    });

    it('should update chainId field', async () => {
      const updatedWallet = { ...mockWallet, chain_id: '137' };
      vi.mocked(mockMonetizationRepository.update).mockResolvedValue(updatedWallet);

      const result = await service.updateWalletAddress(1, { chainId: '137' });

      expect(result?.chain_id).toBe('137');
      expect(mockMonetizationRepository.update).toHaveBeenCalledWith(1, { chain_id: '137' });
    });

    it('should update multiple fields', async () => {
      const updatedWallet = { ...mockWallet, chain: 'Polygon', currency: 'MATIC', chain_id: '137' };
      vi.mocked(mockMonetizationRepository.update).mockResolvedValue(updatedWallet);

      const result = await service.updateWalletAddress(1, {
        chain: 'Polygon',
        currency: 'MATIC',
        chainId: '137',
      });

      expect(result).toEqual(updatedWallet);
      expect(mockMonetizationRepository.update).toHaveBeenCalledWith(1, {
        chain: 'Polygon',
        currency: 'MATIC',
        chain_id: '137',
      });
    });

    it('should return null if wallet not found', async () => {
      vi.mocked(mockMonetizationRepository.update).mockResolvedValue(null);

      const result = await service.updateWalletAddress(999, { chain: 'Test' });

      expect(result).toBeNull();
    });

    it('should handle empty update data', async () => {
      const updatedWallet = mockWallet;
      vi.mocked(mockMonetizationRepository.update).mockResolvedValue(updatedWallet);

      await service.updateWalletAddress(1, {});

      expect(mockMonetizationRepository.update).toHaveBeenCalledWith(1, {});
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Update failed');
      vi.mocked(mockMonetizationRepository.update).mockRejectedValue(error);

      await expect(service.updateWalletAddress(1, { chain: 'Test' })).rejects.toThrow(
        'Update failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('updateWalletAddress failed', error);
    });
  });

  describe('deleteWalletAddress', () => {
    it('should delete a wallet by ID', async () => {
      vi.mocked(mockMonetizationRepository.delete).mockResolvedValue(true);

      const result = await service.deleteWalletAddress(1);

      expect(result).toBe(true);
      expect(mockMonetizationRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should return false if wallet not found', async () => {
      vi.mocked(mockMonetizationRepository.delete).mockResolvedValue(false);

      const result = await service.deleteWalletAddress(999);

      expect(result).toBe(false);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Delete failed');
      vi.mocked(mockMonetizationRepository.delete).mockRejectedValue(error);

      await expect(service.deleteWalletAddress(1)).rejects.toThrow('Delete failed');
      expect(mockLogger.error).toHaveBeenCalledWith('deleteWalletAddress failed', error);
    });
  });

  describe('countWalletAddresses', () => {
    it('should return total wallet count', async () => {
      vi.mocked(mockMonetizationRepository.getCount).mockResolvedValue(5);

      const result = await service.countWalletAddresses();

      expect(result).toBe(5);
      expect(mockMonetizationRepository.getCount).toHaveBeenCalled();
    });

    it('should return 0 when no wallets exist', async () => {
      vi.mocked(mockMonetizationRepository.getCount).mockResolvedValue(0);

      const result = await service.countWalletAddresses();

      expect(result).toBe(0);
    });

    it('should log and rethrow errors', async () => {
      const error = new Error('Count failed');
      vi.mocked(mockMonetizationRepository.getCount).mockRejectedValue(error);

      await expect(service.countWalletAddresses()).rejects.toThrow('Count failed');
      expect(mockLogger.error).toHaveBeenCalledWith('countWalletAddresses failed', error);
    });
  });
});
