import { describe, expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { createBackup, restoreBackup } from '@/database/backup.js';
import { createVideosRepository } from '@/database/repositories/videos/index.js';
import { createCommentsRepository } from '@/database/repositories/comments/index.js';
import { openTestDatabase, video, comment } from './helpers.js';
describe('PostgreSQL backup streaming and restore (real database)', () => {
  it('round-trips records, preserves booleans and IDs, resets sequences, and rolls back failed restores', async () => {
    const fixture = await openTestDatabase();
    try {
      const videos = createVideosRepository('postgres', fixture.db);
      const comments = createCommentsRepository('postgres', fixture.db);
      await videos.create({ ...video('recording'), is_published: true });
      await comments.create(comment('recording', 100));
      const config = { dialect: 'postgres' as const, postgresUrl: fixture.url };
      const backup = await createBackup(config);
      try {
        const data = JSON.parse(await readFile(backup.file, 'utf8'));
        expect(data[0].rows[0]).toMatchObject({ video_id: 'recording', is_published: true });
        await videos.deleteAll();
        await comments.deleteAll();
        await restoreBackup(backup.file, config);
        expect(await videos.findById('recording')).toMatchObject({ is_published: true });
        const next = await comments.create(comment('recording', 101));
        expect(next.comment_id).toBeGreaterThan(data[1].rows[0].comment_id);
        data[0].rows[0].title = null;
        await writeFile(backup.file, JSON.stringify(data));
        await expect(restoreBackup(backup.file, config)).rejects.toThrow();
        expect(await videos.findById('recording')).toMatchObject({ title: 'Video recording' });
      } finally {
        await backup.dispose();
      }
    } finally {
      await fixture.close();
    }
  });
});
