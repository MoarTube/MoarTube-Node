import { describe, expect, it } from 'vitest';
import { ByteBudget } from '../../../src/utils/byte-budget.js';
describe('outgoing IPC byte budget', () => {
  it('bounds bytes until delivery completion and releases each reservation only once', () => {
    const budget = new ByteBudget(10);
    const first = budget.reserve(6)!;
    expect(budget.reserve(5)).toBeUndefined();
    const second = budget.reserve(4)!;
    first();
    first();
    expect(budget.reserve(7)).toBeUndefined();
    second();
    expect(budget.reserve(10)).toBeTypeOf('function');
  });
});
