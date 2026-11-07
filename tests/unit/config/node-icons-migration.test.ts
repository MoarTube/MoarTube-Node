import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { Config } from '@/config/index.js';
import { validateNodeSettings } from '@/config/schema.js';
it('imports legacy icons once, preserves other settings and never restores cleared icons', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-icons-'));
  const file = path.join(directory, '_node_settings.json');
  const raw = { nodeListeningPort: 9090, databaseConfig: { databaseDialect: 'sqlite' }, storageConfig: { storageMode: 'filesystem' }, username: 'user', password: 'password', nodeLinks: [{ url: 'https://example.com', description: 'Keep' }], nodeBulletin: ['Keep bulletin'] };
  fs.writeFileSync(file, JSON.stringify(raw));
  const config = Object.assign(Object.create(Config.prototype), { _paths: { nodeSettingsPath: file }, _nodeSettings: validateNodeSettings(raw) }) as Config;
  const icons = [{ url: 'https://example.com', svgGraphic: '<svg/>' }];
  try {
    config.initializeNodeIcons(icons);
    config.reloadNodeSettings(true);
    expect(config.nodeSettings.nodeIcons).toEqual(icons);
    expect(config.nodeSettings.nodeLinks).toEqual(raw.nodeLinks);
    expect(config.nodeSettings.nodeBulletin).toEqual(raw.nodeBulletin);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).nodeIcons).toEqual(icons);
    config.updateNodeSettings({ nodeIcons: [] });
    config.initializeNodeIcons(icons);
    config.reloadNodeSettings(true);
    expect(config.nodeSettings.nodeIcons).toEqual([]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
