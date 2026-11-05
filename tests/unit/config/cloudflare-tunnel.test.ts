import { describe, expect, it } from 'vitest';
import { NodeSettingsSchema } from '@/config/schema.js';
import {
  automaticCloudflareTunnelMode,
  cloudflareTunnelNameSchema,
  cloudflareTunnelToggleBodySchema,
  quickTunnelNameFromUrl,
} from '@/config/cloudflare-tunnel.js';

const legacy = {
  nodeListeningPort: 9090,
  username: 'hash',
  password: 'hash',
  databaseConfig: { databaseDialect: 'sqlite' },
  storageConfig: { storageMode: 'filesystem' },
};

describe('Cloudflare tunnel toggle contract', () => {
  it('defaults legacy settings to enabled and selects quick startup without inventing a name on read', () => {
    const settings = NodeSettingsSchema.parse(legacy);
    expect(settings.isCloudflareTunnelEnabled).toBe(true);
    expect(settings).not.toHaveProperty('cloudflareTunnelName');
    expect(automaticCloudflareTunnelMode(settings)).toBe('quick');
  });
  it.each([false, true])('disabled prevents either mode (CDN %s)', (cdn) => {
    for (const name of [undefined, '', 'random-label']) {
      const settings = NodeSettingsSchema.parse({
        ...legacy,
        isCloudflareTunnelEnabled: false,
        isCloudflareCdnEnabled: cdn,
        cloudflareTunnelName: name,
      });
      expect(settings.isCloudflareTunnelEnabled).toBe(false);
      expect(automaticCloudflareTunnelMode(settings)).toBe('none');
    }
  });
  it('quick creation does not depend on a name being present', () => {
    for (const name of [undefined, '', '   ', 'old-name']) {
      expect(
        automaticCloudflareTunnelMode({ isCloudflareCdnEnabled: false, cloudflareTunnelName: name })
      ).toBe('quick');
    }
  });
  it('selects named mode only with a configured name; invalid legacy CDN settings never fall back', () => {
    expect(
      automaticCloudflareTunnelMode({ isCloudflareCdnEnabled: true, cloudflareTunnelName: 'named' })
    ).toBe('named');
    expect(automaticCloudflareTunnelMode({ isCloudflareCdnEnabled: true })).toBe('none');
  });
  it('requires a real boolean toggle value', () => {
    expect(cloudflareTunnelToggleBodySchema.parse({ isEnabled: false })).toEqual({
      isEnabled: false,
    });
    for (const input of [{}, { isEnabled: 'false' }, { isEnabled: null }]) {
      expect(cloudflareTunnelToggleBodySchema.safeParse(input).success).toBe(false);
    }
  });
  it('normalizes names without assigning empty-name stop semantics', () => {
    expect(cloudflareTunnelNameSchema.parse('  My Tunnel  ')).toBe('My Tunnel');
    expect(cloudflareTunnelNameSchema.parse('   ')).toBe('');
    expect(
      NodeSettingsSchema.parse({ ...legacy, cloudflareTunnelName: '  random-label  ' })
        .cloudflareTunnelName
    ).toBe('random-label');
  });
  it.each(['https://example.com', 'a/b', 'a\\b', 'a\nb', 'a'.repeat(101)])(
    'rejects invalid names: %s',
    (name) => {
      expect(cloudflareTunnelNameSchema.safeParse(name).success).toBe(false);
    }
  );
  it('extracts the generated name for persistence', () => {
    const name = quickTunnelNameFromUrl('https://random-words-here.trycloudflare.com');
    expect(name).toBe('random-words-here');
    expect(cloudflareTunnelNameSchema.parse(name)).toBe(name);
  });
  it.each([
    'http://random.trycloudflare.com',
    'https://trycloudflare.com',
    'https://random.trycloudflare.com.evil.example',
    'https://random.trycloudflare.com/path',
    'https://user@random.trycloudflare.com',
    'https://random.trycloudflare.com?token=x',
  ])('rejects unrelated quick URLs: %s', (url) => {
    expect(() => quickTunnelNameFromUrl(url)).toThrow();
  });
});
