import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  nodeIcons: [] as { url: string; svgGraphic: string }[] | undefined,
}));
vi.mock('@/config/index.js', () => ({ getConfig: () => ({ nodeSettings: state }) }));
import { LinksService } from '@/services/links.js';
it('reads public icons from settings and honors replacements and clearing without a database', async () => {
  const service = new LinksService({ error: vi.fn() } as never);
  state.nodeIcons = [{ url: 'https://example.com', svgGraphic: '<svg/>' }];
  expect(await service.getAllLinks()).toEqual([
    { link_id: 1, url: 'https://example.com', svg_graphic: '<svg/>', timestamp: 0 },
  ]);
  state.nodeIcons = undefined;
  expect(await service.getAllLinks()).toEqual([]);
  state.nodeIcons = [];
  expect(await service.getAllLinks()).toEqual([]);
});
