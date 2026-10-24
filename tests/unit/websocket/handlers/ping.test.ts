import { describe, expect, it, vi } from 'vitest';
import { PingHandler } from '@websocket/handlers/ping.js';
import type { HandlerContext } from '@websocket/handlers/base.js';
import type { ExtendedWebSocket } from '@/types/index.js';

describe('PingHandler', () => {
  it('recognizes pings and sends pong only to the requesting client', () => {
    const handler = new PingHandler();
    const client = {} as ExtendedWebSocket;
    const context = { sendTo: vi.fn(), broadcast: vi.fn() } as unknown as HandlerContext;
    expect(handler.canHandle({ eventName: 'ping' })).toBe(true);
    expect(handler.canHandle({ eventName: 'echo' })).toBe(false);
    handler.handle(client, { eventName: 'ping' }, context);
    expect(context.sendTo).toHaveBeenCalledExactlyOnceWith(client, { eventName: 'pong' });
    expect(context.broadcast).not.toHaveBeenCalled();
  });
});
