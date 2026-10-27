import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

function api() {
  const context = vm.createContext({ URL, Date, WeakMap });
  vm.runInContext(readFileSync('public/javascript/memory-limits.js', 'utf8'), context);
  return context['MoarTubeMemory'] as {
    refreshImage(element: object | null, url: string, interval?: number, now?: number): boolean;
    pruneChildren(
      container: { children: unknown[]; firstElementChild: { remove(): void } },
      limit: number
    ): void;
  };
}
describe('browser memory policies', () => {
  it('uses cacheable image URLs and throttles per element', () => {
    const memory = api();
    const image = { src: '' };
    expect(memory.refreshImage(null, '/thumbnail.jpg')).toBe(false);
    expect(memory.refreshImage(image, '/thumbnail.jpg', 10000, 100)).toBe(true);
    expect(image.src).toBe('/thumbnail.jpg?v=100');
    expect(memory.refreshImage(image, '/thumbnail.jpg', 10000, 200)).toBe(false);
    expect(memory.refreshImage(image, '/thumbnail.jpg', 10000, 10100)).toBe(true);
  });
  it('keeps a bounded message window throughout a long chat', () => {
    const memory = api();
    const container = {
      children: [] as number[],
      get firstElementChild() {
        return {
          remove: () => {
            this.children.shift();
          },
        };
      },
    };
    for (let i = 0; i < 10000; i++) {
      container.children.push(i);
      memory.pruneChildren(container, 500);
    }
    expect(container.children).toHaveLength(500);
    expect(container.children[0]).toBe(9500);
  });
});
