import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLinksRepository } from '@database/repositories/links/index.js';
import { createMonetizationRepository } from '@database/repositories/monetization/index.js';
import { openTestDatabase } from './helpers.js';

describe('SQLite links and wallets (real SQL)', () => {
  let database: ReturnType<typeof openTestDatabase>;
  beforeEach(() => {
    database = openTestDatabase();
  });
  afterEach(() => database?.close());

  it('persists links, orders/limits results, updates, checks existence, and deletes', async () => {
    const repository = createLinksRepository('sqlite', database.db);
    const data = { url: "https://example.test/?q='你好", svg_graphic: '<svg/>', timestamp: 100 };
    expect(await repository.getCount()).toBe(0);
    expect(await repository.findById(-1)).toBeNull();
    expect(await repository.findByUrl('missing')).toBeNull();
    expect(await repository.existsByUrl(data.url)).toBe(false);
    expect(await repository.createMany([])).toEqual([]);
    const row = await repository.create(data);
    expect(row).toMatchObject(data);
    expect(await repository.findById(row.link_id)).toEqual(row);
    expect(await repository.findByUrl(data.url)).toEqual(row);
    expect(await repository.existsByUrl(data.url)).toBe(true);
    const [second] = await repository.createMany([{ ...data, url: 'second', timestamp: 200 }]);
    expect(await repository.findAll()).toEqual([second, row]);
    expect(await repository.findAll({})).toHaveLength(2);
    expect(await repository.findAll({ limit: 1 })).toEqual([second]);
    expect(await repository.update(row.link_id, { svg_graphic: '<svg>✓</svg>' })).toMatchObject({
      svg_graphic: '<svg>✓</svg>',
    });
    expect(await repository.update(-1, { url: 'missing' })).toBeNull();
    expect(await repository.delete(row.link_id)).toBe(true);
    expect(await repository.delete(row.link_id)).toBe(false);
    expect(await repository.deleteAll()).toBe(1);
    expect(await repository.getCount()).toBe(0);
    database.client.exec(
      'CREATE TRIGGER ignore_link BEFORE INSERT ON links BEGIN SELECT RAISE(IGNORE); END'
    );
    await expect(repository.create(data)).rejects.toThrow('Failed to create link record');
  });

  it('persists wallets and isolates chain filters and deletions', async () => {
    const repository = createMonetizationRepository('sqlite', database.db);
    const data = {
      wallet_address: 'address-a',
      chain: 'ethereum',
      chain_id: '1',
      currency: 'ETH',
      timestamp: 100,
    };
    expect(await repository.getCount()).toBe(0);
    expect(await repository.findById(-1)).toBeNull();
    expect(await repository.findByAddress('missing')).toBeNull();
    expect(await repository.exists(data.wallet_address)).toBe(false);
    expect(await repository.createMany([])).toEqual([]);
    const row = await repository.create(data);
    expect(row).toMatchObject(data);
    expect(await repository.findById(row.wallet_address_id)).toEqual(row);
    expect(await repository.findByAddress(data.wallet_address)).toEqual(row);
    expect(await repository.exists(data.wallet_address)).toBe(true);
    const rows = await repository.createMany([
      { ...data, wallet_address: 'address-b', timestamp: 200 },
      { ...data, wallet_address: 'address-c', chain: 'bitcoin', timestamp: 300 },
    ]);
    expect(await repository.findAll()).toEqual([rows[1], rows[0], row]);
    expect(await repository.findAll({})).toHaveLength(3);
    expect(await repository.findAll({ limit: 1 })).toEqual([rows[1]]);
    expect(await repository.findByChain('ethereum')).toEqual([rows[0], row]);
    expect(await repository.findByChain('ethereum', { limit: 1 })).toEqual([rows[0]]);
    expect(await repository.update(row.wallet_address_id, { currency: 'TEST' })).toMatchObject({
      currency: 'TEST',
    });
    expect(await repository.update(-1, { currency: 'TEST' })).toBeNull();
    expect(await repository.delete(row.wallet_address_id)).toBe(true);
    expect(await repository.delete(row.wallet_address_id)).toBe(false);
    expect(await repository.deleteByChain('ethereum')).toBe(1);
    expect(await repository.getCount()).toBe(1);
    expect(await repository.deleteAll()).toBe(1);
    database.client.exec(
      'CREATE TRIGGER ignore_wallet BEFORE INSERT ON cryptowalletaddresses BEGIN SELECT RAISE(IGNORE); END'
    );
    await expect(repository.create(data)).rejects.toThrow(
      'Failed to create crypto wallet address record'
    );
  });
});
