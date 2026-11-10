import { describe, it, expect } from 'vitest';
import {
  mediaHostname,
  validateCdnSettings,
  cdnDnsTarget,
  storageIdentity,
} from '@/utils/cdn-settings.js';
import { buildExternalVideosBaseUrl } from '@/config/urls.js';
import type { NodeSettings, StorageConfig } from '@/types/config.js';

const s3 = (overrides: Record<string, unknown> = {}): StorageConfig => ({
  storageMode: 's3provider',
  s3Config: {
    bucketName: 'externalvideos.example.com',
    s3ProviderClientConfig: {
      region: 'us-east-1',
      forcePathStyle: false,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      ...overrides,
    },
  },
});

describe('CDN naming contract', () => {
  it('validates final DNS labels, completed names and derived bucket limits', () => {
    expect(mediaHostname('example.' + 'a'.repeat(63))).toContain('a'.repeat(63));
    for (const host of [
      'example.' + 'a'.repeat(64),
      'example.com-',
      'a'.repeat(63) + '.' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(63),
    ])
      expect(() => mediaHostname(host)).toThrow();
    const address = 'a'.repeat(46) + '.com';
    expect(() => validateCdnSettings({ publicNodeAddress: address, storageConfig: s3() })).toThrow(
      '63-character'
    );
    const settings = { storageMode: 'filesystem' } as StorageConfig;
    expect(storageIdentity(settings)).toBe('filesystem');
    expect(storageIdentity({ storageMode: 's3provider' })).toBe('["aws-s3","aws",null]');
    expect(storageIdentity(s3())).toContain('externalvideos.example.com');
    expect(storageIdentity(s3({ endpoint: 'https://provider.example/' }))).toBe(
      storageIdentity(s3({ endpoint: 'https://provider.example' }))
    );
  });
  it('uses certificate-compatible HTTPS AWS path addressing when disabling CDN for dotted buckets', () => {
    const settings = {
      publicNodeAddress: 'example.com',
      storageConfig: s3(),
      isCloudflareCdnEnabled: true,
    } as NodeSettings;
    expect(buildExternalVideosBaseUrl(settings)).toBe('https://externalvideos.example.com');
    settings.isCloudflareCdnEnabled = false;
    expect(buildExternalVideosBaseUrl(settings)).toBe(
      'https://s3.us-east-1.amazonaws.com/externalvideos.example.com'
    );
  });
  it('keeps filesystem-backed CDN media on the validated Node URL', () => {
    expect(
      buildExternalVideosBaseUrl({
        publicNodeAddress: 'example.com',
        publicNodeProtocol: 'https',
        publicNodePort: 443,
        storageConfig: { storageMode: 'filesystem' },
        isCloudflareCdnEnabled: true,
      } as NodeSettings)
    ).toBe('https://example.com');
  });
  it.each([
    '127.0.0.1',
    '192.168.1.4',
    '::1',
    '[2001:db8::1]',
    '',
    'localhost',
    'https://example.com',
    'example.com:443',
  ])('rejects invalid CDN Node address %s', (address) => {
    expect(() => mediaHostname(address)).toThrow('domain name');
  });
  it.each(['example.com', 'example.co.uk'])('normalizes the selected zone root %s', (zone) => {
    expect(
      validateCdnSettings(
        {
          publicNodeAddress: zone.toUpperCase() + '.',
          storageConfig: { storageMode: 'filesystem' },
        },
        ' ' + zone.toUpperCase() + '. '
      )
    ).toBe('externalvideos.' + zone);
  });
  it.each(['node.example.com', 'deep.node.example.com', 'badexample.com', 'other.com'])(
    'rejects a public CDN address outside the exact zone root: %s',
    (address) => {
      for (const storage of [{ storageMode: 'filesystem' } as StorageConfig, s3()]) {
        if (storage.s3Config) storage.s3Config.bucketName = 'externalvideos.' + address;
        expect(() =>
          validateCdnSettings({ publicNodeAddress: address, storageConfig: storage }, 'example.com')
        ).toThrow('zone root exactly');
      }
    }
  );
  it('requires an exact S3 bucket match, while filesystem delivery needs no bucket', () => {
    expect(
      validateCdnSettings({ publicNodeAddress: 'example.com', storageConfig: s3() }, 'example.com')
    ).toBe('externalvideos.example.com');
    const storage = s3();
    storage.s3Config!.bucketName = 'ordinary-bucket';
    expect(() =>
      validateCdnSettings({ publicNodeAddress: 'example.com', storageConfig: storage })
    ).toThrow('externalvideos.example.com');
    expect(
      validateCdnSettings({
        publicNodeAddress: 'example.com',
        storageConfig: { storageMode: 'filesystem' },
      })
    ).toBe('externalvideos.example.com');
  });
  it.each([
    { endpoint: 'https://provider.example/base' },
    { endpoint: 'https://provider.example:9000' },
    { endpoint: 'http://provider.example' },
    { endpoint: 'https://provider.example?x=1' },
    { endpoint: 'https://provider.example', forcePathStyle: true },
  ])('rejects provider layouts that DNS cannot represent: %j', (provider) => {
    expect(() => cdnDnsTarget(s3(provider))).toThrow();
  });
  it('supports virtual-hosted custom providers and AWS targets', () => {
    expect(cdnDnsTarget({ storageMode: 'filesystem' })).toBeUndefined();
    expect(cdnDnsTarget(s3({ endpoint: 'https://provider.example' }))).toBe(
      'externalvideos.example.com.provider.example'
    );
    expect(cdnDnsTarget(s3())).toBe('externalvideos.example.com.s3.us-east-1.amazonaws.com');
  });
  it('keeps ordinary S3 bucket names usable with CDN disabled and uses HTTPS', () => {
    const storage = s3();
    storage.s3Config!.bucketName = 'ordinary-bucket';
    expect(
      buildExternalVideosBaseUrl({
        publicNodeAddress: '127.0.0.1',
        storageConfig: storage,
        isCloudflareCdnEnabled: false,
      } as NodeSettings)
    ).toBe('https://ordinary-bucket.s3.us-east-1.amazonaws.com');
  });
});
