import { describe, expect, it } from 'vitest';
import { parseBackup } from '../../../src/utils/backup-json.js';

async function events(json: string, chunkSize = 1) {
  const bytes = Buffer.from(json);
  async function* chunks() {
    for (let i = 0; i < bytes.length; i += chunkSize) yield bytes.subarray(i, i + chunkSize);
  }
  const result = [];
  for await (const event of parseBackup(chunks())) result.push(event);
  return result;
}
describe('incremental backup reader', () => {
  it('preserves Unicode, escapes and nested fields with rows before or after the table name', async () => {
    const row = { title: '🌻 "escape" \\', nested: { values: [null, true, -1.2e4] } };
    const backup = [
      { rows: [row], tableName: 'videos' },
      { tableName: 'comments', rows: [] },
    ];
    expect(await events(JSON.stringify(backup))).toEqual([
      { kind: 'row', table: 0, row },
      { kind: 'table', table: 0, name: 'videos' },
      { kind: 'table', table: 1, name: 'comments' },
    ]);
  });
  it.each([
    '[{"rows":[{}],"tableName":"videos"}',
    '[{"rows":[{},],"tableName":"videos"}]',
    '[{"rows":[],"rows":[],"tableName":"videos"}]',
    '[{"rows":[],"tableName":"videos"}] trailing',
  ])('rejects malformed or duplicate structure: %s', async (json) => {
    await expect(events(json, 7)).rejects.toThrow();
  });
  it('limits individual records rather than buffering the complete backup', async () => {
    await expect(
      events(
        JSON.stringify([{ rows: [{ data: 'x'.repeat(1024 * 1024 + 1) }], tableName: 'videos' }]),
        4096
      )
    ).rejects.toThrow('limit');
    const rows = Array.from({ length: 2000 }, (_, id) => ({ id, title: `video ${id}` }));
    expect((await events(JSON.stringify([{ rows, tableName: 'videos' }]), 65536)).length).toBe(
      2001
    );
  });
  it.each([
    '[{"tableName":"a","tableName":"b","rows":[]}]',
    '[{"rows":[{"title":"' + 'a'.repeat(1024 ** 2) + '"}],"tableName":"a"}]',
  ])('rejects duplicate keys and complete oversized tokens', async (text) => {
    async function* source() {
      yield Buffer.from(text);
    }
    await expect(
      (async () => {
        for await (const _ of parseBackup(source())) {
        }
      })()
    ).rejects.toThrow();
  });
  it('validates complete invalid tokens even when the input arrives in a single chunk', async () => {
    for (const text of [
      '0',
      '[{"rows":[],"tableName":"a","tableName":"b"}]',
      '[{"rows":[{"a":"' + 'x'.repeat(1024 ** 2) + '"}],"tableName":"a"}]',
    ]) {
      await expect(events(text, text.length)).rejects.toThrow();
    }
  });

  it('stops an unterminated huge token and rejects a non-string object key', async () => {
    await expect(events('[{"rows":[{"a":"' + 'x'.repeat(1024 ** 2 + 32768), 16384)).rejects.toThrow(
      'limit'
    );
    await expect(events('[{0:1}]')).rejects.toThrow('Invalid backup key');
  });
});
