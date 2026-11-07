import { migrateNodeLinksSettings } from '@/config/node-links.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Config } from '@/config/index.js';
import { validateNodeSettings } from '@/config/schema.js';

const base = {
  nodeListeningPort: 9090,
  username: 'user',
  password: 'password',
  nodeName: 'Keep name',
  nodeBulletin: ['Keep bulletin'],
  databaseConfig: { databaseDialect: 'sqlite' },
  storageConfig: { storageMode: 'filesystem' },
};
const links = [
  { url: 'https://example.com/articles?category=art', description: 'Articles and art' },
  { url: 'http://localhost:9090', description: 'Local resource' },
];
function fixture(raw: object) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-node-links-migration-'));
  const file = path.join(directory, '_node_settings.json');
  fs.writeFileSync(file, JSON.stringify(raw));
  const config = Object.assign(Object.create(Config.prototype), {
    _paths: { nodeSettingsPath: file },
    _nodeSettings: validateNodeSettings(base),
  }) as Config;
  return { file, config, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
describe('node links saved-settings migration', () => {
  it('preserves ordered URL/description pairs and unrelated settings, and rewrites only the canonical key', () => {
    const f = fixture({ ...base, nodeNeighbors: links });
    try {
      f.config.reloadNodeSettings(true);
      expect(f.config.nodeSettings.nodeLinks).toEqual(links);
      const saved = JSON.parse(fs.readFileSync(f.file, 'utf8'));
      expect(saved.nodeLinks).toEqual(links);
      expect(saved).not.toHaveProperty('nodeNeighbors');
      expect(saved.nodeName).toBe(base.nodeName);
      expect(saved.nodeBulletin).toEqual(base.nodeBulletin);
      f.config.reloadNodeSettings(true);
      expect(f.config.nodeSettings.nodeLinks).toEqual(links);
      f.config.updateNodeSettings({ nodeLinks: [] });
      f.config.reloadNodeSettings(true);
      expect(f.config.nodeSettings.nodeLinks).toEqual([]);
    } finally {
      f.close();
    }
  });
  it.each([{ nodeLinks: [] }, { nodeLinks: [links[1]] }])(
    'gives canonical entries precedence even when explicitly cleared',
    ({ nodeLinks }) => {
      const f = fixture({ ...base, nodeNeighbors: links, nodeLinks });
      try {
        f.config.reloadNodeSettings(true);
        expect(f.config.nodeSettings.nodeLinks).toEqual(nodeLinks);
        expect(JSON.parse(fs.readFileSync(f.file, 'utf8'))).not.toHaveProperty('nodeNeighbors');
      } finally {
        f.close();
      }
    }
  );
  it('migrates while patching another setting under the existing writer lock', () => {
    const f = fixture({ ...base, nodeNeighbors: links });
    try {
      f.config.updateNodeSettings({ nodeHeadline: 'Updated headline' });
      const saved = JSON.parse(fs.readFileSync(f.file, 'utf8'));
      expect(saved.nodeLinks).toEqual(links);
      expect(saved.nodeHeadline).toBe('Updated headline');
      expect(saved).not.toHaveProperty('nodeNeighbors');
    } finally {
      f.close();
    }
  });
  it('rejects invalid legacy URLs without rewriting the original file', () => {
    const raw = {
      ...base,
      nodeNeighbors: [{ url: 'javascript:alert(1)', description: 'Invalid' }],
    };
    const f = fixture(raw);
    try {
      expect(() => f.config.reloadNodeSettings(true)).toThrow('Invalid node settings');
      expect(JSON.parse(fs.readFileSync(f.file, 'utf8'))).toEqual(raw);
    } finally {
      f.close();
    }
  });
  it('defaults missing entries and validates legacy input into canonical runtime settings', () => {
    expect(validateNodeSettings(base).nodeLinks).toEqual([]);
    expect(validateNodeSettings({ ...base, nodeNeighbors: links }).nodeLinks).toEqual(links);
  });
});

it.each([null, undefined, 42, 'text', []])(
  'leaves non-settings input %j for schema validation',
  (value) => {
    expect(migrateNodeLinksSettings(value)).toBe(value);
  }
);
