import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ secure: true, directory: '' }));
vi.mock('@config/index.js', () => ({
  getConfig: () => ({
    nodeSettings: { isSecure: state.secure },
    paths: { certificatesDirectoryPath: state.directory },
  }),
}));
import { nodeTlsOptions } from '@/utils/node-tls.js';

it('loads keys and sorted uploaded CA files, ignores unrelated files, and supports no CA', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moartube-tls-options-'));
  state.directory = directory;
  try {
    fs.writeFileSync(path.join(directory, 'private_key.pem'), 'key');
    fs.writeFileSync(path.join(directory, 'certificate.pem'), 'cert');
    expect(nodeTlsOptions()).toEqual({ key: Buffer.from('key'), cert: Buffer.from('cert') });
    for (const [name, value] of [
      ['ca_2.pem', 'two'],
      ['ca_1.pem', 'one'],
      ['other.pem', 'ignored'],
    ])
      fs.writeFileSync(path.join(directory, name!), value!);
    expect(nodeTlsOptions()).toEqual({
      key: Buffer.from('key'),
      cert: Buffer.from('cert'),
      ca: [Buffer.from('one'), Buffer.from('two')],
    });
    state.secure = false;
    expect(nodeTlsOptions()).toBeNull();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
