import { describe, expect, it, vi } from 'vitest';
import { sendBounded } from '../../../src/utils/socket-budget.js';

describe('WebSocket outgoing byte budget', () => {
  it('sends to a ready consumer and closes a blocked consumer instead of growing its queue', () => {
    const socket = { readyState: 1, bufferedAmount: 0, send: vi.fn(), close: vi.fn() };
    expect(sendBounded(socket, 'hello')).toBe(true);
    expect(socket.send).toHaveBeenCalledWith('hello');
    socket.bufferedAmount = 1024 * 1024;
    expect(sendBounded(socket, 'hello')).toBe(false);
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledWith(1013, 'Slow consumer');
  });
});
