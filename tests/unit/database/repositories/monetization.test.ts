/**
 * Unit tests for database/repositories/monetization.ts
 *
 * Tests the MonetizationRepository interface implementations for crypto wallet address CRUD operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the schema imports first
vi.mock('@database/schemas/sqlite/monetization.js', () => ({
  cryptoWalletAddresses: {
    name: 'cryptowalletaddresses',
    wallet_address_id: { name: 'wallet_address_id' },
    wallet_address: { name: 'wallet_address' },
    chain: { name: 'chain' },
    chain_id: { name: 'chain_id' },
    currency: { name: 'currency' },
    timestamp: { name: 'timestamp' },
  },
}));

vi.mock('@database/schemas/postgres/monetization.js', () => ({
  cryptoWalletAddresses: {
    name: 'cryptowalletaddresses',
    wallet_address_id: { name: 'wallet_address_id' },
    wallet_address: { name: 'wallet_address' },
    chain: { name: 'chain' },
    chain_id: { name: 'chain_id' },
    currency: { name: 'currency' },
    timestamp: { name: 'timestamp' },
  },
}));

import { createMonetizationRepository, type IMonetizationRepository } from '@database/repositories/monetization/index.js';

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ type: 'eq', field, value })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
  count: vi.fn(() => ({ type: 'count' })),
}));

describe('database/repositories/monetization.ts', () => {
  let mockDb: any;
  let sqliteRepository: IMonetizationRepository<any, any>;
  let postgresRepository: IMonetizationRepository<any, any>;

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

    // Create repositories using factory function
    sqliteRepository = createMonetizationRepository('sqlite', mockDb);
    postgresRepository = createMonetizationRepository('postgres', mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('factory function', () => {
    it('should create SQLite repository', () => {
      expect(sqliteRepository).toBeDefined();
      expect(typeof sqliteRepository.findById).toBe('function');
    });

    it('should create Postgres repository', () => {
      expect(postgresRepository).toBeDefined();
      expect(typeof postgresRepository.findById).toBe('function');
    });
  });

  describe('findById', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find wallet by id', async () => {
          const mockWallet = { wallet_address_id: 1, wallet_address: '0x123' };
          mockDb.limit.mockResolvedValue([mockWallet]);

          const result = await repository().findById(1);

          expect(result).toEqual(mockWallet);
        });

        it('should return null when not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findById(999);

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('findAll', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should return all wallets without limit', async () => {
          const mockWallets = [{ wallet_address_id: 1 }];
          mockDb.orderBy.mockResolvedValue(mockWallets);

          const result = await repository().findAll();

          expect(result).toEqual(mockWallets);
        });

        it('should apply limit when specified', async () => {
          mockDb.limit.mockResolvedValue([]);

          await repository().findAll({ limit: 10 });

          expect(mockDb.limit).toHaveBeenCalledWith(10);
        });
      });
    });
  });

  describe('findByChain', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find wallets by chain with default limit', async () => {
          const mockWallets = [{ chain: 'ethereum' }];
          mockDb.limit.mockResolvedValue(mockWallets);

          const result = await repository().findByChain('ethereum');

          expect(mockDb.limit).toHaveBeenCalledWith(20); // default limit
          expect(result).toEqual(mockWallets);
        });

        it('should apply custom limit', async () => {
          mockDb.limit.mockResolvedValue([]);

          await repository().findByChain('bitcoin', { limit: 50 });

          expect(mockDb.limit).toHaveBeenCalledWith(50);
        });
      });
    });
  });

  describe('findByAddress', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should find wallet by address', async () => {
          const mockWallet = { wallet_address: '0xabc' };
          mockDb.limit.mockResolvedValue([mockWallet]);

          const result = await repository().findByAddress('0xabc');

          expect(result).toEqual(mockWallet);
        });

        it('should return null when address not found', async () => {
          mockDb.limit.mockResolvedValue([]);

          const result = await repository().findByAddress('0xmissing');

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('getCount', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should return count of wallets', async () => {
          mockDb.from.mockResolvedValue([{ count: 10 }]);

          const result = await repository().getCount();

          expect(result).toBe(10);
        });

        it('should return 0 when no wallets', async () => {
          mockDb.from.mockResolvedValue([{}]);

          const result = await repository().getCount();

          expect(result).toBe(0);
        });
      });
    });
  });

  describe('create', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should create a wallet record', async () => {
          const walletData = { wallet_address: '0xnew', chain: 'eth', chain_id: '1', currency: 'ETH', timestamp: 1234567890 };
          const created = { wallet_address_id: 1, ...walletData };
          mockDb.returning.mockResolvedValue([created]);

          const result = await repository().create(walletData);

          expect(result).toEqual(created);
        });

        it('should throw error when insert fails', async () => {
          mockDb.returning.mockResolvedValue([]);

          await expect(repository().create({ wallet_address: 'fail', chain: 'eth', chain_id: '1', currency: 'ETH', timestamp: 1234567890 })).rejects.toThrow(
            'Failed to create crypto wallet address record'
          );
        });
      });
    });
  });

  describe('update', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should update wallet by id', async () => {
          const updated = { wallet_address_id: 1, chain: 'polygon' };
          mockDb.returning.mockResolvedValue([updated]);

          const result = await repository().update(1, { chain: 'polygon' });

          expect(result).toEqual(updated);
        });

        it('should return null when wallet not found', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().update(999, { chain: 'new' });

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('delete', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should delete wallet by id', async () => {
          mockDb.returning.mockResolvedValue([{ wallet_address_id: 1 }]);

          const result = await repository().delete(1);

          expect(result).toBe(true);
        });

        it('should return false when wallet not found', async () => {
          mockDb.returning.mockResolvedValue([]);

          const result = await repository().delete(999);

          expect(result).toBe(false);
        });
      });
    });
  });

  describe('deleteByChain', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should delete all wallets for a chain', async () => {
          mockDb.returning.mockResolvedValue([{}, {}]);

          const result = await repository().deleteByChain('ethereum');

          expect(result).toBe(2);
        });
      });
    });
  });

  describe('exists', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should return true when address exists', async () => {
          mockDb.where.mockResolvedValue([{ count: 1 }]);

          const result = await repository().exists('0xexists');

          expect(result).toBe(true);
        });

        it('should return false when address does not exist', async () => {
          mockDb.where.mockResolvedValue([{ count: 0 }]);

          const result = await repository().exists('0xmissing');

          expect(result).toBe(false);
        });

        it('should return false when result is empty array', async () => {
          mockDb.where.mockResolvedValue([]);

          const result = await repository().exists('0xmissing');

          expect(result).toBe(false);
        });
      });
    });
  });

  describe('deleteAll', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should delete all wallets and return count', async () => {
          mockDb.returning.mockResolvedValue([{}, {}, {}, {}]);

          const result = await repository().deleteAll();

          expect(result).toBe(4);
        });
      });
    });
  });

  describe('createMany', () => {
    const testCases = [
      { name: 'SQLite', repository: () => sqliteRepository },
      { name: 'Postgres', repository: () => postgresRepository },
    ];

    testCases.forEach(({ name, repository }) => {
      describe(`${name} implementation`, () => {
        it('should create multiple wallets', async () => {
          const walletsData = [
            { wallet_address: '0xa', chain: 'eth', chain_id: '1', currency: 'ETH', timestamp: 1234567890 },
            { wallet_address: '0xb', chain: 'btc', chain_id: 'mainnet', currency: 'BTC', timestamp: 1234567891 }
          ];
          const created = [
            { wallet_address_id: 1, ...walletsData[0] },
            { wallet_address_id: 2, ...walletsData[1] },
          ];
          mockDb.returning.mockResolvedValue(created);

          const result = await repository().createMany(walletsData);

          expect(result).toEqual(created);
        });

        it('should return empty array when data is empty', async () => {
          const result = await repository().createMany([]);

          expect(mockDb.insert).not.toHaveBeenCalled();
          expect(result).toEqual([]);
        });
      });
    });
  });
});
