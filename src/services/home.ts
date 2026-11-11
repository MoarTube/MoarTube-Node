import { createHash } from 'node:crypto';
import { getConfig } from '@/config/index.js';
import { viewerMediaBase } from '@/utils/viewer-urls.js';
import type { HomeRepository, HomeVideo, HomeComment } from '@/database/repositories/home.js';
import { HomeResetError, type HomeQuery } from '@/database/repositories/home.js';

export const homeHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
type HomePage<Kind extends 'videos' | 'comments'> = Omit<
  Awaited<ReturnType<HomeRepository['page']>>,
  'items'
> & {
  items: undefined;
  snapshot: string;
  epoch: string;
  revision: string;
} & (Kind extends 'videos' ? { videos: HomeVideo[] } : { comments: HomeComment[] });

export class HomeService {
  constructor(private readonly repository: HomeRepository) {}

  settings() {
    const settings = getConfig().nodeSettings;
    return {
      nodeName: settings.nodeName,
      nodeHeadline: settings.nodeHeadline,
      nodeAbout: settings.nodeAbout,
      nodeBulletin: settings.nodeBulletin,
      nodeLinks: settings.nodeLinks,
      mediaBase: viewerMediaBase(settings),
    };
  }

  async state() {
    const state = await this.repository.state();
    const settingsRevision = homeHash(this.settings());
    const window = Math.floor(Date.now() / 30_000);
    return {
      epoch: state.epoch,
      revision: homeHash([state.epoch, state.catalog, state.comments, settingsRevision, window]),
      commentsRevision: homeHash([state.epoch, state.catalog, state.comments, settingsRevision]),
      tagsRevision: homeHash([state.epoch, state.catalog]),
      commentsVersion: state.comments,
      settingsRevision,
      catalogRevision: state.catalog,
      safetyRevision: state.safety,
      statsRevision: window,
      rankingWindow: window,
    };
  }

  async page<Kind extends 'videos' | 'comments'>(
    kind: Kind,
    query: HomeQuery,
    input: { epoch?: string; revision?: string; snapshot?: string; cursor: number }
  ): Promise<HomePage<Kind>>;
  async page(
    kind: 'videos' | 'comments',
    query: HomeQuery,
    input: { epoch?: string; revision?: string; snapshot?: string; cursor: number }
  ): Promise<HomePage<'videos' | 'comments'>> {
    const state = await this.state();
    const revision = kind === 'comments' ? state.commentsRevision : state.revision;
    if (input.epoch !== undefined && input.epoch !== state.epoch) {
      throw new HomeResetError('The node data changed. Refresh to continue.');
    }
    const starting = input.cursor === 0 && input.snapshot === undefined;
    const requestedRevision = starting ? revision : (input.revision ?? revision);
    const snapshot = homeHash([
      state.epoch,
      requestedRevision,
      kind,
      kind === 'videos'
        ? [query.searchTerm, query.tagTerm, query.sortTerm]
        : [query.tagTerm, query.commentSearch ?? ''],
    ]);
    if (input.snapshot !== undefined && input.snapshot !== snapshot) {
      throw new HomeResetError('This cursor belongs to a different search.');
    }
    if (starting) {
      await this.repository.ensureSnapshot(
        snapshot,
        revision,
        kind,
        query,
        Date.now(),
        state.safetyRevision
      );
      const after = await this.state();
      // Crossing a ranking time window does not invalidate the snapshot just built.
      if (after.commentsRevision !== state.commentsRevision) {
        throw new HomeResetError('Results changed while loading. Please retry.');
      }
    } else if (input.snapshot === undefined) {
      throw new HomeResetError('A snapshot is required to continue this list.');
    }
    const page = await this.repository.page(
      snapshot,
      input.cursor,
      kind === 'comments' ? 10 : 30,
      kind
    );
    return {
      ...page,
      ...(kind === 'videos'
        ? { videos: page.items as HomeVideo[] }
        : { comments: page.items as HomeComment[] }),
      items: undefined,
      snapshot,
      epoch: state.epoch,
      revision: requestedRevision,
    };
  }

  async tags(query: HomeQuery, input: { epoch?: string; revision?: string; cursor: number }) {
    const before = await this.state();
    if (
      (input.epoch !== undefined && input.epoch !== before.epoch) ||
      (input.cursor > 0 && input.revision !== undefined && input.revision !== before.tagsRevision)
    ) {
      throw new HomeResetError('Refresh the tag catalog.');
    }
    const tags = await this.repository.tags(query, input.cursor);
    const after = await this.state();
    if (before.tagsRevision !== after.tagsRevision) {
      throw new HomeResetError('The tag catalog changed while loading.');
    }
    return { ...tags, epoch: before.epoch, revision: before.tagsRevision };
  }
}
