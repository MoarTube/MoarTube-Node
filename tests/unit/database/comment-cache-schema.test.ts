import { describe, it, expect } from 'vitest';
import { getTableConfig as sqliteConfig } from 'drizzle-orm/sqlite-core';
import { getTableConfig as postgresConfig } from 'drizzle-orm/pg-core';
import * as sqlite from '@/database/schemas/sqlite/index.js';
import * as postgres from '@/database/schemas/postgres/index.js';

describe('comment cache index contracts', () => {
  it('keeps history, relationship and delta lookup indexes in both schemas', () => {
    for (const configs of [
      [
        sqliteConfig(sqlite.comments),
        sqliteConfig(sqlite.commentEdges),
        sqliteConfig(sqlite.commentChanges),
      ],
      [
        postgresConfig(postgres.comments),
        postgresConfig(postgres.commentEdges),
        postgresConfig(postgres.commentChanges),
      ],
    ]) {
      expect(
        configs.flatMap((config) => config.indexes.map((index) => index.config.name)).sort()
      ).toEqual([
        'comment_changes_identity',
        'comment_changes_video',
        'comment_edges_source',
        'comments_history',
      ]);
      expect(configs[1].primaryKeys).toHaveLength(1);
    }
  });
});
