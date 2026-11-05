import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:cluster', () => ({ default: { isPrimary: false } }));
import {
  primaryTunnelManager,
  requestTunnelOperation,
} from '@/services/cloudflare-tunnel-runtime.js';

const original = Object.getOwnPropertyDescriptor(process, 'send');
const send = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.defineProperty(process, 'send', { configurable: true, value: send });
});
afterEach(() => {
  vi.useRealTimers();
  if (original) Object.defineProperty(process, 'send', original);
  else Reflect.deleteProperty(process, 'send');
});

describe('worker tunnel IPC requests', () => {
  it('rejects correlated restore errors without leaking provider details or leaving a timer', async () => {
    send.mockImplementation((_message, callback) => callback(null));
    const pending = requestTunnelOperation('prepare_cdn_clear');
    const request = send.mock.calls[0]![0];
    const rejected = expect(pending).rejects.toThrow('Cloudflare Tunnel operation failed.');
    process.emit('message', {
      cmd: 'cloudflare_tunnel_response',
      requestId: request.requestId,
      tunnel: { mode: 'named', status: 'running', name: 'named' },
      error: 'private-key',
    });
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('never constructs a connector manager in an HTTP worker', () => {
    expect(() => primaryTunnelManager()).toThrow('Only the primary');
  });

  it('accepts only its correlated response and removes the listener afterward', async () => {
    const baseline = process.listenerCount('message');
    send.mockImplementation((_message, callback) => callback(null));
    const pending = requestTunnelOperation('snapshot');
    const request = send.mock.calls[0]![0];
    process.emit('message', {
      cmd: 'cloudflare_tunnel_response',
      requestId: 'someone-else',
      tunnel: {},
    });
    expect(process.listenerCount('message')).toBe(baseline + 1);
    const tunnel = { mode: 'quick', status: 'running', name: 'random' };
    process.emit('message', {
      cmd: 'cloudflare_tunnel_response',
      requestId: request.requestId,
      tunnel,
    });
    expect(await pending).toEqual(tunnel);
    expect(process.listenerCount('message')).toBe(baseline);
  });

  it('cleans up synchronous send failures instead of leaking listeners/timeouts', async () => {
    const baseline = process.listenerCount('message');
    send.mockImplementation(() => {
      throw new Error('channel closed');
    });
    await expect(requestTunnelOperation()).rejects.toThrow('unavailable');
    expect(process.listenerCount('message')).toBe(baseline);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out a lost response and removes its listener', async () => {
    const baseline = process.listenerCount('message');
    send.mockImplementation((_message, callback) => callback(null));
    const failed = expect(requestTunnelOperation()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(120_000);
    await failed;
    expect(process.listenerCount('message')).toBe(baseline);
  });
  it('bounds read-only snapshots so canonical URL rendering can fall back promptly', async () => {
    const baseline = process.listenerCount('message');
    send.mockImplementation((_message, callback) => callback(null));
    const failed = expect(requestTunnelOperation('snapshot')).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(2000);
    await failed;
    expect(process.listenerCount('message')).toBe(baseline);
    expect(vi.getTimerCount()).toBe(0);
  });
});
