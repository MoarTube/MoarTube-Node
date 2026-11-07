import type { FastifyRequest, FastifyReply } from 'fastify';
import type { HomeService } from '@/services/home.js';
import { HomeResetError, type HomeQuery } from '@/database/repositories/home.js';
import { COMMENT_STATE_CACHE_CONTROL, COMMENT_DATA_CACHE_CONTROL } from '@/utils/comment-cache.js';
import { pageCanonicalOrigin } from '@/utils/viewer-urls.js';

export interface HomeReadQuery extends HomeQuery {
  epoch?: string;
  revision?: string;
  snapshot?: string;
  cursor: number;
  fresh?: string;
  view: string;
}

export class HomeController {
  constructor(private readonly home: HomeService) {}

  private publicRead(request: FastifyRequest, reply: FastifyReply, data = false): void {
    const query = request.query as HomeReadQuery;
    if (
      request.headers.authorization === undefined &&
      query.fresh !== '1' &&
      (!data || (query.epoch !== undefined && query.revision !== undefined))
    ) {
      reply.header(
        'Cache-Control',
        data ? COMMENT_DATA_CACHE_CONTROL : COMMENT_STATE_CACHE_CONTROL
      );
    }
  }

  page = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');
    const state = await this.home.state();
    const model = {
      settings: this.home.settings(),
      state,
      query: request.query,
      canonicalOrigin: await pageCanonicalOrigin(request),
    };
    this.publicRead(request, reply);
    // Escape script delimiters even when saved settings contain HTML-like plain text.
    return reply.view('index.ejs', {
      model,
      bootstrap: JSON.stringify(model)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029'),
    });
  };

  read =
    (kind: 'state' | 'videos' | 'comments' | 'tags' | 'settings') =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as HomeReadQuery;
        if (kind === 'state') {
          const data = await this.home.state();
          this.publicRead(request, reply);
          return await reply.send(data);
        }
        if (kind === 'settings') {
          const before = await this.home.state();
          if (
            (query.epoch !== undefined && query.epoch !== before.epoch) ||
            (query.revision !== undefined && query.revision !== before.settingsRevision)
          ) {
            throw new HomeResetError('Settings changed. Refresh to continue.');
          }
          const settings = this.home.settings();
          const after = await this.home.state();
          if (before.settingsRevision !== after.settingsRevision) {
            throw new HomeResetError('Settings changed while loading.');
          }
          this.publicRead(request, reply, true);
          return await reply.send({
            settings,
            epoch: before.epoch,
            revision: before.settingsRevision,
          });
        }
        const result =
          kind === 'tags'
            ? await this.home.tags(query, query)
            : await this.home.page(kind, query, query);
        // A new search can advance an old revision. Cache only under its actual version.
        if (query.epoch === result.epoch && query.revision === result.revision) {
          this.publicRead(request, reply, true);
        }
        return await reply.send(result);
      } catch (error) {
        reply.header('Cache-Control', 'no-store');
        if (error instanceof HomeResetError) {
          return reply.status(409).send({ reset: true, message: error.message });
        }
        request.log.error(error, 'Homepage read failed');
        return reply.status(500).send({ message: 'Unable to load this section. Please retry.' });
      }
    };
}
