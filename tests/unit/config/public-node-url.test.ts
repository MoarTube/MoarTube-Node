import { expect, it } from 'vitest';
import { networkExternalBodySchema } from '@/validators/schemas/settings.js';
import { buildNodeBaseUrl } from '@/config/urls.js';
import type { NodeSettings } from '@/types/index.js';

it.each([
  'https://new.example',
  'host/path',
  'host:443',
  'user@host',
  'host?x',
  'host#x',
  ' ',
  'host\n#EXT-X-ENDLIST',
  '999.1.1.1',
  '[127.0.0.1]',
  'a..test',
])('rejects malformed public address %s before a settings mutation', (publicNodeAddress) => {
  expect(
    networkExternalBodySchema.safeParse({
      publicNodeProtocol: 'https',
      publicNodeAddress,
      publicNodePort: '443',
    }).success
  ).toBe(false);
});

it.each([
  [' example.com ', 'https', 443, 'https://example.com'],
  ['127.0.0.1', 'http', 8080, 'http://127.0.0.1:8080'],
  ['2001:db8::1', 'https', 443, 'https://[2001:db8::1]'],
  ['[2001:db8::1]', 'http', 8080, 'http://[2001:db8::1]:8080'],
])(
  'validates and formats %s',
  (publicNodeAddress, publicNodeProtocol, publicNodePort, expected) => {
    const parsed = networkExternalBodySchema.parse({
      publicNodeProtocol,
      publicNodeAddress,
      publicNodePort,
    });
    expect(buildNodeBaseUrl(parsed as NodeSettings)).toBe(expected);
    expect(new URL(expected).hostname).toBeTruthy();
  }
);
