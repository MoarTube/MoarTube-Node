/**
 * Unit tests for database/repositories/monetization.ts
 *
 * Tests the MonetizationRepository class which provides CRUD operations
 * for crypto wallet address records.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MonetizationRepository } from '@database/repositories/monetization.js';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
  count: vi.fn(() => ({ type: 'count' })),
}));

describe('database/repositories/monetization.ts', () => {
  let mockDb: any;
  let mockWalletTable: any;
  let repository: MonetizationRepository;

  beforeEach(() => {
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    };

    mockWalletTable = {
      wallet_address_id: { name: 'wallet_address_id' },
      wallet_address: { name: 'wallet_address' },
      chain: { name: 'chain' },
      timestamp: { name: 'timestamp' },
    };

    repository = new MonetizationRepository(mockDb, mockWalletTable);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('should find wallet by id', async () => {
      const mockWallet = { wallet_address_id: 1, wallet_address: '0x123' };
      mockDb.limit.mockResolvedValue([mockWallet]);

      const result = await repository.findById(1);

      expect(result).toEqual(mockWallet);
    });

    it('should return null when not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all wallets without limit', async () => {
      const mockWallets = [{ wallet_address_id: 1 }];
      mockDb.orderBy.mockResolvedValue(mockWallets);

      const result = await repository.findAll();

      expect(result).toEqual(mockWallets);
    });

    it('should apply limit when specified', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findAll({ limit: 10 });

      expect(mockDb.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('findByChain', () => {
    it('should find wallets by chain with default limit', async () => {
      const mockWallets = [{ chain: 'ethereum' }];
      mockDb.limit.mockResolvedValue(mockWallets);

      const result = await repository.findByChain('ethereum');

      expect(mockDb.limit).toHaveBeenCalledWith(20); // default limit
      expect(result).toEqual(mockWallets);
    });

    it('should apply custom limit', async () => {
      mockDb.limit.mockResolvedValue([]);

      await repository.findByChain('bitcoin', { limit: 50 });

      expect(mockDb.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('findByAddress', () => {
    it('should find wallet by address', async () => {
      const mockWallet = { wallet_address: '0xabc' };
      mockDb.limit.mockResolvedValue([mockWallet]);

      const result = await repository.findByAddress('0xabc');

      expect(result).toEqual(mockWallet);
    });

    it('should return null when address not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await repository.findByAddress('0xmissing');

      expect(result).toBeNull();
    });
  });

  describe('getCount', () => {
    it('should return count of wallets', async () => {
      mockDb.from.mockResolvedValue([{ count: 10 }]);

      const result = await repository.getCount();

      expect(result).toBe(10);
    });

    it('should return 0 when no wallets', async () => {
      mockDb.from.mockResolvedValue([{}]);

      const result = await repository.getCount();

      expect(result).toBe(0);
    });
  });

  describe('create', () => {
    it('should create a wallet record', async () => {
      const walletData = { wallet_address: '0xnew', chain: 'eth' };
      const created = { wallet_address_id: 1, ...walletData };
      mockDb.returning.mockResolvedValue([created]);

      const result = await repository.create(walletData);

      expect(result).toEqual(created);
    });

    it('should throw error when insert fails', async () => {
      mockDb.returning.mockResolvedValue([]);

      await expect(repository.create({ wallet_address: 'fail' })).rejects.toThrow(
        'Failed to create crypto wallet address record'
      );
    });
  });

  describe('update', () => {
    it('should update wallet by id', async () => {
      const updated = { wallet_address_id: 1, chain: 'polygon' };
      mockDb.returning.mockResolvedValue([updated]);

      const result = await repository.update(1, { chain: 'polygon' });

      expect(result).toEqual(updated);
    });

    it('should return null when wallet not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.update(999, { chain: 'new' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete wallet by id', async () => {
      mockDb.returning.mockResolvedValue([{ wallet_address_id: 1 }]);

      const result = await repository.delete(1);

      expect(result).toBe(true);
    });

    it('should return false when wallet not found', async () => {
      mockDb.returning.mockResolvedValue([]);

      const result = await repository.delete(999);

      expect(result).toBe(false);
    });
  });

  describe('deleteByChain', () => {
    it('should delete all wallets for a chain', async () => {
      mockDb.returning.mockResolvedValue([{}, {}]);

      const result = await repository.deleteByChain('ethereum');

      expect(result).toBe(2);
    });
  });

  describe('exists', () => {
    it('should return true when address exists', async () => {
      mockDb.where.mockResolvedValue([{ count: 1 }]);

      const result = await repository.exists('0xexists');

      expect(result).toBe(true);
    });

    it('should return false when address does not exist', async () => {
      mockDb.where.mockResolvedValue([{ count: 0 }]);

      const result = await repository.exists('0xmissing');

      expect(result).toBe(false);
    });

    it('should return false when result is empty array', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await repository.exists('0xmissing');

      expect(result).toBe(false);
    });
  });

  describe('deleteAll', () => {
    it('should delete all wallets and return count', async () => {
      mockDb.returning.mockResolvedValue([{}, {}, {}, {}]);

      const result = await repository.deleteAll();

      expect(result).toBe(4);
    });
  });

  describe('createMany', () => {
    it('should create multiple wallets', async () => {
      const walletsData = [{ wallet_address: '0xa' }, { wallet_address: '0xb' }];
      const created = [
        { wallet_address_id: 1, ...walletsData[0] },
        { wallet_address_id: 2, ...walletsData[1] },
      ];
      mockDb.returning.mockResolvedValue(created);

      const result = await repository.createMany(walletsData);

      expect(result).toEqual(created);
    });

    it('should return empty array when data is empty', async () => {
      const result = await repository.createMany([]);

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
