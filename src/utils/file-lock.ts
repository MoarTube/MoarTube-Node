import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Only protects an on-disk configuration file; it never opens a database. */
export function acquireFileLock(resource: string): () => void {
  const directory = resource + '.writer-lock';
  const owner = `${String(process.pid)}-${randomUUID()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.mkdirSync(directory);
      try {
        fs.writeFileSync(path.join(directory, owner), '', { flag: 'wx', mode: 0o600 });
      } catch (error) {
        try {
          fs.rmdirSync(directory);
        } catch {
          /* another owner wins */
        }
        throw error;
      }
      return () => {
        fs.unlinkSync(path.join(directory, owner));
        fs.rmdirSync(directory);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      const entries = fs.readdirSync(directory);
      const previous = entries[0];
      if (entries.length !== 1 || previous === undefined || !/^\d+-[a-f0-9-]+$/.test(previous)) {
        break;
      }
      try {
        process.kill(Number(previous.split('-')[0]), 0);
        break;
      } catch (failure) {
        if ((failure as NodeJS.ErrnoException).code !== 'ESRCH') {
          break;
        }
      }
      try {
        fs.unlinkSync(path.join(directory, previous));
        fs.rmdirSync(directory);
      } catch {
        /* concurrent recovery must not remove a new owner's file */
      }
    }
  }
  throw new Error('Another settings change or job admission is in progress.');
}
