import { StringDecoder } from 'node:string_decoder';

type BackupEvent =
  | { kind: 'row'; table: number; row: Record<string, unknown> }
  | { kind: 'table'; table: number; name: string };
const MAX_RECORD = 1024 * 1024;

/** Tokenize without retaining earlier chunks; strings are bounded to one record. */
async function* tokens(source: AsyncIterable<Buffer>): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  async function* decoded(): AsyncGenerator<string> {
    for await (const chunk of source) {
      yield decoder.write(chunk);
    }
    yield decoder.end();
  }
  for await (const text of decoded()) {
    buffer += text;
    let position = 0;
    while (position < buffer.length) {
      if (/\s/.test(buffer.charAt(position))) {
        position++;
        continue;
      }
      const start = position;
      const first = buffer.charAt(position);
      if ('{}[]:,'.includes(first)) {
        position++;
        yield first;
        continue;
      }
      if (first === '"') {
        let escaped = false,
          closed = false;
        for (position++; position < buffer.length; position++) {
          const character = buffer[position];
          if (!escaped && character === '"') {
            position++;
            closed = true;
            break;
          }
          if (!escaped && character === '\\') {
            escaped = true;
          } else {
            escaped = false;
          }
        }
        if (!closed) {
          position = start;
          break;
        }
      } else {
        while (position < buffer.length && !/[\s{}[\]:,]/.test(buffer.charAt(position))) {
          position++;
        }
        if (position === buffer.length) {
          position = start;
          break;
        }
      }
      const token = buffer.slice(start, position);
      if (token.length > MAX_RECORD) {
        throw new Error('Backup token exceeds byte limit');
      }
      JSON.parse(token);
      yield token;
    }
    buffer = buffer.slice(position);
    if (buffer.length > MAX_RECORD) {
      throw new Error('Backup token exceeds byte limit');
    }
  }
  if (buffer.trim()) {
    JSON.parse(buffer);
    yield buffer.trim();
  }
}

/** Read the existing [{rows: [...], tableName: ...}] format one row at a time. */
export async function* parseBackup(source: AsyncIterable<Buffer>): AsyncGenerator<BackupEvent> {
  const iterator = tokens(source);
  let token: string | undefined;
  const at = (): string | undefined => token;
  const next = async (): Promise<void> => {
    const result = await iterator.next();
    token = result.done ? undefined : result.value;
  };
  const expect = async (value: string): Promise<void> => {
    if (at() !== value) {
      throw new Error(`Invalid backup: expected ${value}`);
    }
    await next();
  };
  try {
    await next();
    await expect('[');
    let table = 0;
    while (at() !== ']') {
      await expect('{');
      let name: string | undefined,
        rowsSeen = false;
      const keys = new Set<string>();
      for (;;) {
        if (!token?.startsWith('"')) {
          throw new Error('Invalid backup key');
        }
        const key = JSON.parse(token) as string;
        if (keys.has(key)) {
          throw new Error('Invalid duplicate backup key');
        }
        keys.add(key);
        await next();
        await expect(':');
        if (key === 'tableName') {
          const value: unknown = JSON.parse(at() ?? 'null');
          if (typeof value !== 'string' || value.length > 100) {
            throw new Error('Invalid table name');
          }
          name = value;
          await next();
        } else if (key === 'rows') {
          rowsSeen = true;
          await expect('[');
          while (at() !== ']') {
            if (at() !== '{') {
              throw new Error('Backup row must be an object');
            }
            let depth = 0,
              size = 0;
            const parts: string[] = [];
            do {
              if (at() === undefined) {
                throw new Error('Incomplete backup row');
              }
              size += Buffer.byteLength(token);
              if (size > MAX_RECORD) {
                throw new Error('Backup row exceeds byte limit');
              }
              parts.push(token);
              if (at() === '{' || at() === '[') {
                depth++;
              }
              if (at() === '}' || at() === ']') {
                depth--;
              }
              await next();
            } while (depth > 0);
            const row = JSON.parse(parts.join('')) as Record<string, unknown>;
            yield { kind: 'row', table, row };
            if (at() === ']') {
              break;
            }
            await expect(',');
            if (at() === ']') {
              throw new Error('Trailing comma in rows');
            }
          }
          await expect(']');
        } else {
          throw new Error('Unknown backup field');
        }
        if (at() === '}') {
          break;
        }
        await expect(',');
      }
      await expect('}');
      if (!rowsSeen || name === undefined) {
        throw new Error('Incomplete backup table');
      }
      yield { kind: 'table', table, name };
      table++;
      if (at() === ']') {
        break;
      }
      await expect(',');
      if (at() === ']') {
        throw new Error('Trailing comma in tables');
      }
    }
    await expect(']');
    if (at() !== undefined) {
      throw new Error('Trailing backup data');
    }
  } finally {
    await iterator.return(undefined);
  }
}
