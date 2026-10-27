import { describe, expect, it } from 'vitest';
import { pageOptions } from '@/utils/pagination.js';
describe('bounded list queries', () => {
  it('caps requested pages and rejects invalid offsets rather than disabling pagination', () => {
    expect(pageOptions({ limit: '100000000', offset: '-1' })).toEqual({ limit: 101, offset: 0 });
    expect(pageOptions({ limit: '25', offset: '100' })).toEqual({ limit: 25, offset: 100 });
    expect(pageOptions({ limit: 'NaN', offset: 'Infinity' })).toEqual({ limit: 101, offset: 0 });
  });
});
