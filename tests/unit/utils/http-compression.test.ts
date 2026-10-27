import { describe, it, expect, vi } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { acceptsGzip, varyEncoding, compressTextResponse } from '@/utils/http-compression.js';
describe('HTTP compression negotiation', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['br', false],
    ['*', true],
    ['gzip', true],
    ['GZIP; q=0.5', true],
    ['*;q=1,gzip;q=0', false],
    ['gzip;q=2', false],
    ['gzip;q=NaN', false],
    ['gzip;q=-1', false],
    ['br;q=1, *; q=0', false],
  ])('negotiates %s', (value, expected) => expect(acceptsGzip(value)).toBe(expected));
  const makeReply = (headers: Record<string, unknown> = {}, statusCode = 200) => ({
    statusCode,
    getHeader: (key: string) => headers[key],
    hasHeader: (key: string) => headers[key] !== undefined,
    header: vi.fn((key, value) => {
      headers[key] = value;
    }),
    removeHeader: vi.fn((key) => {
      delete headers[key];
    }),
  });
  it('merges Vary without duplication', () => {
    for (const value of [undefined, 'Origin', 'Origin, accept-encoding']) {
      const headers = { Vary: value };
      const reply = makeReply(headers);
      varyEncoding(reply as any);
      expect(
        String(headers.Vary)
          .toLowerCase()
          .split(',')
          .filter((v) => v.trim() === 'accept-encoding')
      ).toHaveLength(1);
    }
  });
  it('compresses text and buffers and removes their stale length', async () => {
    for (const payload of ['x'.repeat(5000), Buffer.alloc(5000, 120)]) {
      const headers = { 'Content-Type': 'application/json', 'Content-Length': 5000 };
      const reply = makeReply(headers);
      const output = await compressTextResponse(
        { method: 'GET', headers: { 'accept-encoding': 'gzip' } } as any,
        reply as any,
        payload
      );
      expect(gunzipSync(output as Buffer).toString()).toBe(payload.toString());
      expect(reply.removeHeader).toHaveBeenCalledWith('Content-Length');
    }
  });
  it('keeps excluded responses intact', async () => {
    for (const [status, method, headers, payload] of [
      [304, 'GET', {}, 'x'.repeat(2000)],
      [200, 'HEAD', {}, 'x'.repeat(2000)],
      [200, 'GET', { 'Content-Encoding': 'br' }, 'x'.repeat(2000)],
      [200, 'GET', { 'Content-Type': 'image/jpeg' }, 'x'.repeat(2000)],
      [200, 'GET', { 'Content-Type': 'text/html' }, {}],
      [200, 'GET', { 'Content-Type': 'text/html' }, 'small'],
      [200, 'GET', { 'Content-Type': 'text/html' }, 'x'.repeat(2000)],
    ] as const) {
      const reply = makeReply({ ...headers }, status);
      expect(
        await compressTextResponse({ method, headers: {} } as any, reply as any, payload)
      ).toBe(payload);
    }
  });
});
